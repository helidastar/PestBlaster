import { LIMITS } from "./targeting";
import type { Pose } from "./types";

export interface ScanPlan {
  panStepDeg: number;
  liftLevelsMm: number[];
  /** 60° looks down at the top of the leaves, 130° swings back to look under them. */
  swivelAnglesDeg: number[];
}

export const DEFAULT_SCAN: ScanPlan = {
  panStepDeg: 30,
  liftLevelsMm: [LIMITS.liftMaxMm, 150, 0],
  swivelAnglesDeg: [60, 130],
};

/**
 * Waypoints for one full sweep: top to soil level at each pan stop, checking the
 * top and the underside of the leaves at each height. The lift direction alternates
 * between pan stops so the post never makes a full empty return trip.
 */
export function scanWaypoints(plan: ScanPlan = DEFAULT_SCAN): Pose[] {
  const points: Pose[] = [];
  const stops = Math.round(360 / plan.panStepDeg);
  for (let i = 0; i < stops; i++) {
    const pan = i * plan.panStepDeg;
    const lifts = i % 2 === 0 ? plan.liftLevelsMm : [...plan.liftLevelsMm].reverse();
    for (const lift of lifts) {
      for (const swivel of plan.swivelAnglesDeg) points.push({ pan, lift, swivel });
    }
  }
  return points;
}
