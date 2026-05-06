import { useEffect, useRef, useState } from 'react';
import styles from './RewardCounter.module.css';

// ─────────────────────────────────────────────
// RewardCounter
// Shows total / visited / pending counts and visit streak.
// Plays a celebration animation when visited count increases.
// Props:
//   marks – array from useMarks
// ─────────────────────────────────────────────
export default function RewardCounter({ marks }) {
  const total = marks.length;
  const visited = marks.filter((m) => m.visited).length;
  const pending = total - visited;
  const streak = computeStreak(marks);

  const [celebrating, setCelebrating] = useState(false);
  const prevVisited = useRef(visited);

  useEffect(() => {
    if (visited > prevVisited.current) {
      setCelebrating(true);
      const t = setTimeout(() => setCelebrating(false), 1400);
      prevVisited.current = visited;
      return () => clearTimeout(t);
    }
    prevVisited.current = visited;
  }, [visited]);

  return (
    <div className={`${styles.bar} ${celebrating ? styles.celebrate : ''}`}>
      <Stat icon="◎" value={total} label="marked" />
      <Stat icon="✓" value={visited} label="visited" />
      <Stat icon="◌" value={pending} label="pending" />
      <Stat icon="🔥" value={streak} label="day streak" highlight />
    </div>
  );
}

function Stat({ icon, value, label, highlight }) {
  return (
    <span className={`${styles.stat} ${highlight ? styles.highlight : ''}`}>
      <span className={styles.icon}>{icon}</span>
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
    </span>
  );
}

// Count the current consecutive-day streak of any mark being visited.
// "Streak" = each calendar day (local time) going back from today had
// at least one mark whose createdAt date matches.
// TODO: when visit history is tracked separately, base streak on actual
//       visit timestamps rather than mark creation dates.
function computeStreak(marks) {
  const visitedDays = new Set(
    marks
      .filter((m) => m.visited)
      .map((m) => new Date(m.createdAt).toDateString())
  );

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (visitedDays.has(d.toDateString())) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
