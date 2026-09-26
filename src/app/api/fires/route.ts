import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { listFires } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  return NextResponse.json(listFires(getDb(), { limit }));
});
