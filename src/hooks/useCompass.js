import { useState, useEffect, useCallback, useRef } from 'react';

const ALPHA = 0.15;

// Reads compass bearing + device pitch (beta) from DeviceOrientation events.
//
// Returns:
//   bearing          – heading 0–360° (0 = North, clockwise), or null
//   beta             – raw device pitch in degrees (0 = flat, 90 = upright), or null
//   error            – string if permission denied or unsupported
//   requestPermission – call from a user-gesture (required on iOS 13+)
export default function useCompass() {
  const [bearing, setBearing] = useState(null);
  const [beta, setBeta] = useState(null);
  const [error, setError] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const filteredRef = useRef(null);

  const requestPermission = useCallback(async () => {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result === 'granted') {
          setPermissionGranted(true);
        } else {
          setError('Compass permission denied');
        }
      } catch (e) {
        setError(e.message);
      }
    } else {
      setPermissionGranted(true);
    }
  }, []);

  useEffect(() => {
    if (!permissionGranted) return;

    const handleOrientation = (e) => {
      // ── Bearing (horizontal heading) ─────────────────────────────────────
      let raw;
      if (e.webkitCompassHeading != null) {
        raw = e.webkitCompassHeading;
      } else if (e.alpha != null) {
        raw = (360 - e.alpha) % 360;
      } else {
        return;
      }

      if (filteredRef.current === null) {
        filteredRef.current = raw;
      } else {
        let diff = raw - filteredRef.current;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        filteredRef.current = (filteredRef.current + ALPHA * diff + 360) % 360;
      }
      setBearing(Math.round(filteredRef.current));

      // ── Pitch (beta) — no filtering needed for smooth AR positioning ──────
      if (e.beta != null) setBeta(e.beta);
    };

    const eventName =
      'ondeviceorientationabsolute' in window
        ? 'deviceorientationabsolute'
        : 'deviceorientation';

    window.addEventListener(eventName, handleOrientation, true);
    return () => window.removeEventListener(eventName, handleOrientation, true);
  }, [permissionGranted]);

  return { bearing, beta, error, requestPermission };
}