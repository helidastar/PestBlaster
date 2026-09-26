import { clamp } from "../targeting";
import type { Detection } from "../types";
import type { Detector, DetectorInput } from "./types";

export interface SimulatedOptions {
  /** Chance a real pest is not seen at all (e.g. a looper blending into the leaf). */
  missRate: number;
  /** Largest random change to the true confidence. */
  confidenceJitter: number;
  /** Largest random shift of the box, as a fraction of the image. */
  boxJitter: number;
  random: () => number;
}

const DEFAULTS: SimulatedOptions = {
  missRate: 0.08,
  confidenceJitter: 0.12,
  boxJitter: 0.02,
  random: Math.random,
};

/**
 * Increment 1 stand-in for the trained vision model. It reads the ground truth
 * the simulator drew into the snapshot and adds realistic mistakes, so the rest
 * of the pipeline (decision, aiming, spraying, logging, the app) can be tested
 * before the real model exists. Replace with DETECTOR=http once the model is trained.
 */
export function createSimulatedDetector(opts: Partial<SimulatedOptions> = {}): Detector {
  const o = { ...DEFAULTS, ...opts };
  const jitter = (max: number) => (o.random() * 2 - 1) * max;
  return {
    name: "simulated",
    async detect(input: DetectorInput): Promise<Detection[]> {
      const truth = input.simTruth ?? [];
      return truth
        .filter(() => o.random() >= o.missRate)
        .map((d) => ({
          pest: d.pest,
          confidence: round2(clamp(d.confidence + jitter(o.confidenceJitter), 0.05, 0.99)),
          bbox: {
            x: round3(clamp(d.bbox.x + jitter(o.boxJitter), 0, 1 - d.bbox.w)),
            y: round3(clamp(d.bbox.y + jitter(o.boxJitter), 0, 1 - d.bbox.h)),
            w: d.bbox.w,
            h: d.bbox.h,
          },
        }));
    },
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
