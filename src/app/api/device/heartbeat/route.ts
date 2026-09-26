import { NextResponse } from "next/server";
import { authDevice, handle, num, parsePose } from "@/lib/api";
import { getDb } from "@/lib/db";
import { recordHeartbeat, takePendingCommands } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Turret check-in, sent every few seconds. Reports pose and reservoir level;
 * the reply carries the current settings and any manual commands to run.
 */
export const POST = handle(async (req: Request) => {
  const auth = authDevice(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const db = getDb();
  const device = recordHeartbeat(db, auth.deviceId, {
    pose: parsePose(body.pose),
    reservoirPct: Math.max(0, Math.min(100, num(body.reservoirPct, "reservoirPct"))),
    firmware: typeof body.firmware === "string" ? body.firmware : undefined,
  });
  return NextResponse.json({
    mode: device.mode,
    settings: device.settings,
    commands: takePendingCommands(db, auth.deviceId),
  });
});
