import { NextResponse } from "next/server";
import { BadRequest, handle, num } from "@/lib/api";
import { DEFAULT_DEVICE_ID, getDb } from "@/lib/db";
import { updateSettings } from "@/lib/store";
import type { DeviceSettings, Mode } from "@/lib/types";

export const dynamic = "force-dynamic";

function inRange(value: unknown, field: string, min: number, max: number): number {
  const n = num(value, field);
  if (n < min || n > max) throw new BadRequest(`${field} must be between ${min} and ${max}`);
  return n;
}

export const PATCH = handle(async (req: Request) => {
  const b = await req.json();
  const patch: Partial<DeviceSettings> & { mode?: Mode } = {};
  if (b.autoFire !== undefined) patch.autoFire = Boolean(b.autoFire);
  if (b.mode !== undefined) {
    if (b.mode !== "auto" && b.mode !== "paused") throw new BadRequest('mode must be "auto" or "paused"');
    patch.mode = b.mode;
  }
  if (b.confidenceThreshold !== undefined)
    patch.confidenceThreshold = inRange(b.confidenceThreshold, "confidenceThreshold", 0.1, 0.99);
  if (b.burstMs !== undefined) patch.burstMs = Math.round(inRange(b.burstMs, "burstMs", 100, 3000));
  if (b.cooldownS !== undefined) patch.cooldownS = Math.round(inRange(b.cooldownS, "cooldownS", 0, 600));
  if (b.reservoirLowPct !== undefined)
    patch.reservoirLowPct = Math.round(inRange(b.reservoirLowPct, "reservoirLowPct", 5, 80));
  return NextResponse.json(updateSettings(getDb(), DEFAULT_DEVICE_ID, patch));
});
