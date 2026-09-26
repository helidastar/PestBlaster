import { NextResponse } from "next/server";
import { DEFAULT_DEVICE_ID } from "./db";
import { LIMITS, clamp, normalizePan } from "./targeting";
import type { Pose } from "./types";

export const DEV_DEVICE_KEY = "pestblaster-dev";

export function deviceKey(): string {
  return process.env.DEVICE_API_KEY || DEV_DEVICE_KEY;
}

/** Turret requests carry x-device-key (shared secret) and optionally x-device-id. */
export function authDevice(req: Request): { deviceId: string } | NextResponse {
  if (req.headers.get("x-device-key") !== deviceKey()) {
    return error(401, "Missing or wrong x-device-key header.");
  }
  return { deviceId: req.headers.get("x-device-id") || DEFAULT_DEVICE_ID };
}

export function error(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export class BadRequest extends Error {}

export function num(value: unknown, field: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new BadRequest(`${field} must be a number`);
  return n;
}

export function parsePose(raw: unknown): Pose {
  if (!raw || typeof raw !== "object") throw new BadRequest("pose must be an object with pan, lift, swivel");
  const p = raw as Record<string, unknown>;
  return {
    pan: normalizePan(num(p.pan, "pose.pan")),
    lift: clamp(num(p.lift, "pose.lift"), LIMITS.liftMinMm, LIMITS.liftMaxMm),
    swivel: clamp(num(p.swivel, "pose.swivel"), LIMITS.swivelMin, LIMITS.swivelMax),
  };
}

/** Wraps a handler so validation errors become 400s instead of 500s. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response> | Response) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof BadRequest) return error(400, e.message);
      if (e instanceof SyntaxError) return error(400, "Body is not valid JSON.");
      console.error(e);
      return error(500, e instanceof Error ? e.message : "Server error");
    }
  };
}
