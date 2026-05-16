import { useEffect, useRef, useState, useCallback } from 'react';
import useGeolocation from '../hooks/useGeolocation';
import { distanceMetres, projectPoint } from '../utils/bearing';
import VisitModal from './VisitModal';
import styles from './MapView.module.css';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

const GEOFENCE_RADIUS_M = 50;
const FOV_HALF_ANGLE    = 30;   // 60° total field of view
const FOV_RADIUS_M      = 2000; // cone extends 2 km

// ── Elevation line-of-sight check ────────────────────────────────────────────
// Samples 5 elevation points between user and mark via the Elevation REST API.
// Returns true if any intermediate point rises >10 m above the straight line
// connecting the two endpoints (approximate building / hill occlusion).
async function fetchElevationOcclusion(lat1, lng1, lat2, lng2, key) {
  try {
    const pts = Array.from({ length: 5 }, (_, i) => {
      const t = i / 4;
      return `${lat1 + t * (lat2 - lat1)},${lng1 + t * (lng2 - lng1)}`;
    }).join('|');

    const res  = await fetch(
      `https://maps.googleapis.com/maps/api/elevation/json?locations=${pts}&key=${key}`
    );
    const data = await res.json();
    if (data.status !== 'OK' || !data.results?.length) return false;

    const elevs = data.results.map((r) => r.elevation);
    const e0 = elevs[0];
    const e4 = elevs[4];
    return elevs.slice(1, 4).some((e, i) => {
      const t = (i + 1) / 4;
      return e > e0 + t * (e4 - e0) + 10; // >10 m above line of sight
    });
  } catch {
    return false;
  }
}

// ── Build FOV polygon path ────────────────────────────────────────────────────
// Returns an array of {lat, lng} forming a fan-shape (apex → arc → close).
function buildFovPath(originLat, originLng, bearing) {
  const path = [{ lat: originLat, lng: originLng }];
  for (let i = 0; i <= 12; i++) {
    const angle = (bearing - FOV_HALF_ANGLE + i * (FOV_HALF_ANGLE * 2 / 12) + 360) % 360;
    const pt = projectPoint(originLat, originLng, angle, FOV_RADIUS_M);
    path.push({ lat: pt.lat, lng: pt.lng });
  }
  path.push({ lat: originLat, lng: originLng });
  return path;
}

