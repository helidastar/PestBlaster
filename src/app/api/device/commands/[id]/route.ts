import { NextResponse } from "next/server";
import { authDevice, error, handle, num } from "@/lib/api";
import { getDb } from "@/lib/db";
import { completeCommand } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The turret reports that it finished (or could not finish) a manual command. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const auth = authDevice(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const cmd = completeCommand(getDb(), auth.deviceId, num(id, "id"), body.ok !== false);
  return cmd ? NextResponse.json(cmd) : error(404, "No such command");
});
