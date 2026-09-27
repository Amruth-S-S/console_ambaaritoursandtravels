"use client";

import { useState } from "react";
import styles from "./RefreshButton.module.css";

// Shared "reload this list" button for every dashboard list page. Tracks its
// own busy state so each page only has to hand over its existing load()
// function — errors are already surfaced by that load() via the page toast.
export default function RefreshButton({ onRefresh }: { onRefresh: () => unknown }) {
  const [busy, setBusy] = useState(false);

  async function click() {
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={styles.btn}
      onClick={click}
      disabled={busy}
      title="Refresh list"
      aria-label="Refresh list"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={busy ? styles.spin : undefined}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      <span>{busy ? "Refreshing…" : "Refresh"}</span>
    </button>
  );
}