// ─────────────────────────────────────────────
// MapView
// Props:
//   marks                – array from useMarks
//   onUpdateMarkPosition – (id, lat, lng) => void
//   onVisitMark          – (id) => void
//   onSetMarkOcclusion   – (id, bool) => void
// ─────────────────────────────────────────────
export default function MapView({ marks, onUpdateMarkPosition, onVisitMark, onSetMarkOcclusion }) {
  const mapDivRef        = useRef(null);
  const mapRef           = useRef(null);
  const markersRef       = useRef({});  // id → { marker, circle }
  const fovsRef          = useRef({});  // id → google.maps.Polygon
  const pendingMarkerRef = useRef(null);
  const userMarkerRef    = useRef(null);
  const promptedRef      = useRef(new Set());

  // Stable refs so intervals/closures always see fresh values
  const marksRef              = useRef(marks);
  const positionRef           = useRef(null);
  const onSetMarkOcclusionRef = useRef(onSetMarkOcclusion);
  marksRef.current              = marks;
  onSetMarkOcclusionRef.current = onSetMarkOcclusion;

  const [mapsReady,   setMapsReady]   = useState(!!window.google?.maps);
  const [pendingMark, setPendingMark] = useState(null); // visit modal
  const [pendingPin,  setPendingPin]  = useState(null); // placement confirmation
  const { position } = useGeolocation();
  positionRef.current = position;

  // ── Load Google Maps script ──────────────────────────────────────────────
  useEffect(() => {
    if (window.google?.maps) { setMapsReady(true); return; }
    const SCRIPT_ID = 'gmap-script';
    if (document.getElementById(SCRIPT_ID)) return;
    const s = document.createElement('script');
    s.id = SCRIPT_ID; s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=geometry`;
    s.onload = () => setMapsReady(true);
    s.onerror = () => console.error('Google Maps failed to load');
    document.head.appendChild(s);
  }, []);

  // ── Init map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsReady || !mapDivRef.current || mapRef.current) return;
    const center = position
      ? { lat: position.lat, lng: position.lng }
      : { lat: 45.4642, lng: 9.19 };
    mapRef.current = new window.google.maps.Map(mapDivRef.current, {
      center, zoom: 16, mapTypeId: 'hybrid',
      disableDefaultUI: true, gestureHandling: 'greedy', styles: DARK_OVERLAY,
    });
  }, [mapsReady, position]);

  // ── User location dot ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !position) return;
    const latlng = { lat: position.lat, lng: position.lng };
    if (!userMarkerRef.current) {
      userMarkerRef.current = new window.google.maps.Marker({
        position: latlng, map: mapRef.current, zIndex: 200,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 9, fillColor: '#4FC3F7', fillOpacity: 1,
          strokeColor: '#fff', strokeWeight: 2,
        },
      });
      mapRef.current.panTo(latlng);
    } else {
      userMarkerRef.current.setPosition(latlng);
    }
  }, [position]);

  // ── Sync overlays: FOV triangles (unplaced) + pins (placed) ─────────────
  const syncOverlays = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const currentIds = new Set(marks.map((m) => m.id));

    // Remove overlays for deleted marks
    for (const id of Object.keys(markersRef.current)) {
      if (!currentIds.has(id)) {
        markersRef.current[id].marker.setMap(null);
        markersRef.current[id].circle.setMap(null);
        delete markersRef.current[id];
      }
    }
    for (const id of Object.keys(fovsRef.current)) {
      if (!currentIds.has(id)) {
        fovsRef.current[id].setMap(null);
        delete fovsRef.current[id];
      }
    }

    marks.forEach((mark) => {
      const isUnplaced = mark.lat === mark.originLat && mark.lng === mark.originLng;

      // ── Visited: remove everything ─────────────────────────────────────
      if (mark.visited) {
        if (markersRef.current[mark.id]) {
          markersRef.current[mark.id].marker.setMap(null);
          markersRef.current[mark.id].circle.setMap(null);
          delete markersRef.current[mark.id];
        }
        if (fovsRef.current[mark.id]) {
          fovsRef.current[mark.id].setMap(null);
          delete fovsRef.current[mark.id];
        }
        return;
      }

      if (isUnplaced) {
        // Remove any stale pin overlay
        if (markersRef.current[mark.id]) {
          markersRef.current[mark.id].marker.setMap(null);
          markersRef.current[mark.id].circle.setMap(null);
          delete markersRef.current[mark.id];
        }
        // Create FOV polygon if not present
        if (!fovsRef.current[mark.id]) {
          const polygon = new window.google.maps.Polygon({
            paths: buildFovPath(mark.originLat, mark.originLng, mark.bearing),
            strokeColor: mark.color, strokeOpacity: 0.65, strokeWeight: 1.5,
            fillColor: mark.color, fillOpacity: 0.18,
            map, clickable: true, zIndex: 10,
          });

          polygon.addListener('click', (e) => {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            // Drop a preview pin at the tap position
            if (pendingMarkerRef.current) pendingMarkerRef.current.setMap(null);
            pendingMarkerRef.current = new window.google.maps.Marker({
              position: { lat, lng }, map, zIndex: 300,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 11, fillColor: mark.color, fillOpacity: 0.9,
                strokeColor: '#fff', strokeWeight: 2,
              },
            });
            setPendingPin({ markId: mark.id, lat, lng, color: mark.color });
          });

          fovsRef.current[mark.id] = polygon;
        }
      } else {
        // ── Placed mark ──────────────────────────────────────────────────
        // Remove any leftover FOV
        if (fovsRef.current[mark.id]) {
          fovsRef.current[mark.id].setMap(null);
          delete fovsRef.current[mark.id];
        }
        const pinLatLng = new window.google.maps.LatLng(mark.lat, mark.lng);
        if (!markersRef.current[mark.id]) {
          const marker = new window.google.maps.Marker({
            position: pinLatLng, map, draggable: true, zIndex: 100,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 11, fillColor: mark.color, fillOpacity: 0.9,
              strokeColor: '#fff', strokeWeight: 2,
            },
          });
          const circle = new window.google.maps.Circle({
            center: pinLatLng, radius: GEOFENCE_RADIUS_M, map,
            strokeColor: mark.color, strokeOpacity: 0.5, strokeWeight: 1,
            fillColor: mark.color, fillOpacity: 0.07,
          });
          marker.addListener('dragend', () => {
            const pos = marker.getPosition();
            circle.setCenter(pos);
            onUpdateMarkPosition(mark.id, pos.lat(), pos.lng());
          });
          marker.addListener('click', () => {
            const pos = marker.getPosition();
            window.open(
              `https://www.google.com/maps/dir/?api=1&destination=${pos.lat()},${pos.lng()}`,
              '_blank',
            );
          });
          markersRef.current[mark.id] = { marker, circle };
        } else {
          markersRef.current[mark.id].marker.setPosition(pinLatLng);
          markersRef.current[mark.id].circle.setCenter(pinLatLng);
        }
      }
    });
  }, [marks, onUpdateMarkPosition]);

  useEffect(() => {
    if (mapsReady && mapRef.current) syncOverlays();
  }, [mapsReady, syncOverlays]);

  // ── Pin placement confirmation ────────────────────────────────────────────
  const handlePinConfirm = useCallback(() => {
    if (!pendingPin) return;
    const { markId, lat, lng } = pendingPin;

    onUpdateMarkPosition(markId, lat, lng);

    if (pendingMarkerRef.current) {
      pendingMarkerRef.current.setMap(null);
      pendingMarkerRef.current = null;
    }
    setPendingPin(null);

    // Check elevation occlusion asynchronously
    if (API_KEY && onSetMarkOcclusion && positionRef.current) {
      fetchElevationOcclusion(
        positionRef.current.lat, positionRef.current.lng, lat, lng, API_KEY,
      ).then((occluded) => onSetMarkOcclusion(markId, occluded));
    }
  }, [pendingPin, onUpdateMarkPosition, onSetMarkOcclusion]);

  const handlePinCancel = useCallback(() => {
    if (pendingMarkerRef.current) {
      pendingMarkerRef.current.setMap(null);
      pendingMarkerRef.current = null;
    }
    setPendingPin(null);
  }, []);

  // ── Re-check elevation every 10 s as user moves ──────────────────────────
  useEffect(() => {
    if (!API_KEY) return;
    const id = setInterval(async () => {
      const pos       = positionRef.current;
      const setOcc    = onSetMarkOcclusionRef.current;
      if (!pos || !setOcc) return;
      for (const mark of marksRef.current) {
        if (mark.visited || mark.lat === mark.originLat) continue;
        const occ = await fetchElevationOcclusion(
          pos.lat, pos.lng, mark.lat, mark.lng, API_KEY,
        );
        setOcc(mark.id, occ);
      }
    }, 10_000);
    return () => clearInterval(id);
  }, []); // stable interval — reads latest values via refs

  // ── Geofence check ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!position || pendingMark) return;
    for (const mark of marks) {
      if (mark.visited || mark.lat === mark.originLat) continue; // skip unplaced
      if (promptedRef.current.has(mark.id)) continue;
      const d = distanceMetres(position.lat, position.lng, mark.lat, mark.lng);
      if (d <= GEOFENCE_RADIUS_M) {
        promptedRef.current.add(mark.id);
        setPendingMark(mark);
        break;
      }
    }
  }, [position, marks, pendingMark]);

  const handleVisitConfirm = useCallback(() => {
    if (pendingMark) onVisitMark(pendingMark.id);
    setPendingMark(null);
  }, [pendingMark, onVisitMark]);

  const handleVisitDismiss = useCallback(() => {
    if (pendingMark) promptedRef.current.delete(pendingMark.id);
    setPendingMark(null);
  }, [pendingMark]);

  return (
    <div className={styles.container}>
      {!API_KEY && (
        <div className={styles.keyWarning}>
          <strong>Missing API key.</strong> Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to your <code>.env</code> file.
        </div>
      )}
      <div ref={mapDivRef} className={styles.map} />

      {/* ── Pin placement confirmation card ─────────────────────────────── */}
      {pendingPin && (
        <div className={styles.confirmCard}>
          <p className={styles.confirmTitle}>Place mark here?</p>
          <p className={styles.confirmCoords}>
            {Math.abs(pendingPin.lat).toFixed(5)}°&thinsp;{pendingPin.lat >= 0 ? 'N' : 'S'},&ensp;
            {Math.abs(pendingPin.lng).toFixed(5)}°&thinsp;{pendingPin.lng >= 0 ? 'E' : 'W'}
          </p>
          <div className={styles.confirmActions}>
            <button
              className={styles.btnConfirm}
              style={{ '--accent': pendingPin.color }}
              onClick={handlePinConfirm}
            >
              Confirm location
            </button>
            <a
              className={styles.btnStreetView}
              href={`https://maps.google.com/?cbll=${pendingPin.lat},${pendingPin.lng}&layer=c`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Street View
            </a>
            <button className={styles.btnCancel} onClick={handlePinCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <VisitModal
        mark={pendingMark}
        onConfirm={handleVisitConfirm}
        onDismiss={handleVisitDismiss}
      />
    </div>
  );
}

const DARK_OVERLAY = [
  { elementType: 'labels.text.fill',   stylers: [{ color: '#e0e0e0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',     stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];