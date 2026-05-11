import { useState, useEffect, useCallback, useRef } from 'react';

// Low-pass smoothing factor: 0 = frozen, 1 = no smoothing.
// 0.15 removes jitter while still tracking fast rotation.
const ALPHA = 0.15;

// Reads compass bearing (0–360°, 0 = North, clockwise) from the device.
//
// Android Chrome: fires `deviceorientationabsolute` which gives true-North alpha.
// iOS 13+: fires `deviceorientation` with webkitCompassHeading; requires
//   requestPermission() to be called from a user-gesture handler.
//
// Returns:
//   bearing          – current heading in degrees, or null before first reading
//   error            – string if permission denied or unsupported
//   requestPermission – call this on a button tap (required on iOS 13+)
export default function useCompass() {
  const [bearing, setBearing] = useState(null);
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
      let raw;
      if (e.webkitCompassHeading != null) {
        // iOS: already an absolute bearing 0–360
        raw = e.webkitCompassHeading;
      } else if (e.alpha != null) {
        // Android deviceorientationabsolute: counter-clockwise, so invert
        raw = (360 - e.alpha) % 360;
      } else {
        return;
      }

      // Circular low-pass filter — handles the 0/360 wrap correctly
      if (filteredRef.current === null) {
        filteredRef.current = raw;
      } else {
        let diff = raw - filteredRef.current;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        filteredRef.current = (filteredRef.current + ALPHA * diff + 360) % 360;
      }
      setBearing(Math.round(filteredRef.current));
    };

    const eventName =
      'ondeviceorientationabsolute' in window
        ? 'deviceorientationabsolute'
        : 'deviceorientation';

    window.addEventListener(eventName, handleOrientation, true);
    return () => window.removeEventListener(eventName, handleOrientation, true);
  }, [permissionGranted]);

  return { bearing, error, requestPermission };
}