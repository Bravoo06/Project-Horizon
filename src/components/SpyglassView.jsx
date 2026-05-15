import { useRef, useEffect, useCallback } from 'react';
import useGeolocation from '../hooks/useGeolocation';
import useCompass from '../hooks/useCompass';
import MarkColorPicker from './MarkColorPicker';
import { bearingTo, bearingDiff, bearingToCardinal, distanceMetres } from '../utils/bearing';
import styles from './SpyglassView.module.css';

// Beam is only rendered when the user points within ±TOLERANCE degrees.
const TOLERANCE_DEG = 25;

// Distance zones (metres)
const MAX_VISIBLE_M = 5000;  // beyond this: invisible
const NEAR_ZONE_M   = 500;   // below this: progressive brightness ramp

// ── Distance → visual properties ────────────────────────────────────────────
// Returns null when the mark is beyond MAX_VISIBLE_M.
// Two-segment linear interpolation:
//   Far  (500m–5km): width 2→4 px,  opacity 0.2→0.35, orb 4→7 px
//   Near (0–500m):   width 4→12 px, opacity 0.35→0.9,  orb 7→18 px
function computeBeamProps(distM) {
  if (distM >= MAX_VISIBLE_M) return null;

  let width, opacity, orbRadius;

  if (distM >= NEAR_ZONE_M) {
    const t = 1 - (distM - NEAR_ZONE_M) / (MAX_VISIBLE_M - NEAR_ZONE_M);
    width     = lerp(2,  4,  t);
    opacity   = lerp(0.2, 0.35, t);
    orbRadius = lerp(4,  7,  t);
  } else {
    const t = 1 - distM / NEAR_ZONE_M;
    width     = lerp(4,  12, t);
    opacity   = lerp(0.35, 0.9, t);
    orbRadius = lerp(7,  18, t);
  }

  return { width, opacity, orbRadius, haloRadius: orbRadius * 2.5 };
}

function lerp(a, b, t) { return a + (b - a) * t; }

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
  const { bearing, error: compassError, requestPermission } = useCompass();

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

  // ── Compass permission (iOS 13+ needs a user-gesture trigger) ─────────────
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  // ── Sync canvas size to video resolution ──────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const syncSize = () => {
      canvas.width = video.videoWidth || window.innerWidth;
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
      marks.forEach((mark) => {
        if (mark.visited) return;

        // Distance gate — skip marks that are too far away
        const dist = distanceMetres(position.lat, position.lng, mark.lat, mark.lng);
        const props = computeBeamProps(dist);
        if (!props) return;

        // Bearing gate — only render when user is facing within ±TOLERANCE_DEG
        const markBearing = bearingTo(position.lat, position.lng, mark.lat, mark.lng);
        const diff = bearingDiff(bearing, markBearing);
        if (Math.abs(diff) > TOLERANCE_DEG) return;

        // Map angular offset to horizontal screen position.
        // diff=0 → canvas centre, ±TOLERANCE_DEG → screen edges.
        const xFrac = 0.5 + diff / (TOLERANCE_DEG * 2);
        const x = xFrac * canvas.width;
        const h = canvas.height;

        // ── Beam ──────────────────────────────────────────────────────────
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0,   mark.color + '00');
        grad.addColorStop(0.1, mark.color);
        grad.addColorStop(0.9, mark.color);
        grad.addColorStop(1,   mark.color + '00');

        ctx.save();
        ctx.globalAlpha = props.opacity;
        ctx.shadowColor = mark.color;
        ctx.shadowBlur  = props.width * 2;
        ctx.strokeStyle = grad;
        ctx.lineWidth   = props.width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.restore();

        // ── Orb at beam base ───────────────────────────────────────────────
        const { orbRadius, haloRadius } = props;
        const orbY = h - orbRadius - 6;

        // Outer halo
        const haloGrad = ctx.createRadialGradient(x, orbY, 0, x, orbY, haloRadius);
        haloGrad.addColorStop(0,   mark.color + 'aa');
        haloGrad.addColorStop(0.5, mark.color + '44');
        haloGrad.addColorStop(1,   mark.color + '00');
        ctx.save();
        ctx.globalAlpha = props.opacity * 0.6;
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
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(x, orbY, orbRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Specular highlight — only shown when orb is large enough to be visible
        if (orbRadius > 6) {
          ctx.save();
          ctx.globalAlpha = 0.88;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(
            x - orbRadius * 0.28,
            orbY - orbRadius * 0.35,
            orbRadius * 0.25,
            0, Math.PI * 2,
          );
          ctx.fill();
          ctx.restore();
        }
      });
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [marks, bearing, position]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // ── Tap to place mark ─────────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    if (!position || bearing === null) return;
    onAddMark({
      originLat: position.lat,
      originLng: position.lng,
      bearing,
      color: selectedColor,
    });
  }, [position, bearing, selectedColor, onAddMark]);

  // ── Compass tick strip ────────────────────────────────────────────────────
  const compassLabel =
    bearing !== null
      ? `${bearingToCardinal(bearing)} ${bearing}°`
      : 'Calibrating…';

  return (
    <div className={styles.container}>
      {/* Live rear-camera feed */}
      <video ref={videoRef} className={styles.video} autoPlay playsInline muted />

      {/* Canvas receives taps and shows beams */}
      <canvas ref={canvasRef} className={styles.canvas} onClick={handleTap} />

      {/* ── Compass bar ─────────────────────────────────────────────────── */}
      <div className={styles.compassBar}>
        <CompassTicks bearing={bearing} />
        <span className={styles.bearingLabel}>{compassLabel}</span>
      </div>

      {/* ── Status / error banners ───────────────────────────────────────── */}
      {(gpsError || compassError) && (
        <div className={styles.errorBanner}>
          {gpsError && <span>GPS: {gpsError}</span>}
          {compassError && <span>Compass: {compassError}</span>}
        </div>
      )}

      {/* ── Tap hint ─────────────────────────────────────────────────────── */}
      {position && bearing !== null && (
        <p className={styles.tapHint}>Tap to mark this direction</p>
      )}
      {(!position || bearing === null) && !gpsError && !compassError && (
        <p className={styles.tapHint}>Waiting for GPS &amp; compass…</p>
      )}

      {/* ── Color picker ─────────────────────────────────────────────────── */}
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

// ── Compass tick strip ──────────────────────────────────────────────────────
function CompassTicks({ bearing }) {
  if (bearing === null) return null;

  const ticks = [];
  for (let i = -4; i <= 4; i++) {
    const deg = ((bearing + i * 10) + 360) % 360;
    const label = snapToCardinal(deg);
    ticks.push(
      <span
        key={i}
        className={styles.tick}
        style={{ opacity: 1 - Math.abs(i) * 0.18, fontWeight: i === 0 ? '700' : '400' }}
      >
        {label}
      </span>
    );
  }
  return <div className={styles.ticks}>{ticks}</div>;
}

function snapToCardinal(deg) {
  const map = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW', 360: 'N' };
  const snapped = Math.round(deg / 10) * 10;
  return map[snapped] ?? `${snapped}°`;
}