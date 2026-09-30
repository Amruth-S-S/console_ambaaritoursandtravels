"use client";

import { useEffect, useState } from "react";
import { api, UpcomingPackage } from "@/lib/api";
import { formatLandCost, isUpcoming, monthLabel, splitDates } from "@/lib/upcoming";
import styles from "./UpcomingPackagesStrip.module.css";

// Top-of-Overview strip of admin-announced upcoming departures (managed on
// the admin-only Upcoming Packages page). Cards breathe in and out in a
// staggered wave to draw the eye; hovering one zooms it further on its
// own. Renders nothing when there's nothing upcoming.
export default function UpcomingPackagesStrip() {
  const [items, setItems] = useState<UpcomingPackage[]>([]);

  useEffect(() => {
    api
      .listUpcomingPackages()
      .then((list) => setItems(list.filter((p) => isUpcoming(p.month))))
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  return (
    <section className={styles.wrap} aria-label="Upcoming packages">
      <div className={styles.head}>
        <h2>
          <span className={styles.dot} aria-hidden />
          Upcoming Packages
        </h2>
        <span className={styles.count}>
          {items.length} departure{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className={styles.row}>
        {items.map((p, i) => {
          const [mon, year] = monthLabel(p.month, true).split(" ");
          const dates = splitDates(p.dates);
          return (
            <article
              key={p.id}
              className={styles.card}
              // Staggered so the cards zoom one after another, not in unison.
              style={{ animationDelay: `${(i % 6) * 0.45}s` }}
            >
              <div className={styles.month}>
                <span className={styles.mon}>{mon}</span>
                <span className={styles.year}>{year}</span>
              </div>
              <div className={styles.body}>
                <h3 title={p.packageName}>{p.packageName}</h3>
                {dates.length > 0 && (
                  <div className={styles.dates}>
                    {dates.map((d) => (
                      <span key={d} className={styles.date}>
                        {d}
                      </span>
                    ))}
                  </div>
                )}
                <div className={styles.cost}>
                  <span>Land cost</span>
                  <strong>{formatLandCost(p.landCost)}</strong>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
