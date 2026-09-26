import { describe, expect, it } from "vitest";
import { RESERVOIR_EMPTY_PCT, decide, pickTarget, type DecisionInput } from "@/lib/decision";
import type { Detection } from "@/lib/types";

const larva: Detection = { pest: "diamondback_larva", confidence: 0.9, bbox: { x: 0.6, y: 0.5, w: 0.1, h: 0.05 } };
const aphids: Detection = { pest: "aphid_cluster", confidence: 0.7, bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } };
const now = new Date("2026-10-01T02:00:00Z");

function input(over: Partial<DecisionInput> = {}): DecisionInput {
  return {
    detections: [larva],
    settings: { autoFire: true, confidenceThreshold: 0.6, burstMs: 400, cooldownS: 10, reservoirLowPct: 20 },
    mode: "auto",
    pose: { pan: 90, lift: 150, swivel: 60 },
    reservoirPct: 80,
    lastFireAt: null,
    now,
    ...over,
  };
}

describe("decide", () => {
  it("fires at a confident pest and aims toward it", () => {
    const d = decide(input());
    expect(d.action).toBe("fire");
    if (d.action !== "fire") return;
    expect(d.burstMs).toBe(400);
    expect(d.target.pest).toBe("diamondback_larva");
    expect(d.aim.pan).toBeGreaterThan(90);
  });

  it("targets the most confident pest", () => {
    expect(pickTarget([aphids, larva])?.pest).toBe("diamondback_larva");
  });

  it.each([
    ["no_pest", { detections: [] }],
    ["below_threshold", { detections: [{ ...larva, confidence: 0.4 }] }],
    ["paused", { mode: "paused" as const }],
    ["auto_fire_off", { settings: { ...input().settings, autoFire: false } }],
    ["reservoir_empty", { reservoirPct: RESERVOIR_EMPTY_PCT }],
    ["cooldown", { lastFireAt: new Date(now.getTime() - 5_000) }],
  ])("holds with reason %s", (reason, over) => {
    const d = decide(input(over as Partial<DecisionInput>));
    expect(d).toMatchObject({ action: "hold", reason });
  });

  it("fires again once the cooldown has passed", () => {
    expect(decide(input({ lastFireAt: new Date(now.getTime() - 11_000) })).action).toBe("fire");
  });

  it("reports the most important reason first (paused beats cooldown)", () => {
    const d = decide(input({ mode: "paused", lastFireAt: now }));
    expect(d).toMatchObject({ action: "hold", reason: "paused" });
  });
});
