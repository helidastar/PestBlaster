import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { listAlerts, markAlertsRead } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = handle(async () => NextResponse.json(listAlerts(getDb())));

/** Marks every alert as read. */
export const POST = handle(async () => {
  markAlertsRead(getDb());
  return NextResponse.json({ ok: true });
});
