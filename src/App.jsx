import { useState, useCallback, useRef } from 'react';
import SpyglassView from './components/SpyglassView';
import MapView from './components/MapView';
import ExplorerView from './components/ExplorerView';
import RewardCounter from './components/RewardCounter';
import useMarks from './hooks/useMarks';
import { COLOR_META } from './utils/colors';
import styles from './App.module.css';

const VIEWS = { SPYGLASS: 'spyglass', MAP: 'map', EXPLORER: 'explorer' };

export default function App() {
  const [activeView, setActiveView] = useState(VIEWS.SPYGLASS);
  const [selectedColor, setSelectedColor] = useState('#E53935');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const { marks, addMark, updateMarkPosition, visitMark, deleteMark, setMarkOcclusion } = useMarks();

  // Set of hex colours that already have an active (unvisited) mark
  const usedColors = new Set(marks.filter((m) => !m.visited).map((m) => m.color));

  const showToast = useCallback((msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // Guard: one active mark per colour
  const handleAddMark = useCallback((markData) => {
    if (usedColors.has(markData.color)) {
      const name = COLOR_META[markData.color]?.name ?? 'That colour';
      showToast(`${name} is already in use — visit or delete it first.`);
      return;
    }
    addMark(markData);
  }, [usedColors, addMark, showToast]);

  return (
    <div className={styles.app}>
      {/* ── Active view ──────────────────────────────────────────────────── */}
      <main className={styles.main}>
        {activeView === VIEWS.SPYGLASS && (
          <SpyglassView
            marks={marks}
            selectedColor={selectedColor}
            usedColors={usedColors}
            onColorChange={setSelectedColor}
            onAddMark={handleAddMark}
          />
        )}
        {activeView === VIEWS.MAP && (
          <MapView
            marks={marks}
            onUpdateMarkPosition={updateMarkPosition}
            onVisitMark={visitMark}
            onSetMarkOcclusion={setMarkOcclusion}
          />
        )}
        {activeView === VIEWS.EXPLORER && (
          <ExplorerView
            marks={marks}
            onDeleteMark={deleteMark}
          />
        )}
      </main>

      {/* ── Stats bar (hidden in Explorer — it has its own stats) ────────── */}
      {activeView !== VIEWS.EXPLORER && (
        <div className={styles.counterWrapper}>
          <RewardCounter marks={marks} />
        </div>
      )}

      {/* ── Toast notification ───────────────────────────────────────────── */}
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* ── Bottom navigation ────────────────────────────────────────────── */}
      <nav className={styles.nav}>
        <button
          className={`${styles.navBtn} ${activeView === VIEWS.SPYGLASS ? styles.active : ''}`}
          onClick={() => setActiveView(VIEWS.SPYGLASS)}
          aria-label="Spyglass view"
        >
          <span className={styles.navIcon}>🔭</span>
          <span className={styles.navLabel}>Spyglass</span>
        </button>
        <button
          className={`${styles.navBtn} ${activeView === VIEWS.MAP ? styles.active : ''}`}
          onClick={() => setActiveView(VIEWS.MAP)}
          aria-label="Map view"
        >
          <span className={styles.navIcon}>🗺️</span>
          <span className={styles.navLabel}>Map</span>
        </button>
        <button
          className={`${styles.navBtn} ${activeView === VIEWS.EXPLORER ? styles.active : ''}`}
          onClick={() => setActiveView(VIEWS.EXPLORER)}
          aria-label="Explorer view"
        >
          <span className={styles.navIcon}>🧭</span>
          <span className={styles.navLabel}>Explorer</span>
        </button>
      </nav>
    </div>
  );
}