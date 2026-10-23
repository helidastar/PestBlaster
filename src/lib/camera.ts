import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./db";
import type { Detection, HoldReason, Pose } from "./types";

/** The newest camera frame, kept whether or not a pest was in it, for the home screen. */
export interface LiveFrame {
  image: string;
  createdAt: string;
  pose: Pose;
  detections: Detection[];
  decision: "fire" | "hold";
  holdReason: HoldReason | null;
}

const dir = () => path.join(dataDir(), "snapshots");
const metaFile = () => path.join(dataDir(), "live.json");

/** Saves the frame under a new name and deletes the one before, so only one live frame is on disk. */
export function saveLiveFrame(bytes: Uint8Array, ext: string, frame: Omit<LiveFrame, "image" | "createdAt">): void {
  fs.mkdirSync(dir(), { recursive: true });
  const old = readLiveFrame();
  const image = `live-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(dir(), image), bytes);
  fs.writeFileSync(metaFile(), JSON.stringify({ ...frame, image, createdAt: new Date().toISOString() }));
  if (old && old.image !== image) fs.rmSync(path.join(dir(), old.image), { force: true });
}

export function readLiveFrame(): LiveFrame | null {
  try {
    const frame = JSON.parse(fs.readFileSync(metaFile(), "utf8")) as LiveFrame;
    return fs.existsSync(path.join(dir(), frame.image)) ? frame : null;
  } catch {
    return null;
  }
}
