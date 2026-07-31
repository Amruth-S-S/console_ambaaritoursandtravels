"use client";

import { useState } from "react";
import styles from "./BookingsBarChart.module.css";

export type BarDatum = {
  id: string;
  label: string;
  count: number;
  amount: number;
};

// Ranked horizontal bar chart, single hue (magnitude, not identity — every bar
// is the same measure across different users, so one accent color is correct;
// see dataviz skill's choosing-a-form: "compare magnitude" -> sequential/one hue).
export default function BookingsBarChart({ data }: { data: BarDatum[] }) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));

  if (data.length === 0) {
    return <div className={styles.empty}>No bookings yet.</div>;
  }

  return (
    <div className={styles.chart}>
      {data.map((d) => {
        const pct = Math.max((d.count / max) * 100, 4);
        return (
          <div
            key={d.id}
            className={styles.row}
            onMouseEnter={() => setHoverId(d.id)}
            onMouseLeave={() => setHoverId(null)}
          >
            <span className={styles.label} title={d.label}>
              {d.label}
            </span>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${pct}%` }} />
              {hoverId === d.id && (
                <div className={styles.tooltip}>
                  {d.count} booking{d.count === 1 ? "" : "s"} · ₹{d.amount.toLocaleString("en-IN")}
                </div>
              )}
            </div>
            <span className={styles.value}>{d.count}</span>
          </div>
        );
      })}
    </div>
  );
}
