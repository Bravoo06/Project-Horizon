import { COLORS } from '../utils/colors';
import styles from './MarkColorPicker.module.css';

// ─────────────────────────────────────────────
// MarkColorPicker
// Four coloured swatches — one slot per colour.
// Props:
//   selectedColor – currently selected hex string
//   onColorChange – (color: string) => void
//   usedColors    – Set of hex strings that already have an active mark
// ─────────────────────────────────────────────
export default function MarkColorPicker({ selectedColor, onColorChange, usedColors = new Set() }) {
  return (
    <div className={styles.strip} role="group" aria-label="Beam colour">
      {COLORS.map(({ hex, name }) => {
        const inUse = usedColors.has(hex) && hex !== selectedColor;
        return (
          <button
            key={hex}
            className={`${styles.swatch} ${selectedColor === hex ? styles.active : ''} ${inUse ? styles.inUse : ''}`}
            style={{ '--swatch-color': hex }}
            onClick={() => onColorChange(hex)}
            aria-label={name}
            aria-pressed={selectedColor === hex}
          />
        );
      })}
    </div>
  );
}