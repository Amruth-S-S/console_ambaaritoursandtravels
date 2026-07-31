"use client";

import { useMemo, useState } from "react";
import styles from "./RevenueLineChart.module.css";

export type LinePoint = { x: string; y: number };

const WIDTH = 560;
const HEIGHT = 220;
const PAD_L = 60;
const PAD_R = 16;
const PAD_T = 20;
const PAD_B = 30;
const PLOT_W = WIDTH - PAD_L - PAD_R;
const PLOT_H = HEIGHT - PAD_T - PAD_B;

function niceCeiling(max: number): number {
  if (max <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= max) return candidate;
  }
  return magnitude * 10;
}

function formatTick(v: number): string {
  if (v >= 100000) return `${(v / 100000).toFixed(v % 100000 === 0 ? 0 : 1)}L`;
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(v);
}

// Single series (total revenue over time) — one hue, no legend box needed;
// see dataviz skill's marks-and-anatomy: "a single series needs no legend".
export default function RevenueLineChart({ data }: { data: LinePoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const maxY = Math.max(0, ...data.map((d) => d.y));
  const niceMax = niceCeiling(maxY);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));

  const points = useMemo(
    () =>
      data.map((d, i) => ({
        ...d,
        px: data.length === 1 ? PAD_L + PLOT_W / 2 : PAD_L + (i / (data.length - 1)) * PLOT_W,
        py: PAD_T + PLOT_H - (niceMax > 0 ? (d.y / niceMax) * PLOT_H : 0),
      })),
    [data, niceMax]
  );

  if (data.length === 0) {
    return <div className={styles.empty}>No revenue yet.</div>;
  }

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.px.toFixed(1)} ${p.py.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.px - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={styles.svg}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {ticks.map((t) => {
          const y = PAD_T + PLOT_H - (niceMax > 0 ? (t / niceMax) * PLOT_H : 0);
          return (
            <g key={t}>
              <line x1={PAD_L} x2={WIDTH - PAD_R} y1={y} y2={y} className={styles.grid} />
              <text x={PAD_L - 10} y={y} textAnchor="end" dominantBaseline="middle" className={styles.tickLabel}>
                {formatTick(t)}
              </text>
            </g>
          );
        })}

        {hovered && <line x1={hovered.px} x2={hovered.px} y1={PAD_T} y2={PAD_T + PLOT_H} className={styles.crosshair} />}

        {points.length > 1 && <path d={path} className={styles.line} fill="none" />}

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.px}
            cy={p.py}
            r={i === points.length - 1 || hoverIdx === i ? 5 : 3.5}
            className={styles.dot}
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}

        <text x={last.px} y={Math.max(last.py - 14, 12)} textAnchor="end" className={styles.endLabel}>
          ₹{last.y.toLocaleString("en-IN")}
        </text>

        {points.map((p, i) => (
          <text key={i} x={p.px} y={HEIGHT - 8} textAnchor="middle" className={styles.xLabel}>
            {p.x}
          </text>
        ))}
      </svg>

      {hovered && (
        <div
          className={styles.tooltip}
          style={{ left: `${(hovered.px / WIDTH) * 100}%`, top: `${(hovered.py / HEIGHT) * 100}%` }}
        >
          <div className={styles.tooltipValue}>₹{hovered.y.toLocaleString("en-IN")}</div>
          <div className={styles.tooltipLabel}>{hovered.x}</div>
        </div>
      )}
    </div>
  );
}
