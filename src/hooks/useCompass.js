import { useState, useEffect, useCallback } from 'react';

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

  // Call this from a user-gesture (tap/click) to satisfy iOS permission API.
  // On Android it resolves immediately.
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
      // Android / desktop – no explicit permission step needed
      setPermissionGranted(true);
    }
  }, []);

  useEffect(() => {
    if (!permissionGranted) return;

    const handleOrientation = (e) => {
      let heading;
      if (e.webkitCompassHeading != null) {
        // iOS: already an absolute bearing 0–360
        heading = e.webkitCompassHeading;
      } else if (e.alpha != null) {
        // Android `deviceorientationabsolute`: alpha is degrees from North,
        // but the rotation is counter-clockwise, so we invert it.
        heading = (360 - e.alpha) % 360;
      } else {
        return;
      }
      setBearing(Math.round(heading));
    };

    // Prefer `deviceorientationabsolute` (true North) on Android;
    // fall back to `deviceorientation` for iOS (webkitCompassHeading covers it).
    const eventName =
      'ondeviceorientationabsolute' in window
        ? 'deviceorientationabsolute'
        : 'deviceorientation';

    window.addEventListener(eventName, handleOrientation, true);
    return () => window.removeEventListener(eventName, handleOrientation, true);
  }, [permissionGranted]);

  return { bearing, error, requestPermission };
}
