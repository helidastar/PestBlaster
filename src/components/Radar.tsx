"use client";

import { PEST_TYPES, PESTS } from "@/lib/pests";
import { CAMERA, LIMITS, bboxCenter } from "@/lib/targeting";
import type { CaptureRecord, FireEvent, Pose } from "@/lib/types";
import { PestShape, PestSwatch } from "./PestMark";

const C = 150;
const R_SOIL = 34;
const R_TOP = 128;

/** Top-down map of the bed. Angle = turret pan (0° at the top, clockwise). Rings = height on the plant. */
function toXY(panDeg: number, liftMm: number) {
  const r = R_SOIL + (liftMm / LIMITS.liftMaxMm) * (R_TOP - R_SOIL);
  const a = ((panDeg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

export function Radar({
  pose,
  pests,
  lastFire,
}: {
  pose: Pose;
  pests: CaptureRecord[];
  lastFire: FireEvent | null;
}) {
  const head = toXY(pose.pan, pose.lift);
  const recentFire = lastFire && Date.now() - new Date(lastFire.createdAt).getTime() < 15_000;
  const fireAt = lastFire ? toXY(lastFire.pose.pan, lastFire.pose.lift) : null;

  const marks = pests.flatMap((c) =>
    c.detections.map((d) => {
      const { cx, cy } = bboxCenter(d.bbox);
      const p = toXY(c.pose.pan + (cx - 0.5) * CAMERA.hfovDeg, c.pose.lift - (cy - 0.5) * 60);
      return { key: `${c.id}-${d.id}`, pest: d.pest, ...p, under: c.pose.swivel > 90, capture: c };
    }),
  );

  const label = `Turret facing ${Math.round(pose.pan)} degrees at ${Math.round(pose.lift)} millimetres. ${marks.length} recent pest sightings shown.`;

  return (
    <div>
      <div className="radar-wrap">
        <svg className="radar" viewBox="0 0 300 300" role="img" aria-label={label}>
          <circle className="bed" cx={C} cy={C} r={R_TOP + 14} />
          {[0, 150, 300].map((lift) => (
            <circle key={lift} className="ring" cx={C} cy={C} r={R_SOIL + (lift / 300) * (R_TOP - R_SOIL)} />
          ))}
          {Array.from({ length: 12 }, (_, i) => {
            const a = toXY(i * 30, 0);
            const b = toXY(i * 30, LIMITS.liftMaxMm);
            return <line key={i} className="tick" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
          <text className="compass" x={C} y={12} textAnchor="middle">0°</text>
          <text className="compass" x={292} y={C + 4} textAnchor="end">90°</text>
          <text className="compass" x={C} y={298} textAnchor="middle">180°</text>
          <text className="compass" x={8} y={C + 4}>270°</text>
          <text className="ring-label" x={C + 4} y={C - R_TOP + 10}>top</text>
          <text className="ring-label" x={C + 4} y={C - R_SOIL + 10}>soil</text>

          <line className="arm" x1={C} y1={C} x2={head.x} y2={head.y} />
          <circle className="hub" cx={C} cy={C} r={7} />

          {marks.map((m) => (
            <g key={m.key}>
              <title>{`${PESTS[m.pest].label}, ${m.under ? "under leaf" : "leaf top"}, ${new Date(m.capture.createdAt).toLocaleTimeString()}`}</title>
              <PestShape className="pest" pest={m.pest} x={m.x} y={m.y} r={m.under ? 5 : 6} />
            </g>
          ))}

          {recentFire && fireAt && <circle key={lastFire!.id} className="ripple" cx={fireAt.x} cy={fireAt.y} r={10} />}
          <circle className="head" cx={head.x} cy={head.y} r={8} />
        </svg>

        <div className="lift-gauge" aria-label={`Post height ${Math.round(pose.lift)} of ${LIMITS.liftMaxMm} millimetres`}>
          <span>top</span>
          <div className="lift-track">
            <div className="lift-carriage" style={{ bottom: `calc(${(pose.lift / LIMITS.liftMaxMm) * 100}% - 6px)` }} />
          </div>
          <span>soil</span>
        </div>
      </div>

      <div className="legend">
        {PEST_TYPES.map((p) => (
          <span key={p}>
            <PestSwatch pest={p} /> {PESTS[p].label}
          </span>
        ))}
      </div>

      <div className="pose-readout">
        <div><span>Pan</span><strong>{Math.round(pose.pan)}°</strong></div>
        <div><span>Lift</span><strong>{Math.round(pose.lift)} mm</strong></div>
        <div><span>Swivel</span><strong>{Math.round(pose.swivel)}°</strong></div>
      </div>
    </div>
  );
}
