const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;
const EARTH_R = 6_371_000; // metres

// Haversine distance in metres between two lat/lng coordinates.
export function distanceMetres(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * TO_RAD;
  const dLng = (lng2 - lng1) * TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * TO_RAD) * Math.cos(lat2 * TO_RAD) * Math.sin(dLng / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Forward azimuth (bearing) from point A → B, in degrees [0, 360).
// 0° = North, 90° = East, clockwise.
export function bearingTo(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * TO_RAD;
  const y = Math.sin(dLng) * Math.cos(lat2 * TO_RAD);
  const x =
    Math.cos(lat1 * TO_RAD) * Math.sin(lat2 * TO_RAD) -
    Math.sin(lat1 * TO_RAD) * Math.cos(lat2 * TO_RAD) * Math.cos(dLng);
  return ((Math.atan2(y, x) * TO_DEG) + 360) % 360;
}

// Signed angular difference between two bearings, result in [-180, 180].
// Positive = b is clockwise from a.
export function bearingDiff(a, b) {
  return ((b - a + 180 + 360) % 360) - 180;
}

// Project a point `distanceM` metres from (lat, lng) along `bearing`.
// Returns { lat, lng } of the destination.
export function projectPoint(lat, lng, bearing, distanceM) {
  const d = distanceM / EARTH_R;
  const bearRad = bearing * TO_RAD;
  const latRad = lat * TO_RAD;
  const lngRad = lng * TO_RAD;

  const lat2 = Math.asin(
    Math.sin(latRad) * Math.cos(d) +
    Math.cos(latRad) * Math.sin(d) * Math.cos(bearRad)
  );
  const lng2 =
    lngRad +
    Math.atan2(
      Math.sin(bearRad) * Math.sin(d) * Math.cos(latRad),
      Math.cos(d) - Math.sin(latRad) * Math.sin(lat2)
    );

  return { lat: lat2 * TO_DEG, lng: lng2 * TO_DEG };
}

// Convert a bearing in degrees to an 8-point cardinal direction string.
export function bearingToCardinal(b) {
  if (b == null) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(b / 45) % 8];
}
