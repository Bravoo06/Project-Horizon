import { useState, useEffect, useCallback } from 'react';

// Mark schema:
// {
//   id:         string   – UUID
//   originLat:  number   – GPS lat where mark was created
//   originLng:  number   – GPS lng where mark was created
//   bearing:    number   – compass heading (°) when the mark was placed
//   lat:        number   – final pin latitude (dragged by user on map)
//   lng:        number   – final pin longitude
//   color:      string   – hex color string e.g. '#FF4136'
//   visited:    boolean
//   createdAt:  number   – Date.now() timestamp
// }

const STORAGE_KEY = 'horizon_marks';

function loadFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

export default function useMarks() {
  const [marks, setMarks] = useState(loadFromStorage);

  // Persist every change to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  }, [marks]);

  // Place a new mark in the current facing direction.
  // lat/lng start at the origin; user drags them on the map.
  const addMark = useCallback(({ originLat, originLng, bearing, color }) => {
    const mark = {
      id: crypto.randomUUID(),
      originLat,
      originLng,
      bearing,
      lat: originLat,
      lng: originLng,
      color,
      visited: false,
      createdAt: Date.now(),
    };
    setMarks((prev) => [...prev, mark]);
    return mark;
  }, []);

  // Called after the user drags the pin on the map to set distance.
  const updateMarkPosition = useCallback((id, lat, lng) => {
    setMarks((prev) =>
      prev.map((m) => (m.id === id ? { ...m, lat, lng } : m))
    );
  }, []);

  // Called when the user confirms they visited the place (geofence prompt).
  const visitMark = useCallback((id) => {
    setMarks((prev) =>
      prev.map((m) => (m.id === id ? { ...m, visited: true } : m))
    );
  }, []);

  const deleteMark = useCallback((id) => {
    setMarks((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { marks, addMark, updateMarkPosition, visitMark, deleteMark };
}
