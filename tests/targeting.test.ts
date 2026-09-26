import { describe, expect, it } from "vitest";
import { AIM_TOLERANCE_DEG, LIMITS, aimAt, angularOffset, isAimed, normalizePan } from "@/lib/targeting";

const centered = { x: 0.45, y: 0.45, w: 0.1, h: 0.1 };

describe("targeting", () => {
  it("wraps pan into 0–360", () => {
    expect(normalizePan(370)).toBe(10);
    expect(normalizePan(-30)).toBe(330);
    expect(normalizePan(360)).toBe(0);
  });

  it("does not move when the pest is already in the center", () => {
    const pose = { pan: 90, lift: 150, swivel: 60 };
    expect(aimAt(pose, centered)).toEqual(pose);
    expect(isAimed(centered)).toBe(true);
  });

  it("pans right for a pest on the right edge by about half the field of view", () => {
    const { dPan, dSwivel } = angularOffset({ x: 0.9, y: 0.45, w: 0.1, h: 0.1 });
    expect(dPan).toBeGreaterThan(25);
    expect(dPan).toBeLessThanOrEqual(34);
    expect(dSwivel).toBeCloseTo(0, 5);
  });

  it("tilts down for a pest low in the frame and wraps pan past 360", () => {
    const aim = aimAt({ pan: 355, lift: 150, swivel: 60 }, { x: 0.8, y: 0.8, w: 0.1, h: 0.1 });
    expect(aim.pan).toBeGreaterThan(0);
    expect(aim.pan).toBeLessThan(40);
    expect(aim.swivel).toBeGreaterThan(60);
    expect(aim.lift).toBe(150);
  });

  it("moves the lift when the swivel is already at its limit", () => {
    const aim = aimAt({ pan: 0, lift: 150, swivel: LIMITS.swivelMax }, { x: 0.45, y: 0.9, w: 0.1, h: 0.1 });
    expect(aim.swivel).toBe(LIMITS.swivelMax);
    expect(aim.lift).toBeLessThan(150);
    expect(aim.lift).toBeGreaterThanOrEqual(LIMITS.liftMinMm);
  });

  it("never drives the lift outside its 30 cm travel", () => {
    const aim = aimAt({ pan: 0, lift: 5, swivel: LIMITS.swivelMax }, { x: 0.45, y: 0.95, w: 0.05, h: 0.05 });
    expect(aim.lift).toBe(LIMITS.liftMinMm);
  });

  it("uses a small aim tolerance", () => {
    expect(AIM_TOLERANCE_DEG).toBeLessThanOrEqual(5);
    expect(isAimed({ x: 0.7, y: 0.45, w: 0.1, h: 0.1 })).toBe(false);
  });
});
