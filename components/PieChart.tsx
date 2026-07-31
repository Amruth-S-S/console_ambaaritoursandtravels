"use client";

import { useMemo, useState } from "react";
import styles from "./PieChart.module.css";

export type PieDatum = { id: string; label: string; value: number; color: string };

const SIZE = 160;
const RADIUS = 54;
const STROKE = 24;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function PieChart({
  data,
  valueFormat = (v: number) => v.toLocaleString("en-IN"),
}: {
  data: PieDatum[];
  valueFormat?: (v: number) => string;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);

  // A visible gap between segments (the surface color) does the separating
  // work instead of a stroke — see dataviz skill's marks-and-anatomy.
  const gap = CIRCUMFERENCE * 0.014;

  const segments = useMemo(() => {
    if (total <= 0) return [];
    let offset = 0;
    return data
      .filter((d) => d.value > 0)
      .map((d) => {
        const raw = (d.value / total) * CIRCUMFERENCE;
        const seg = { ...d, length: Math.max(raw - gap, 0), offset, pct: (d.value / total) * 100 };
        offset += raw;
        return seg;
      });
  }, [data, total, gap]);

  if (total <= 0) {
    return <div className={styles.empty}>No data yet.</div>;
  }

  const hovered = data.find((d) => d.id === hoverId);

  return (
    <div className={styles.wrap}>
      <div className={styles.chartBox}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="Pie chart">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--surface-2)" strokeWidth={STROKE} />
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {segments.map((s) => (
              <circle
                key={s.id}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={s.color}
                strokeWidth={hoverId === s.id ? STROKE + 4 : STROKE}
                strokeDasharray={`${s.length} ${CIRCUMFERENCE - s.length}`}
                strokeDashoffset={-s.offset}
                strokeLinecap="butt"
                className={styles.segment}
                tabIndex={0}
                onMouseEnter={() => setHoverId(s.id)}
                onMouseLeave={() => setHoverId(null)}
                onFocus={() => setHoverId(s.id)}
                onBlur={() => setHoverId(null)}
              >
                <title>
                  {s.label}: {valueFormat(s.value)} ({s.pct.toFixed(0)}%)
                </title>
              </circle>
            ))}
          </g>
        </svg>
        <div className={styles.center}>
          <div className={styles.centerValue}>{valueFormat(hovered ? hovered.value : total)}</div>
          <div className={styles.centerLabel}>{hovered ? hovered.label : "Total"}</div>
        </div>
      </div>
      <ul className={styles.legend}>
        {data.map((d) => (
          <li
            key={d.id}
            className={hoverId === d.id ? styles.legendActive : undefined}
            onMouseEnter={() => setHoverId(d.id)}
            onMouseLeave={() => setHoverId(null)}
          >
            <span className={styles.swatch} style={{ background: d.color }} />
            <span className={styles.legendLabel}>{d.label}</span>
            <span className={styles.legendValue}>
              {valueFormat(d.value)} <span className={styles.legendPct}>({total > 0 ? Math.round((d.value / total) * 100) : 0}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
