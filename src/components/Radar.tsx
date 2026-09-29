"use client";

import { useRef } from "react";
import { PEST_TYPES, PESTS } from "@/lib/pests";
import { CAMERA, LIMITS, bboxCenter } from "@/lib/targeting";
import type { CaptureRecord, FireEvent, Pose } from "@/lib/types";
import { PestShape, PestSwatch } from "./PestMark";

const C = 150;
const R_SOIL = 34;
const R_TOP = 128;
const BEAM_DEG = 42;

const liftToR = (liftMm: number) => R_SOIL + (liftMm / LIMITS.liftMaxMm) * (R_TOP - R_SOIL);

/** Top-down map of the bed. Angle = turret pan (0° at the top, clockwise). Rings = height on the plant. */
function toXY(panDeg: number, liftMm: number) {
  const r = liftToR(liftMm);
  const a = ((panDeg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

/** Wedge from the hub pointing straight up, spanning `from`..`to` degrees counter-clockwise of it. */
function wedge(from: number, to: number, r: number) {
  const p = (deg: number) => {
    const a = ((-deg - 90) * Math.PI) / 180;
    return `${C + r * Math.cos(a)} ${C + r * Math.sin(a)}`;
  };
  return `M ${C} ${C} L ${p(from)} A ${r} ${r} 0 0 0 ${p(to)} Z`;
}

/** Keeps the drawn angle continuous so 355° → 5° turns 10° forward, not 350° back. */
function useContinuousAngle(deg: number) {
  const ref = useRef<number | null>(null);
  if (ref.current === null) ref.current = deg;
  else {
    const delta = ((((deg - ref.current) % 360) + 540) % 360) - 180;
    ref.current += delta;
  }
  return ref.current;
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
  const angle = useContinuousAngle(pose.pan);
  const reach = liftToR(pose.lift);
  const recentFire = lastFire && Date.now() - new Date(lastFire.createdAt).getTime() < 15_000;
  const fireAt = lastFire ? toXY(lastFire.pose.pan, lastFire.pose.lift) : null;
  const newest = pests[0]?.id;

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
          {[0, 150, 300].map((lift) => (
            <circle key={lift} className="ring" cx={C} cy={C} r={liftToR(lift)} />
          ))}
          <circle className="ring outer" cx={C} cy={C} r={R_TOP + 12} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = toXY(i * 30, 0);
            const b = toXY(i * 30, LIMITS.liftMaxMm);
            return <line key={i} className="tick" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
          <text className="compass" x={C} y={7} textAnchor="middle">0°</text>
          <text className="compass" x={299} y={C + 3} textAnchor="end">90°</text>
          <text className="compass" x={C} y={300} textAnchor="middle">180°</text>
          <text className="compass" x={1} y={C + 3}>270°</text>
          <text className="ring-label" x={C + 4} y={C - R_TOP + 10}>TOP</text>
          <text className="ring-label" x={C + 4} y={C - R_SOIL + 10}>SOIL</text>

          {/* the turret's gaze: a fading beam trailing the arm */}
          <g className="gaze" style={{ transform: `rotate(${angle}deg)` }}>
            {Array.from({ length: 6 }, (_, i) => (
              <path
                key={i}
                className="beam"
                d={wedge((i * BEAM_DEG) / 6, ((i + 1) * BEAM_DEG) / 6 + 0.5, R_TOP + 12)}
                opacity={0.22 * (1 - i / 6) ** 1.6}
              />
            ))}
          </g>

          {marks.map((m) => (
            <g key={m.key} className={`blip${m.capture.id === newest ? " fresh" : ""}`}>
              <title>{`${PESTS[m.pest].label}, ${m.under ? "under leaf" : "leaf top"}, ${new Date(m.capture.createdAt).toLocaleTimeString()}`}</title>
              {m.capture.id === newest && (
                <circle className="halo" cx={m.x} cy={m.y} r={8} fill="none" stroke={PESTS[m.pest].color} strokeWidth={1.5} />
              )}
              <PestShape className="pest" pest={m.pest} x={m.x} y={m.y} r={m.under ? 5 : 6} />
            </g>
          ))}

          {recentFire && fireAt && (
            <g key={lastFire!.id}>
              <circle className="ripple" cx={fireAt.x} cy={fireAt.y} r={10} />
              <circle className="ripple two" cx={fireAt.x} cy={fireAt.y} r={10} />
            </g>
          )}

          <g className="gaze" style={{ transform: `rotate(${angle}deg)` }}>
            <line className="arm" x1={C} y1={C} x2={C} y2={C - 1} style={{ transform: `scaleY(${reach})` }} />
            <g className="nozzle" style={{ transform: `translateY(${-reach}px)` }}>
              <circle cx={C} cy={C} r={8} />
              <circle cx={C} cy={C} r={3} />
            </g>
          </g>
          <circle className="hub-ring" cx={C} cy={C} r={12} />
          <circle className="hub" cx={C} cy={C} r={5} />
        </svg>

        <div className="lift-gauge" aria-label={`Post height ${Math.round(pose.lift)} of ${LIMITS.liftMaxMm} millimetres`}>
          <span>TOP</span>
          <div className="lift-track">
            <div className="lift-carriage" style={{ bottom: `calc(${(pose.lift / LIMITS.liftMaxMm) * 100}% - 5px)` }} />
          </div>
          <span>SOIL</span>
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
        <div><span>Pan</span><strong>{Math.round(pose.pan)}<small>°</small></strong></div>
        <div><span>Lift</span><strong>{Math.round(pose.lift)}<small>mm</small></strong></div>
        <div><span>Swivel</span><strong>{Math.round(pose.swivel)}<small>°</small></strong></div>
      </div>
    </div>
  );
}
