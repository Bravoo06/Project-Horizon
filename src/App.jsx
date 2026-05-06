import { useState } from 'react';
import SpyglassView from './components/SpyglassView';
import MapView from './components/MapView';
import RewardCounter from './components/RewardCounter';
import useMarks from './hooks/useMarks';
import styles from './App.module.css';

const VIEWS = { SPYGLASS: 'spyglass', MAP: 'map' };

export default function App() {
  const [activeView, setActiveView] = useState(VIEWS.SPYGLASS);
  const [selectedColor, setSelectedColor] = useState('#FF4136');

  const { marks, addMark, updateMarkPosition, visitMark } = useMarks();

  return (
    <div className={styles.app}>
      {/* ── Active view ──────────────────────────────────────────────────── */}
      <main className={styles.main}>
        {activeView === VIEWS.SPYGLASS ? (
          <SpyglassView
            marks={marks}
            selectedColor={selectedColor}
            onColorChange={setSelectedColor}
            onAddMark={addMark}
          />
        ) : (
          <MapView
            marks={marks}
            onUpdateMarkPosition={updateMarkPosition}
            onVisitMark={visitMark}
          />
        )}
      </main>

      {/* ── Stats bar (always visible) ───────────────────────────────────── */}
      <div className={styles.counterWrapper}>
        <RewardCounter marks={marks} />
      </div>

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
      </nav>
    </div>
  );
}
