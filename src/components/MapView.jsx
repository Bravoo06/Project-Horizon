import { useEffect, useRef, useState, useCallback } from 'react';
import useGeolocation from '../hooks/useGeolocation';
import { distanceMetres, projectPoint } from '../utils/bearing';
import VisitModal from './VisitModal';
import styles from './MapView.module.css';

// Google Maps API key must be set in .env as VITE_GOOGLE_MAPS_API_KEY
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

// Geofence: prompt "did you visit?" when user is within this radius of a pin.
const GEOFENCE_RADIUS_M = 50;

// Default distance (m) for a newly placed mark before the user drags it.
const DEFAULT_MARK_DISTANCE_M = 300;

// ─────────────────────────────────────────────
// MapView
// Google Maps view with coloured draggable pins
// Props:
//   marks                – array from useMarks
//   onUpdateMarkPosition – (id, lat, lng) => void
//   onVisitMark          – (id) => void
// ─────────────────────────────────────────────
export default function MapView({ marks, onUpdateMarkPosition, onVisitMark }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);           // google.maps.Map instance
  const markersRef = useRef({});         // id → { marker, circle, projLine }
  const userMarkerRef = useRef(null);
  const promptedRef = useRef(new Set()); // ids already prompted this session

  const [mapsReady, setMapsReady] = useState(!!window.google?.maps);
  const [pendingMark, setPendingMark] = useState(null);
  const { position } = useGeolocation();

  // ── Load Google Maps script once ─────────────────────────────────────────
  useEffect(() => {
    if (window.google?.maps) { setMapsReady(true); return; }
    const SCRIPT_ID = 'gmap-script';
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=geometry`;
    script.onload = () => setMapsReady(true);
    script.onerror = () => console.error('Google Maps failed to load');
    document.head.appendChild(script);
  }, []);

  // ── Initialise map once script is ready ──────────────────────────────────
  useEffect(() => {
    if (!mapsReady || !mapDivRef.current || mapRef.current) return;

    const center = position
      ? { lat: position.lat, lng: position.lng }
      : { lat: 45.4642, lng: 9.19 }; // Milan fallback

    mapRef.current = new window.google.maps.Map(mapDivRef.current, {
      center,
      zoom: 16,
      mapTypeId: 'hybrid',
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      styles: DARK_OVERLAY,
    });
  }, [mapsReady, position]);

  // ── User location marker (blue dot) ──────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !position) return;
    const latlng = { lat: position.lat, lng: position.lng };

    if (!userMarkerRef.current) {
      userMarkerRef.current = new window.google.maps.Marker({
        position: latlng,
        map: mapRef.current,
        zIndex: 200,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#4FC3F7',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
      });
      mapRef.current.panTo(latlng);
    } else {
      userMarkerRef.current.setPosition(latlng);
    }
  }, [position]);

  // ── Sync mark pins to the map ─────────────────────────────────────────────
  // Each pin is:
  //   • A draggable circle marker (coloured to match the beam)
  //   • A faint circle showing the 50m geofence radius
  //   • A dashed polyline from origin along the bearing projection (visual guide
  //     for drag direction — so the user knows which way to pull the pin)
  const syncMarkers = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const currentIds = new Set(marks.map((m) => m.id));

    // Remove markers for deleted marks
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        const { marker, circle, projLine } = markersRef.current[id];
        marker.setMap(null);
        circle.setMap(null);
        projLine.setMap(null);
        delete markersRef.current[id];
      }
    });

    marks.forEach((mark) => {
      // Remove visited pins cleanly
      if (mark.visited) {
        if (markersRef.current[mark.id]) {
          const { marker, circle, projLine } = markersRef.current[mark.id];
          marker.setMap(null);
          circle.setMap(null);
          projLine.setMap(null);
          delete markersRef.current[mark.id];
        }
        return;
      }

      const pinLatLng = new window.google.maps.LatLng(mark.lat, mark.lng);

      if (!markersRef.current[mark.id]) {
        // ── First time: place the pin at DEFAULT_MARK_DISTANCE_M if still at origin ──
        let initialLat = mark.lat;
        let initialLng = mark.lng;
        if (mark.lat === mark.originLat && mark.lng === mark.originLng) {
          const projected = projectPoint(mark.originLat, mark.originLng, mark.bearing, DEFAULT_MARK_DISTANCE_M);
          initialLat = projected.lat;
          initialLng = projected.lng;
          // Persist this initial projection immediately
          onUpdateMarkPosition(mark.id, initialLat, initialLng);
        }

        const initLatLng = new window.google.maps.LatLng(initialLat, initialLng);

        // Draggable pin
        const marker = new window.google.maps.Marker({
          position: initLatLng,
          map,
          draggable: true,
          zIndex: 100,
          title: 'Drag to set distance',
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 11,
            fillColor: mark.color,
            fillOpacity: 0.9,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
        });

        // Geofence radius circle
        const circle = new window.google.maps.Circle({
          center: initLatLng,
          radius: GEOFENCE_RADIUS_M,
          map,
          strokeColor: mark.color,
          strokeOpacity: 0.5,
          strokeWeight: 1,
          fillColor: mark.color,
          fillOpacity: 0.07,
        });

        // Dashed projection line from origin along the bearing direction
        // (1 km horizon so user can see the direction to drag)
        const horizonPt = projectPoint(mark.originLat, mark.originLng, mark.bearing, 1000);
        const projLine = new window.google.maps.Polyline({
          path: [
            { lat: mark.originLat, lng: mark.originLng },
            { lat: horizonPt.lat, lng: horizonPt.lng },
          ],
          map,
          strokeColor: mark.color,
          strokeOpacity: 0,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.5, scale: 3 }, offset: '0', repeat: '12px' }],
        });

        // Update position on drag end
        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          circle.setCenter(pos);
          onUpdateMarkPosition(mark.id, pos.lat(), pos.lng());
        });

        // Tap / click: open Google Maps with directions to this pin
        marker.addListener('click', () => {
          const pos = marker.getPosition();
          window.open(
            `https://www.google.com/maps/dir/?api=1&destination=${pos.lat()},${pos.lng()}`,
            '_blank',
          );
        });

        markersRef.current[mark.id] = { marker, circle, projLine };
      } else {
        // Update existing marker/circle positions
        markersRef.current[mark.id].marker.setPosition(pinLatLng);
        markersRef.current[mark.id].circle.setCenter(pinLatLng);
      }
    });
  }, [marks, onUpdateMarkPosition]);

  useEffect(() => {
    if (mapsReady && mapRef.current) syncMarkers();
  }, [mapsReady, syncMarkers]);

  // ── Geofence check ────────────────────────────────────────────────────────
  // When the user physically arrives within GEOFENCE_RADIUS_M of a mark,
  // surface the in-app visit modal (one at a time).
  useEffect(() => {
    if (!position || pendingMark) return;
    for (const mark of marks) {
      if (mark.visited || promptedRef.current.has(mark.id)) continue;
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
      <VisitModal
        mark={pendingMark}
        onConfirm={handleVisitConfirm}
        onDismiss={handleVisitDismiss}
      />
    </div>
  );
}

// Minimal dark overlay so the map blends with the app's dark theme
const DARK_OVERLAY = [
  { elementType: 'labels.text.fill', stylers: [{ color: '#e0e0e0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
