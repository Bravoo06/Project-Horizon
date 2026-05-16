import { useState, useEffect, useCallback } from 'react';

// Mark schema:
// {
//   id:         string   – UUID
//   originLat:  number   – GPS lat where mark was created
//   originLng:  number   – GPS lng where mark was created
//   bearing:    number   – compass heading (°) when the mark was placed
//   lat:        number   – final pin latitude (set when user confirms placement)
//   lng:        number   – final pin longitude
//   color:      string   – hex color string
//   visited:    boolean
//   occluded:   boolean  – true if elevation check suggests line-of-sight blocked
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  }, [marks]);

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
      occluded: false,
      createdAt: Date.now(),
    };
    setMarks((prev) => [...prev, mark]);
    return mark;
  }, []);

  const updateMarkPosition = useCallback((id, lat, lng) => {
    setMarks((prev) =>
      prev.map((m) => (m.id === id ? { ...m, lat, lng } : m))
    );
  }, []);

  const visitMark = useCallback((id) => {
    setMarks((prev) =>
      prev.map((m) => (m.id === id ? { ...m, visited: true } : m))
    );
  }, []);

  const deleteMark = useCallback((id) => {
    setMarks((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const setMarkOcclusion = useCallback((id, occluded) => {
    setMarks((prev) =>
      prev.map((m) => (m.id === id ? { ...m, occluded } : m))
    );
  }, []);

  return { marks, addMark, updateMarkPosition, visitMark, deleteMark, setMarkOcclusion };
}