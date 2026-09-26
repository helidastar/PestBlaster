import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { DEFAULT_DEVICE_ID, getDb } from "@/lib/db";
import { getDetector } from "@/lib/detector";
import {
  getDevice,
  isOnline,
  listCommands,
  listFires,
  listPestCaptures,
  todaySummary,
  unreadAlertCount,
} from "@/lib/store";

export const dynamic = "force-dynamic";

/** Everything the home screen needs in one request. */
export const GET = handle(async () => {
  const db = getDb();
  const device = getDevice(db, DEFAULT_DEVICE_ID)!;
  return NextResponse.json({
    device,
    online: isOnline(device),
    detector: getDetector().name,
    today: todaySummary(db),
    unreadAlerts: unreadAlertCount(db),
    latestCapture: listPestCaptures(db, { limit: 1 })[0] ?? null,
    recentPests: listPestCaptures(db, { limit: 12 }),
    lastFire: listFires(db, { limit: 1 })[0] ?? null,
    commands: listCommands(db, 5),
  });
});
