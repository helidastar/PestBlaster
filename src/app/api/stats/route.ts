import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { dailyStats } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const days = Math.min(31, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 7) || 7));
  return NextResponse.json(dailyStats(getDb(), days));
});
