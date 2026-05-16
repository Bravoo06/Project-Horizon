import { useRef, useEffect, useCallback } from 'react';
import useGeolocation from '../hooks/useGeolocation';
import useCompass from '../hooks/useCompass';
import MarkColorPicker from './MarkColorPicker';
import { bearingTo, bearingDiff, bearingToCardinal, distanceMetres } from '../utils/bearing';
import styles from './SpyglassView.module.css';

// Beam only rendered within ±TOLERANCE_DEG of the user's heading
const TOLERANCE_DEG = 25;

// Distance zones (metres)
const MAX_VISIBLE_M = 5000;
const NEAR_ZONE_M   = 500;

// ── Distance → visual properties ─────────────────────────────────────────
function computeBeamProps(distM) {
  if (distM >= MAX_VISIBLE_M) return null;
  let width, opacity, orbRadius;
  if (distM >= NEAR_ZONE_M) {
    const t = 1 - (distM - NEAR_ZONE_M) / (MAX_VISIBLE_M - NEAR_ZONE_M);
    width     = lerp(2,    4,    t);
    opacity   = lerp(0.2,  0.35, t);
    orbRadius = lerp(4,    7,    t);
  } else {
    const t = 1 - distM / NEAR_ZONE_M;
    width     = lerp(4,    12,   t);
    opacity   = lerp(0.35, 0.9,  t);
    orbRadius = lerp(7,    18,   t);
  }
  return { width, opacity, orbRadius, haloRadius: orbRadius * 2.5 };
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ─────────────────────────────────────────────
// SpyglassView
// Live camera + compass overlay + beam renderer
// Props:
//   marks          – array from useMarks
//   selectedColor  – hex string for new marks
//   usedColors     – Set of hex strings already in use
//   onColorChange  – (color: string) => void
//   onAddMark      – ({ originLat, originLng, bearing, color }) => void
// ─────────────────────────────────────────────
export default function SpyglassView({ marks, selectedColor, usedColors, onColorChange, onAddMark }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  const { position, error: gpsError } = useGeolocation();
  const { bearing, beta, error: compassError, requestPermission } = useCompass();

  // ── Camera ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 } },
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        console.error('Camera access denied:', e);
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => { requestPermission(); }, [requestPermission]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const syncSize = () => {
      canvas.width  = video.videoWidth  || window.innerWidth;
      canvas.height = video.videoHeight || window.innerHeight;
    };
    video.addEventListener('loadedmetadata', syncSize);
    return () => video.removeEventListener('loadedmetadata', syncSize);
  }, []);

  // ── Beam + orb render loop ─────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (bearing !== null && position) {
      const h = canvas.height;

      marks.forEach((mark) => {
        if (mark.visited) return;

        // Distance gate
        const dist = distanceMetres(position.lat, position.lng, mark.lat, mark.lng);
        const props = computeBeamProps(dist);
        if (!props) return;

        // Bearing gate
        const markBearing = bearingTo(position.lat, position.lng, mark.lat, mark.lng);
        const diff = bearingDiff(bearing, markBearing);
        if (Math.abs(diff) > TOLERANCE_DEG) return;

        // Horizontal screen position
        const x = (0.5 + diff / (TOLERANCE_DEG * 2)) * canvas.width;

        // ── Vertical position: blend tilt (near) ↔ distance-horizon (far) ──
        // beta=90 → phone upright (camera horizontal) → orbY at centre
        // beta<90 → camera points upward              → orbY rises
        // beta>90 → camera points downward            → orbY falls
        const tiltY = beta !== null
          ? (beta * h) / 90 - h / 2
          : null;

        // Far marks appear near horizon (upper screen); near marks lower
        const distFrac  = clamp(dist / 1000, 0, 1);
        const distY     = lerp(0.68 * h, 0.28 * h, distFrac);

        // Near (dist<200m) → full tilt; far (dist>1km) → full horizon
        const tiltWeight = tiltY !== null ? clamp(1 - dist / 1000, 0, 1) : 0;
        const orbY = clamp(lerp(distY, tiltY ?? distY, tiltWeight), 0.08 * h, 0.92 * h);

        // Occlusion dims the beam significantly
        const baseOpacity = props.opacity;
        const finalOpacity = (mark.occluded ?? false)
          ? Math.min(baseOpacity, 0.15)
          : baseOpacity;

        const { orbRadius, haloRadius } = props;

        // ── Beam (drawn from top down to orbY) ────────────────────────────
        const grad = ctx.createLinearGradient(0, 0, 0, orbY);
        grad.addColorStop(0,    mark.color + '00');
        grad.addColorStop(0.18, mark.color);
        grad.addColorStop(1,    mark.color);

        ctx.save();
        ctx.globalAlpha = finalOpacity;
        ctx.shadowColor = mark.color;
        ctx.shadowBlur  = props.width * 2;
        ctx.strokeStyle = grad;
        ctx.lineWidth   = props.width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, orbY);
        ctx.stroke();
        ctx.restore();

        // ── Orb at beam tip ───────────────────────────────────────────────
        // Outer halo
        const haloGrad = ctx.createRadialGradient(x, orbY, 0, x, orbY, haloRadius);
        haloGrad.addColorStop(0,   mark.color + 'aa');
        haloGrad.addColorStop(0.5, mark.color + '44');
        haloGrad.addColorStop(1,   mark.color + '00');
        ctx.save();
        ctx.globalAlpha = finalOpacity * 0.6;
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(x, orbY, haloRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Solid core
        const coreGrad = ctx.createRadialGradient(
          x - orbRadius * 0.25, orbY - orbRadius * 0.3, 0,
          x, orbY, orbRadius,
        );
        coreGrad.addColorStop(0,    '#ffffff');
        coreGrad.addColorStop(0.28, mark.color);
        coreGrad.addColorStop(1,    mark.color + '00');
        ctx.save();
        ctx.globalAlpha = mark.occluded ? 0.4 : 0.95;
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(x, orbY, orbRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Specular highlight
        if (orbRadius > 6) {
          ctx.save();
          ctx.globalAlpha = mark.occluded ? 0.2 : 0.88;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x - orbRadius * 0.28, orbY - orbRadius * 0.35, orbRadius * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Occlusion warning dot
        if (mark.occluded && orbRadius > 5) {
          ctx.save();
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = '#ffcc00';
          ctx.beginPath();
          ctx.arc(x + orbRadius * 0.7, orbY - orbRadius * 0.7, orbRadius * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [marks, bearing, beta, position]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // ── Tap to place mark ─────────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    if (!position || bearing === null) return;
    onAddMark({ originLat: position.lat, originLng: position.lng, bearing, color: selectedColor });
  }, [position, bearing, selectedColor, onAddMark]);

  const compassLabel = bearing !== null
    ? `${bearingToCardinal(bearing)} ${bearing}°`
    : 'Calibrating…';

  return (
    <div className={styles.container}>
      <video ref={videoRef} className={styles.video} autoPlay playsInline muted />
      <canvas ref={canvasRef} className={styles.canvas} onClick={handleTap} />

      <div className={styles.compassBar}>
        <CompassTicks bearing={bearing} />
        <span className={styles.bearingLabel}>{compassLabel}</span>
      </div>

      {(gpsError || compassError) && (
        <div className={styles.errorBanner}>
          {gpsError    && <span>GPS: {gpsError}</span>}
          {compassError && <span>Compass: {compassError}</span>}
        </div>
      )}

      {position && bearing !== null && (
        <p className={styles.tapHint}>Tap to mark this direction</p>
      )}
      {(!position || bearing === null) && !gpsError && !compassError && (
        <p className={styles.tapHint}>Waiting for GPS &amp; compass…</p>
      )}

      <div className={styles.pickerWrapper}>
        <MarkColorPicker
          selectedColor={selectedColor}
          onColorChange={onColorChange}
          usedColors={usedColors}
        />
      </div>
    </div>
  );
}

function CompassTicks({ bearing }) {
  if (bearing === null) return null;
  const ticks = [];
  for (let i = -4; i <= 4; i++) {
    const deg = ((bearing + i * 10) + 360) % 360;
    ticks.push(
      <span
        key={i}
        className={styles.tick}
        style={{ opacity: 1 - Math.abs(i) * 0.18, fontWeight: i === 0 ? '700' : '400' }}
      >
        {snapToCardinal(deg)}
      </span>
    );
  }
  return <div className={styles.ticks}>{ticks}</div>;
}

function snapToCardinal(deg) {
  const map = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW', 360: 'N' };
  return map[Math.round(deg / 10) * 10] ?? `${Math.round(deg / 10) * 10}°`;
}