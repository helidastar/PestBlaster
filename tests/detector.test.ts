import { describe, expect, it } from "vitest";
import { createHttpDetector, parseDetections } from "@/lib/detector/http";
import { createSimulatedDetector } from "@/lib/detector/simulated";
import type { Detection } from "@/lib/types";

const truth: Detection[] = [
  { pest: "looper", confidence: 0.8, bbox: { x: 0.2, y: 0.3, w: 0.1, h: 0.1 } },
];

describe("simulated detector", () => {
  it("finds the pests that are really there, with noise inside the limits", async () => {
    const det = createSimulatedDetector({ missRate: 0 });
    const out = await det.detect({ image: new Uint8Array(), contentType: "image/svg+xml", simTruth: truth });
    expect(out).toHaveLength(1);
    expect(out[0].pest).toBe("looper");
    expect(Math.abs(out[0].confidence - 0.8)).toBeLessThanOrEqual(0.12 + 1e-9);
    expect(Math.abs(out[0].bbox.x - 0.2)).toBeLessThanOrEqual(0.02 + 1e-9);
  });

  it("can miss a pest", async () => {
    const det = createSimulatedDetector({ missRate: 1 });
    expect(await det.detect({ image: new Uint8Array(), contentType: "image/png", simTruth: truth })).toEqual([]);
  });

  it("sees nothing in a real camera image (no ground truth)", async () => {
    const det = createSimulatedDetector();
    expect(await det.detect({ image: new Uint8Array([1]), contentType: "image/jpeg" })).toEqual([]);
  });
});

describe("http detector", () => {
  it("drops unknown pests and malformed boxes", () => {
    const out = parseDetections([
      { pest: "looper", confidence: 0.9, bbox: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
      { pest: "grasshopper", confidence: 0.9, bbox: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
      { pest: "aphid_cluster", confidence: 0.9, bbox: { x: 2, y: 0.1, w: 0.1, h: 0.1 } },
      { pest: "aphid_cluster", confidence: "high", bbox: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
      null,
    ]);
    expect(out.map((d) => d.pest)).toEqual(["looper"]);
  });

  it("posts the image to the model server and reads its answer", async () => {
    let sentType = "";
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sentType = new Headers(init.headers).get("content-type") ?? "";
      return new Response(JSON.stringify({ detections: truth }), { status: 200 });
    }) as unknown as typeof fetch;
    const det = createHttpDetector("http://model/detect", fakeFetch);
    const out = await det.detect({ image: new Uint8Array([1, 2]), contentType: "image/jpeg" });
    expect(sentType).toBe("image/jpeg");
    expect(out).toEqual(truth);
  });

  it("fails loudly when the model server errors", async () => {
    const fakeFetch = (async () => new Response("boom", { status: 503 })) as unknown as typeof fetch;
    const det = createHttpDetector("http://model/detect", fakeFetch);
    await expect(det.detect({ image: new Uint8Array(), contentType: "image/jpeg" })).rejects.toThrow("503");
  });
});
