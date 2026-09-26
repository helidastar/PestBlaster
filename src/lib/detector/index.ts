import { createHttpDetector } from "./http";
import { createSimulatedDetector } from "./simulated";
import type { Detector } from "./types";

export type { Detector, DetectorInput } from "./types";

let cached: Detector | null = null;

export function getDetector(): Detector {
  if (cached) return cached;
  const kind = process.env.DETECTOR ?? "simulated";
  if (kind === "http") {
    const url = process.env.DETECTOR_URL;
    if (!url) throw new Error("DETECTOR=http needs DETECTOR_URL in .env.local");
    cached = createHttpDetector(url);
  } else {
    cached = createSimulatedDetector();
  }
  return cached;
}
