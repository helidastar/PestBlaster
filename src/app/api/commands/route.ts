import { NextResponse } from "next/server";
import { BadRequest, handle, num, parsePose } from "@/lib/api";
import { DEFAULT_DEVICE_ID, getDb } from "@/lib/db";
import { listCommands, queueCommand } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = handle(async () => NextResponse.json(listCommands(getDb())));

/** Manual override from the app: spray now, move to a pose, or return home. */
export const POST = handle(async (req: Request) => {
  const b = await req.json();
  const db = getDb();
  switch (b.type) {
    case "fire": {
      const durationMs = b.durationMs === undefined ? 400 : Math.round(num(b.durationMs, "durationMs"));
      if (durationMs < 100 || durationMs > 3000) throw new BadRequest("durationMs must be 100–3000");
      return NextResponse.json(queueCommand(db, DEFAULT_DEVICE_ID, "fire", { durationMs }), { status: 201 });
    }
    case "move":
      return NextResponse.json(queueCommand(db, DEFAULT_DEVICE_ID, "move", { pose: parsePose(b.pose) }), {
        status: 201,
      });
    case "home":
      return NextResponse.json(queueCommand(db, DEFAULT_DEVICE_ID, "home"), { status: 201 });
    default:
      throw new BadRequest('type must be "fire", "move" or "home"');
  }
});
