"use client";

import { useState } from "react";
import { PEST_TYPES, PESTS } from "@/lib/pests";
import type { DayStat } from "@/lib/view-types";
import { PestSwatch } from "./PestMark";

const W = 340;
const H = 190;
const PAD = { l: 26, r: 6, t: 16, b: 22 };

function dayLabel(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString([], { weekday: "short" });
}

/** Stacked daily bars of pests seen, one segment per pest type. */
export function TrendChart({ days }: { days: DayStat[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = days.map((d) => PEST_TYPES.reduce((s, p) => s + d.counts[p], 0));
  const max = Math.max(4, ...totals);
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const slot = plotW / days.length;
  const barW = Math.min(28, slot * 0.6);
  const y = (v: number) => PAD.t + plotH - (v / top) * plotH;
  const shown = hover ?? days.length - 1;
  const d = days[shown];

  return (
    <div>
      <div className="legend" style={{ marginTop: 0, marginBottom: 8 }}>
        {PEST_TYPES.map((p) => (
          <span key={p}><PestSwatch pest={p} /> {PESTS[p].label}</span>
        ))}
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pests seen per day for the last week">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(i * step)} y2={y(i * step)} />
            <text className="axis" x={PAD.l - 6} y={y(i * step) + 3} textAnchor="end">{i * step}</text>
          </g>
        ))}
        {days.map((day, i) => {
          const x = PAD.l + i * slot + (slot - barW) / 2;
          let acc = 0;
          const segs = PEST_TYPES.filter((p) => day.counts[p] > 0);
          return (
            <g
              key={day.day}
              className="day"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(i)}
            >
              <rect className="hover-bg" x={PAD.l + i * slot} y={PAD.t} width={slot} height={plotH} fill={hover === i ? "var(--surface-2)" : "transparent"} />
              {segs.map((p, j) => {
                const v = day.counts[p];
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                const isTop = j === segs.length - 1;
                const h = Math.max(1, y0 - y1);
                return isTop ? (
                  <path
                    key={p}
                    className="seg"
                    style={{ fill: PESTS[p].color }}
                    d={`M ${x} ${y0} V ${y1 + Math.min(4, h)} Q ${x} ${y1} ${x + Math.min(4, h)} ${y1} H ${x + barW - Math.min(4, h)} Q ${x + barW} ${y1} ${x + barW} ${y1 + Math.min(4, h)} V ${y0} Z`}
                  />
                ) : (
                  <rect key={p} className="seg" style={{ fill: PESTS[p].color }} x={x} y={y1} width={barW} height={h} />
                );
              })}
              {totals[i] > 0 && (
                <text className="total" x={x + barW / 2} y={y(totals[i]) - 4} textAnchor="middle">{totals[i]}</text>
              )}
              <text className="axis" x={x + barW / 2} y={H - 6} textAnchor="middle">{dayLabel(day.day)}</text>
            </g>
          );
        })}
      </svg>
      <div className="chart-tip" aria-live="polite">
        <strong>{new Date(`${d.day}T00:00:00`).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</strong>
        {" · "}
        {PEST_TYPES.map((p) => `${d.counts[p]} ${PESTS[p].label.toLowerCase()}`).join(", ")}
        {" · "}
        {d.sprays} sprays
      </div>
      <details>
        <summary>Show as table</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th>Day</th>
              {PEST_TYPES.map((p) => <th key={p}>{PESTS[p].label}</th>)}
              <th>Sprays</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.day}>
                <td>{day.day}</td>
                {PEST_TYPES.map((p) => <td key={p} className="mono">{day.counts[p]}</td>)}
                <td className="mono">{day.sprays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
