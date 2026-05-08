import styles from './VisitModal.module.css';

export default function VisitModal({ mark, onConfirm, onDismiss }) {
  if (!mark) return null;
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.card} style={{ '--accent': mark.color }}>
        <div className={styles.icon}>📍</div>
        <p className={styles.subtitle}>You're nearby</p>
        <p className={styles.question}>Did you visit this spot?</p>
        <div className={styles.actions}>
          <button className={styles.btnYes} onClick={onConfirm}>
            Yes, visited!
          </button>
          <button className={styles.btnNo} onClick={onDismiss}>
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}