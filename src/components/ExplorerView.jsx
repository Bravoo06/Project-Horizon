import { COLOR_META } from '../utils/colors';
import styles from './ExplorerView.module.css';

// ─────────────────────────────────────────────
// ExplorerView
// Lists active marks and visited history.
// Props:
//   marks        – array from useMarks
//   onDeleteMark – (id) => void
// ─────────────────────────────────────────────
export default function ExplorerView({ marks, onDeleteMark }) {
  const active  = marks.filter((m) => !m.visited);
  const visited = marks.filter((m) =>  m.visited);

  const total  = marks.length;
  const streak = computeStreak(marks);

  return (
    <div className={styles.container}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <img src="/logo.svg" className={styles.logo} alt="Horizons logo" />
        <span className={styles.appName}>HORIZONS</span>
      </div>

      {/* ── Quick stats ─────────────────────────────────────────────────── */}
      <div className={styles.stats}>
        <Stat value={total}            label="marked" />
        <Stat value={visited.length}   label="visited" />
        <Stat value={streak}           label="day streak" fire />
      </div>

      {/* ── Active marks ────────────────────────────────────────────────── */}
      <Section title="Active Marks" empty={active.length === 0} emptyMsg="No active marks yet — tap in Spyglass to add one.">
        {active.map((m) => (
          <MarkCard key={m.id} mark={m} onDelete={onDeleteMark} />
        ))}
      </Section>

      {/* ── Visited places ──────────────────────────────────────────────── */}
      <Section title="Visited Places" empty={visited.length === 0} emptyMsg="No visits yet — get out there!">
        {visited.map((m) => (
          <VisitedCard key={m.id} mark={m} />
        ))}
      </Section>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, empty, emptyMsg, children }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {empty
        ? <p className={styles.empty}>{emptyMsg}</p>
        : children}
    </div>
  );
}

function Stat({ value, label, fire }) {
  return (
    <span className={styles.stat}>
      {fire && <span className={styles.fire}>🔥</span>}
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </span>
  );
}

function MarkCard({ mark, onDelete }) {
  const meta = COLOR_META[mark.color] ?? { emoji: '⚪', name: mark.color };
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mark.lat},${mark.lng}`;

  return (
    <div className={styles.card}>
      <span className={styles.emoji}>{meta.emoji}</span>
      <div className={styles.cardInfo}>
        <span className={styles.coords}>{fmtCoords(mark.lat, mark.lng)}</span>
        <span className={styles.date}>{fmtDate(mark.createdAt)}</span>
      </div>
      <div className={styles.cardActions}>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.btnDirections}
          aria-label="Get directions"
        >
          Directions
        </a>
        <button
          className={styles.btnDelete}
          onClick={() => onDelete(mark.id)}
          aria-label="Delete mark"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function VisitedCard({ mark }) {
  const meta = COLOR_META[mark.color] ?? { emoji: '⚪', name: mark.color };
  return (
    <div className={`${styles.card} ${styles.cardVisited}`}>
      <span className={styles.emoji}>{meta.emoji}</span>
      <div className={styles.cardInfo}>
        <span className={styles.coords}>{fmtCoords(mark.lat, mark.lng)}</span>
        <span className={styles.date}>✓ Visited {fmtDate(mark.createdAt)}</span>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtCoords(lat, lng) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns},  ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function computeStreak(marks) {
  const visitedDays = new Set(
    marks.filter((m) => m.visited).map((m) => new Date(m.createdAt).toDateString())
  );
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (visitedDays.has(d.toDateString())) streak++;
    else break;
  }
  return streak;
}