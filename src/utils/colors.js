export const COLORS = [
  { hex: '#FF4136', name: 'Red',    emoji: '🔴' },
  { hex: '#FFDC00', name: 'Yellow', emoji: '🟡' },
  { hex: '#2ECC40', name: 'Green',  emoji: '🟢' },
  { hex: '#B10DC9', name: 'Purple', emoji: '🟣' },
];

// Keyed by hex for O(1) lookup
export const COLOR_META = Object.fromEntries(COLORS.map((c) => [c.hex, c]));