"use client";

import styles from "./Toast.module.css";

export type ToastState =
  | { type: "ok" | "err"; text: string }
  | { type: "confirm"; text: string; onConfirm: () => void; onCancel: () => void }
  // A 2+-way prompt (e.g. "download as one PDF, or one file each?") — same
  // persistent, no-auto-dismiss confirm styling, but with caller-labeled
  // buttons instead of the fixed Cancel/Delete pair.
  | { type: "choose"; text: string; options: { label: string; onClick: () => void }[]; onCancel: () => void }
  | null;

export default function Toast({ toast }: { toast: ToastState }) {
  if (!toast) return null;

  if (toast.type === "confirm" || toast.type === "choose") {
    return (
      <div className={styles.wrap}>
        <div className={`${styles.toast} ${styles.confirm}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              d="M12 9v4M12 16.5h.01M10.3 3.9 2.7 17.1a1.5 1.5 0 0 0 1.3 2.4h16a1.5 1.5 0 0 0 1.3-2.4L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{toast.text}</span>
          <div className={styles.confirmActions}>
            {toast.type === "choose" ? (
              <>
                {toast.options.map((opt) => (
                  <button key={opt.label} className={styles.confirmChoice} onClick={opt.onClick}>
                    {opt.label}
                  </button>
                ))}
                <button className={styles.confirmCancel} onClick={toast.onCancel}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button className={styles.confirmCancel} onClick={toast.onCancel}>
                  Cancel
                </button>
                <button className={styles.confirmDelete} onClick={toast.onConfirm}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={`${styles.toast} ${toast.type === "ok" ? styles.ok : styles.err}`}>
        {toast.type === "ok" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
          </svg>
        )}
        <span>{toast.text}</span>
      </div>
    </div>
  );
}
