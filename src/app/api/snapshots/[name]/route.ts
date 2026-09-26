import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/db";
import { error } from "@/lib/api";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", svg: "image/svg+xml" };

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  // Only plain file names we generated; blocks ../ path tricks.
  if (!/^[\w-]+\.(jpg|png|svg)$/.test(name)) return error(400, "Bad snapshot name");
  const file = path.join(dataDir(), "snapshots", name);
  if (!fs.existsSync(file)) return error(404, "Snapshot not found");
  const ext = name.split(".").pop()!;
  return new Response(fs.readFileSync(file), {
    headers: {
      "content-type": TYPES[ext],
      "cache-control": "public, max-age=31536000, immutable",
      // SVG snapshots come from the simulator; never let them run scripts.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
