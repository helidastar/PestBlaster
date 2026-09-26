import { NextResponse } from "next/server";
import { BadRequest, authDevice, handle, num, parsePose } from "@/lib/api";
import { getDb } from "@/lib/db";
import { recordFire } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The turret confirms a spray it actually made (auto or manual). */
export const POST = handle(async (req: Request) => {
  const auth = authDevice(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  if (body.source !== "auto" && body.source !== "manual") {
    throw new BadRequest('source must be "auto" or "manual"');
  }
  const fire = recordFire(getDb(), {
    deviceId: auth.deviceId,
    source: body.source,
    durationMs: Math.round(num(body.durationMs, "durationMs")),
    pose: parsePose(body.pose),
    captureId: body.captureId == null ? null : num(body.captureId, "captureId"),
  });
  return NextResponse.json(fire, { status: 201 });
});
