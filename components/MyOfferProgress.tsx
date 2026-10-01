"use client";

import { useEffect, useState } from "react";
import { api, MyOfferProgress as Progress } from "@/lib/api";
import { formatDateDMY } from "@/lib/dates";
import styles from "@/app/dashboard/overview.module.css";

function periodLabel(from: string, to: string): string {
  if (from && to) return `${formatDateDMY(from)} – ${formatDateDMY(to)}`;
  if (from) return `From ${formatDateDMY(from)}`;
  if (to) return `Until ${formatDateDMY(to)}`;
  return "Ongoing";
}

// A regular user's own progress toward each running offer's target, shown
// as a percentage only — the backend never sends amounts to this view (see
// GET /offers/my-progress). Hidden when there are no running offers.
export default function MyOfferProgress() {
  const [items, setItems] = useState<Progress[] | null>(null);

  useEffect(() => {
    api
      .getMyOfferProgress()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h3>My offer targets</h3>
      </div>
      <div className={styles.offerUsers}>
        {items.map((o) => (
          <div key={o.id} className={styles.offerUser}>
            <div className={styles.offerUserName} title={o.packageName}>
              {o.packageName}
              <span>
                {periodLabel(o.fromDate, o.toDate)} · {o.bookings} booking{o.bookings === 1 ? "" : "s"}
              </span>
            </div>
            <div
              className={styles.offerProgress}
              role="progressbar"
              aria-valuenow={o.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${o.packageName}: progress toward your target`}
            >
              <div
                className={`${styles.offerProgressFill} ${o.met ? styles.offerProgressMet : ""}`}
                style={{ width: `${o.percent}%` }}
              />
              <span>{o.percent}%</span>
            </div>
            <div className={`${styles.offerUserLeft} ${o.met ? styles.offerUserMet : ""}`}>
              {o.met ? "Target met" : `${100 - o.percent}% to go`}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
