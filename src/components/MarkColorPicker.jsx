import styles from './MarkColorPicker.module.css';

// Preset beam colours, inspired by BotW pin palette.
const PRESETS = [
  '#FF4136', // red
  '#FF851B', // orange
  '#FFDC00', // yellow
  '#2ECC40', // green
  '#0074D9', // blue
  '#B10DC9', // purple
  '#FFFFFF', // white
];

// ─────────────────────────────────────────────
// MarkColorPicker
// Horizontal strip of coloured swatches.
// Props:
//   selectedColor – currently selected hex string
//   onColorChange – (color: string) => void
// ─────────────────────────────────────────────
export default function MarkColorPicker({ selectedColor, onColorChange }) {
  return (
    <div className={styles.strip} role="group" aria-label="Beam colour">
      {PRESETS.map((color) => (
        <button
          key={color}
          className={`${styles.swatch} ${selectedColor === color ? styles.active : ''}`}
          style={{ '--swatch-color': color }}
          onClick={() => onColorChange(color)}
          aria-label={color}
          aria-pressed={selectedColor === color}
        />
      ))}
    </div>
  );
}
