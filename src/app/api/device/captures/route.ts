import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { BadRequest, authDevice, handle, parsePose } from "@/lib/api";
import { dataDir, getDb } from "@/lib/db";
import { decide } from "@/lib/decision";
import { getDetector } from "@/lib/detector";
import { parseDetections } from "@/lib/detector/http";
import { getDevice, lastFireAt, saveCapture } from "@/lib/store";

export const dynamic = "force-dynamic";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
};

/**
 * One camera snapshot from the turret (multipart form: image, pose, and for the
 * simulator only, simTruth). Runs pest detection and the fire rule, stores the
 * result, and tells the turret whether to spray and where to aim.
 */
export const POST = handle(async (req: Request) => {
  const auth = authDevice(req);
  if (auth instanceof NextResponse) return auth;
  const form = await req.formData();
  const image = form.get("image");
  if (!(image instanceof Blob)) throw new BadRequest("image file is required");
  const ext = EXT[image.type];
  if (!ext) throw new BadRequest(`image must be JPEG, PNG or SVG, got ${image.type || "unknown"}`);
  const pose = parsePose(JSON.parse(String(form.get("pose") ?? "null")));
  const simRaw = form.get("simTruth");
  const simTruth = typeof simRaw === "string" ? parseDetections(JSON.parse(simRaw)) : undefined;

  const db = getDb();
  const device = getDevice(db, auth.deviceId);
  if (!device) throw new BadRequest(`Unknown device ${auth.deviceId}`);

  const bytes = new Uint8Array(await image.arrayBuffer());
  const detections = await getDetector().detect({ image: bytes, contentType: image.type, simTruth });

  const decision = decide({
    detections,
    settings: device.settings,
    mode: device.mode,
    pose,
    reservoirPct: device.reservoirPct,
    lastFireAt: lastFireAt(db, auth.deviceId),
    now: new Date(),
  });

  // Only snapshots with something in them are kept, so the disk does not fill with empty leaves.
  let file: string | null = null;
  if (detections.length > 0) {
    const dir = path.join(dataDir(), "snapshots");
    fs.mkdirSync(dir, { recursive: true });
    file = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(dir, file), bytes);
  }

  const captureId = saveCapture(db, { deviceId: auth.deviceId, image: file, pose, detections, decision });
  return NextResponse.json({ captureId, detections, decision });
});
