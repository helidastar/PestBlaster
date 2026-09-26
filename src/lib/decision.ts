import { aimAt } from "./targeting";
import type { Decision, Detection, DeviceSettings, Mode, Pose } from "./types";

export interface DecisionInput {
  detections: Detection[];
  settings: DeviceSettings;
  mode: Mode;
  pose: Pose;
  reservoirPct: number;
  lastFireAt: Date | null;
  now: Date;
}

/** Below this level the pump would run dry, so the turret never fires. */
export const RESERVOIR_EMPTY_PCT = 3;

/** Highest-confidence detection; ties go to the larger box (closer / bigger infestation). */
export function pickTarget(detections: Detection[]): Detection | null {
  if (detections.length === 0) return null;
  return [...detections].sort(
    (a, b) => b.confidence - a.confidence || b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h,
  )[0];
}

/**
 * The fire / hold rule for one camera capture. Checks run in a fixed order so the
 * reason shown to the grower is always the most important one.
 */
export function decide(input: DecisionInput): Decision {
  const target = pickTarget(input.detections);
  if (!target) return { action: "hold", reason: "no_pest", target: null };
  if (target.confidence < input.settings.confidenceThreshold) {
    return { action: "hold", reason: "below_threshold", target };
  }
  if (input.mode === "paused") return { action: "hold", reason: "paused", target };
  if (!input.settings.autoFire) return { action: "hold", reason: "auto_fire_off", target };
  if (input.reservoirPct <= RESERVOIR_EMPTY_PCT) {
    return { action: "hold", reason: "reservoir_empty", target };
  }
  if (input.lastFireAt) {
    const elapsedS = (input.now.getTime() - input.lastFireAt.getTime()) / 1000;
    if (elapsedS < input.settings.cooldownS) return { action: "hold", reason: "cooldown", target };
  }
  return {
    action: "fire",
    target,
    aim: aimAt(input.pose, target.bbox),
    burstMs: input.settings.burstMs,
  };
}

export const HOLD_REASON_TEXT: Record<string, string> = {
  no_pest: "No pest in view",
  below_threshold: "Not sure enough to spray",
  paused: "Turret paused",
  auto_fire_off: "Auto-spray is off",
  reservoir_empty: "Reservoir empty",
  cooldown: "Waiting between sprays",
};
