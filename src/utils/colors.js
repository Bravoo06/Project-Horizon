export const COLORS = [
  { hex: '#E53935', name: 'Red',    emoji: '🔴' },
  { hex: '#FB8C00', name: 'Orange', emoji: '🟠' },
  { hex: '#FDD835', name: 'Yellow', emoji: '🟡' },
  { hex: '#43A047', name: 'Green',  emoji: '🟢' },
  { hex: '#1E88E5', name: 'Blue',   emoji: '🔵' },
  { hex: '#8E24AA', name: 'Purple', emoji: '🟣' },
  { hex: '#6D4C41', name: 'Brown',  emoji: '🟤' },
];

// Keyed by hex for O(1) lookup
export const COLOR_META = Object.fromEntries(COLORS.map((c) => [c.hex, c]));