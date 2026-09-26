import { NextResponse } from "next/server";
import { BadRequest, handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { isPestType } from "@/lib/pests";
import { listPestCaptures } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const pest = url.searchParams.get("pest");
  if (pest && !isPestType(pest)) throw new BadRequest(`Unknown pest ${pest}`);
  const limit = Number(url.searchParams.get("limit") ?? 30);
  return NextResponse.json(
    listPestCaptures(getDb(), { limit, pest: pest && isPestType(pest) ? pest : undefined }),
  );
});
