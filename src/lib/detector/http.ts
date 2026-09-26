import { isPestType } from "../pests";
import type { Detection } from "../types";
import type { Detector, DetectorInput } from "./types";

/**
 * Sends the snapshot to an external model server (for example a Python YOLO
 * service on the laptop, or a hosted endpoint) and reads back detections.
 *
 * Contract: POST raw image bytes, Content-Type = image type.
 * Response: { "detections": [ { "pest": "looper", "confidence": 0.91,
 *             "bbox": { "x": 0.4, "y": 0.3, "w": 0.1, "h": 0.08 } } ] }
 * Box values are fractions of the image width/height, origin top-left.
 */
export function createHttpDetector(url: string, fetchImpl: typeof fetch = fetch): Detector {
  return {
    name: "http",
    async detect(input: DetectorInput): Promise<Detection[]> {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": input.contentType },
        body: Buffer.from(input.image),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Detector at ${url} returned HTTP ${res.status}`);
      const body = (await res.json()) as { detections?: unknown };
      return parseDetections(body.detections);
    },
  };
}

/** Keeps only well-formed detections of the three supported pests. */
export function parseDetections(raw: unknown): Detection[] {
  if (!Array.isArray(raw)) return [];
  const out: Detection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const d = item as Record<string, unknown>;
    const b = d.bbox as Record<string, unknown> | undefined;
    const nums = b && [b.x, b.y, b.w, b.h];
    if (!isPestType(d.pest) || typeof d.confidence !== "number" || !nums) continue;
    if (!nums.every((n) => typeof n === "number" && n >= 0 && n <= 1)) continue;
    out.push({
      pest: d.pest,
      confidence: d.confidence,
      bbox: { x: b.x as number, y: b.y as number, w: b.w as number, h: b.h as number },
    });
  }
  return out;
}
