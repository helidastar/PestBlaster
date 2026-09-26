import type { BBox, Pose } from "./types";

/** Mechanical limits from the prototype design (0.5 m arm, 30 cm telescoping travel, ±170° swivel). */
export const LIMITS = {
  liftMinMm: 0,
  liftMaxMm: 300,
  swivelMin: -170,
  swivelMax: 170,
} as const;

/** Camera field of view. OV5640 standard lens is roughly 68° × 52°. */
export const CAMERA = {
  hfovDeg: 68,
  vfovDeg: 52,
  /** Expected camera-to-leaf distance when the hanging mount is close to a plant (10–20 cm). */
  workingDistanceMm: 150,
} as const;

/** How close to the image center (in degrees) the target must be before we count it as aimed. */
export const AIM_TOLERANCE_DEG = 3;

export function normalizePan(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function bboxCenter(b: BBox): { cx: number; cy: number } {
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
}

/**
 * Angular error of a target from the image center.
 * Positive dPan = target is right of center, positive dSwivel = target is below center.
 * Uses the pinhole model so edges of the frame are not over-corrected.
 */
export function angularOffset(b: BBox): { dPan: number; dSwivel: number } {
  const { cx, cy } = bboxCenter(b);
  const toRad = Math.PI / 180;
  const fx = 0.5 / Math.tan((CAMERA.hfovDeg / 2) * toRad);
  const fy = 0.5 / Math.tan((CAMERA.vfovDeg / 2) * toRad);
  return {
    dPan: Math.atan((cx - 0.5) / fx) / toRad,
    dSwivel: Math.atan((cy - 0.5) / fy) / toRad,
  };
}

/**
 * Pose that points the camera (and the nozzle mounted beside it) at the target.
 * If the swivel would pass its mechanical limit, the remaining angle is made up by moving the lift.
 */
export function aimAt(current: Pose, target: BBox): Pose {
  const { dPan, dSwivel } = angularOffset(target);
  const wantedSwivel = current.swivel + dSwivel;
  const swivel = clamp(wantedSwivel, LIMITS.swivelMin, LIMITS.swivelMax);
  const leftover = wantedSwivel - swivel;

  let lift = current.lift;
  if (Math.abs(leftover) > 0.01) {
    // Target sits further below (or above) than the swivel can reach: lower (or raise) the post.
    const dLift = -Math.tan((leftover * Math.PI) / 180) * CAMERA.workingDistanceMm;
    lift = clamp(current.lift + dLift, LIMITS.liftMinMm, LIMITS.liftMaxMm);
  }

  return {
    pan: round1(normalizePan(current.pan + dPan)),
    lift: round1(lift),
    swivel: round1(swivel),
  };
}

export function isAimed(target: BBox): boolean {
  const { dPan, dSwivel } = angularOffset(target);
  return Math.abs(dPan) <= AIM_TOLERANCE_DEG && Math.abs(dSwivel) <= AIM_TOLERANCE_DEG;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
