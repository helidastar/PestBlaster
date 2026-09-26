import { describe, expect, it } from "vitest";
import { DEFAULT_SCAN, scanWaypoints } from "@/lib/scan";

describe("scanWaypoints", () => {
  const points = scanWaypoints();

  it("covers all 360° in pan steps, every height, top and underside", () => {
    expect(points).toHaveLength(12 * 3 * 2);
    expect(new Set(points.map((p) => p.pan)).size).toBe(12);
    expect(Math.max(...points.map((p) => p.pan))).toBe(330);
    expect(new Set(points.map((p) => p.lift))).toEqual(new Set(DEFAULT_SCAN.liftLevelsMm));
    expect(points.some((p) => p.swivel > 90)).toBe(true);
  });

  it("alternates lift direction so the post does not return empty", () => {
    const first = points.filter((p) => p.pan === 0).map((p) => p.lift);
    const second = points.filter((p) => p.pan === 30).map((p) => p.lift);
    expect(first[0]).toBe(300);
    expect(second[0]).toBe(0);
  });
});
