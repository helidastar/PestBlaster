/**
 * Turret simulator: plays the part of the ESP32 so the whole software loop can be
 * tested before the hardware is built. It follows the real scan path, "photographs"
 * a synthetic top-down view of the lettuce bed (sometimes with pests on it), sends it to the backend,
 * aims and sprays when told to, uses up deterrent, and obeys manual commands.
 *
 *   npm run simulate                       # runs until Ctrl+C
 *   npm run simulate -- --once             # one full 360° sweep, then exit
 *   npm run simulate -- --step 800 --pest-rate 0.4 --reservoir 35
 *   npm run simulate -- --photos training/dataset/images/test   # real photos, for DETECTOR=http
 *
 * The HTTP calls here are the same ones the firmware will make (see docs, section 10.1).
 */
import fs from "node:fs";
import path from "node:path";
import { scanWaypoints } from "../src/lib/scan";
import { PEST_TYPES, type PestType } from "../src/lib/pests";
import type { Command, Decision, Detection, DeviceSettings, Pose } from "../src/lib/types";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = opt("url", process.env.PESTBLASTER_URL ?? "http://localhost:3000");
const KEY = process.env.DEVICE_API_KEY || "pestblaster-dev";
const STEP_MS = Number(opt("step", "1500"));
const PEST_RATE = Number(opt("pest-rate", "0.3"));
/** Folder of real JPEG/PNG photos to send instead of drawn leaves (use with DETECTOR=http). */
const PHOTOS_DIR = opt("photos", "");
const PHOTOS = PHOTOS_DIR ? listPhotos(PHOTOS_DIR) : [];

function listPhotos(dir: string): string[] {
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).map((f) => path.join(dir, f))
    : [];
  if (files.length === 0) {
    console.error(`No JPEG or PNG photos found in ${dir}`);
    process.exit(1);
  }
  return files;
}
/** Deterrent used per second of spraying, in percent of a full 2.5 L reservoir (R385 pump ≈ 2 L/min). */
const PCT_PER_SPRAY_SECOND = 1.3;
const HOME: Pose = { pan: 0, lift: 300, swivel: 60 };
/** How often the turret checks for a "stop" while a manual spray runs. */
const STOP_POLL_MS = 250;

let pose: Pose = { ...HOME };
let reservoir = Number(opt("reservoir", "100"));
let settings: DeviceSettings | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => console.log(`${new Date().toLocaleTimeString()}  ${msg}`);
const fmtPose = (p: Pose) => `pan ${p.pan.toFixed(0)}° lift ${p.lift.toFixed(0)}mm swivel ${p.swivel.toFixed(0)}°`;

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "x-device-key": KEY, "x-device-id": "turret-1", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

const postJson = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// ---------- synthetic scene ----------

/** Same stop, same plants: the bed layout is seeded from where the camera points. */
function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

interface Head { x: number; y: number; r: number; turn: number }

/** Lettuce heads in view, top down: three rows on the bed, shifted as the turret turns. */
function bedHeads(p: Pose): Head[] {
  const rand = seeded(Math.round(p.pan) * 7919 + Math.round(p.lift));
  const heads: Head[] = [];
  const shift = ((p.pan % 30) / 30) * 120;
  for (let row = 0; row < 3; row++) {
    const y = 95 + row * 150 + (rand() - 0.5) * 16;
    for (let col = -1; col < 6; col++) {
      const x = col * 125 + 60 - shift + (row % 2) * 40 + (rand() - 0.5) * 18;
      if (x < -60 || x > 700) continue;
      heads.push({ x, y, r: 50 + rand() * 14, turn: rand() * Math.PI });
    }
  }
  return heads;
}

function randomPests(p: Pose): Detection[] {
  if (Math.random() >= PEST_RATE) return [];
  const heads = bedHeads(p).filter((h) => h.x > 70 && h.x < 570);
  const count = Math.random() < 0.25 ? 2 : 1;
  const out: Detection[] = [];
  for (let i = 0; i < count && heads.length > 0; i++) {
    // Each pest sits on a different lettuce head.
    const head = heads.splice(Math.floor(Math.random() * heads.length), 1)[0];
    const pest: PestType = PEST_TYPES[Math.floor(Math.random() * 3)];
    const size = { armyworm_cutworm: [0.12, 0.06], looper: [0.11, 0.07], aphid_colony: [0.13, 0.12] }[pest];
    const base = { armyworm_cutworm: 0.84, looper: 0.72, aphid_colony: 0.8 }[pest];
    const cx = (head.x + (Math.random() - 0.5) * head.r * 0.6) / 640;
    const cy = (head.y + (Math.random() - 0.5) * head.r * 0.6) / 480;
    out.push({
      pest,
      confidence: base,
      bbox: {
        x: round3(clamp01(cx - size[0] / 2, 1 - size[0])),
        y: round3(clamp01(cy - size[1] / 2, 1 - size[1])),
        w: size[0],
        h: size[1],
      },
    });
  }
  return out;
}

const clamp01 = (n: number, max: number) => Math.min(max, Math.max(0, n));

function drawPest(d: Detection): string {
  const W = 640, H = 480;
  const x = d.bbox.x * W, y = d.bbox.y * H, w = d.bbox.w * W, h = d.bbox.h * H;
  const cx = x + w / 2, cy = y + h / 2;
  if (d.pest === "armyworm_cutworm") {
    const segs = Array.from({ length: 6 }, (_, i) =>
      `<ellipse cx="${x + (i + 0.5) * (w / 6)}" cy="${cy}" rx="${w / 10}" ry="${h / 3}" fill="#7b6a45" stroke="#3f3420" stroke-width="1"/>`,
    ).join("");
    const stripe = `<line x1="${x + 3}" y1="${cy + h / 6}" x2="${x + w - 6}" y2="${cy + h / 6}" stroke="#2a2214" stroke-width="2"/>`;
    return `<g>${segs}${stripe}<circle cx="${x + w - 4}" cy="${cy}" r="${h / 3.4}" fill="#2f2617"/></g>`;
  }
  if (d.pest === "looper") {
    return `<path d="M ${x + 4} ${y + h - 4} Q ${cx} ${y - h * 0.5} ${x + w - 4} ${y + h - 4}" fill="none" stroke="#b8e07a" stroke-width="${h / 3}" stroke-linecap="round"/>
      <path d="M ${x + 4} ${y + h - 4} Q ${cx} ${y - h * 0.5} ${x + w - 4} ${y + h - 4}" fill="none" stroke="#f1fbd9" stroke-width="1.5" stroke-dasharray="3 5"/>`;
  }
  const dots = Array.from({ length: 26 }, () => {
    const dx = cx + (Math.random() - 0.5) * w * 0.85, dy = cy + (Math.random() - 0.5) * h * 0.85;
    return `<ellipse cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" rx="3.4" ry="2.4" fill="#e7f0a0" stroke="#5c6e1f" stroke-width="0.9"/>`;
  }).join("");
  return `<g>${dots}</g>`;
}

/** One ruffled lettuce head seen from above: a ring of crinkled outer leaves around a pale heart. */
function drawHead(h: Head): string {
  const leafRing = (count: number, dist: number, rx: number, ry: number, fill: string, edge: string, phase: number) =>
    Array.from({ length: count }, (_, i) => {
      const a = h.turn + phase + (i / count) * Math.PI * 2;
      const cx = h.x + Math.cos(a) * h.r * dist, cy = h.y + Math.sin(a) * h.r * dist;
      const deg = (a * 180) / Math.PI;
      return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(h.r * rx).toFixed(1)}" ry="${(h.r * ry).toFixed(1)}" transform="rotate(${deg.toFixed(0)} ${cx.toFixed(1)} ${cy.toFixed(1)})" fill="${fill}" stroke="${edge}" stroke-width="2"/>`;
    }).join("");
  const ribs = Array.from({ length: 9 }, (_, i) => {
    const a = h.turn + (i / 9) * Math.PI * 2;
    return `<line x1="${h.x}" y1="${h.y}" x2="${(h.x + Math.cos(a) * h.r * 0.9).toFixed(1)}" y2="${(h.y + Math.sin(a) * h.r * 0.9).toFixed(1)}" stroke="#e4f6b6" stroke-width="1.6" opacity="0.5"/>`;
  }).join("");
  return `<g>
    <circle cx="${h.x + 5}" cy="${h.y + 8}" r="${h.r * 1.02}" fill="#000" opacity="0.4"/>
    ${leafRing(11, 0.62, 0.42, 0.3, "#5aa632", "#3f7f22", 0)}
    ${leafRing(9, 0.42, 0.36, 0.27, "#7cc444", "#5aa632", 0.3)}
    ${ribs}
    ${leafRing(7, 0.22, 0.26, 0.2, "#a6dd5f", "#86c64a", 0.6)}
    <circle cx="${h.x}" cy="${h.y}" r="${h.r * 0.17}" fill="#d9f293"/>
  </g>`;
}

/** A top-down camera frame of the lettuce bed, with any pests drawn on the heads. */
function renderBed(p: Pose, pests: Detection[]): string {
  const rand = seeded(Math.round(p.pan) * 131 + 7);
  const soil = Array.from({ length: 160 }, () =>
    `<circle cx="${(rand() * 640).toFixed(0)}" cy="${(rand() * 480).toFixed(0)}" r="${(1 + rand() * 2.5).toFixed(1)}" fill="${rand() < 0.5 ? "#5a4330" : "#2e231a"}" opacity="0.7"/>`,
  ).join("");
  const mulch = [95, 245, 395].map((y) => `<rect x="0" y="${y - 52}" width="640" height="104" fill="#1c1d1b"/>`).join("");
  const stamp = `CAM 1 · BED A · pan ${p.pan.toFixed(0)}° · lift ${p.lift.toFixed(0)} mm`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <rect width="640" height="480" fill="#4a3727"/>
  ${soil}
  ${mulch}
  ${bedHeads(p).map(drawHead).join("\n  ")}
  ${pests.map(drawPest).join("\n  ")}
  <rect width="640" height="480" fill="url(#v)"/>
  <defs><radialGradient id="v" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.45"/></radialGradient></defs>
  <text x="12" y="468" font-family="monospace" font-size="13" fill="#f2f6e9" opacity="0.85">${stamp}</text>
</svg>`;
}

// ---------- turret actions ----------

/** Commands that arrived while a manual spray was running; run after it ends. */
const queued: Command[] = [];

async function checkIn(): Promise<Command[]> {
  const res = await postJson<{ mode: string; settings: DeviceSettings; commands: Command[] }>(
    "/api/device/heartbeat",
    { pose, reservoirPct: round1(reservoir), firmware: "simulator-0.2" },
  );
  settings = res.settings;
  return res.commands;
}

async function heartbeat(): Promise<void> {
  const cmds = [...queued.splice(0), ...(await checkIn())];
  for (const cmd of cmds) await runCommand(cmd);
}

async function spray(durationMs: number, source: "auto" | "manual", captureId: number | null) {
  if (reservoir <= 0) {
    log("  ✗ reservoir empty, cannot spray");
    return false;
  }
  log(`  💧 spraying up to ${durationMs} ms (${source}) at ${fmtPose(pose)}`);
  const start = Date.now();
  if (source === "manual") {
    // A manual spray lasts while the button is held: keep checking in so a "stop" ends it early.
    let stopCmd: Command | null = null;
    while (!stopCmd && Date.now() - start < durationMs) {
      await sleep(Math.min(STOP_POLL_MS, durationMs - (Date.now() - start)));
      for (const cmd of await checkIn()) {
        if (cmd.type === "stop" && !stopCmd) stopCmd = cmd;
        else queued.push(cmd);
      }
    }
    if (stopCmd) {
      log(`→ manual command #${stopCmd.id}: stop`);
      await postJson(`/api/device/commands/${stopCmd.id}`, { ok: true });
    }
  } else {
    await sleep(durationMs);
  }
  const sprayed = Math.min(durationMs, Date.now() - start);
  reservoir = Math.max(0, reservoir - (sprayed / 1000) * PCT_PER_SPRAY_SECOND);
  log(`  💧 sprayed ${sprayed} ms`);
  await postJson("/api/device/fires", { source, durationMs: sprayed, pose, captureId });
  return true;
}

async function runCommand(cmd: Command) {
  log(`→ manual command #${cmd.id}: ${cmd.type} ${JSON.stringify(cmd.payload)}`);
  let ok = true;
  if (cmd.type === "fire") ok = await spray(Number(cmd.payload.durationMs ?? 400), "manual", null);
  else if (cmd.type === "move") pose = cmd.payload.pose as Pose;
  else if (cmd.type === "home") pose = { ...HOME };
  // "stop" with no spray running has nothing to stop.
  await postJson(`/api/device/commands/${cmd.id}`, { ok });
}

async function capture(): Promise<void> {
  const form = new FormData();
  let truth: Detection[] = [];
  if (PHOTOS.length > 0) {
    // A real photo: the detector has to find the pests itself, so no ground truth is sent.
    const file = PHOTOS[Math.floor(Math.random() * PHOTOS.length)];
    const type = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
    form.set("image", new Blob([fs.readFileSync(file)], { type }), path.basename(file));
  } else {
    truth = randomPests(pose);
    form.set("image", new Blob([renderBed(pose, truth)], { type: "image/svg+xml" }), "snap.svg");
    form.set("simTruth", JSON.stringify(truth));
  }
  form.set("pose", JSON.stringify(pose));
  const res = await api<{ captureId: number; detections: Detection[]; decision: Decision }>(
    "/api/device/captures",
    { method: "POST", body: form },
  );
  if (res.detections.length === 0) {
    log(`  · ${fmtPose(pose)}  clear${truth.length ? " (missed a pest)" : ""}`);
    return;
  }
  const seen = res.detections.map((d) => `${d.pest} ${(d.confidence * 100).toFixed(0)}%`).join(", ");
  log(`  ! ${fmtPose(pose)}  saw ${seen}`);
  if (res.decision.action === "fire") {
    const back = { ...pose };
    pose = res.decision.aim;
    log(`  ⌖ aiming → ${fmtPose(pose)}`);
    await sleep(400);
    await spray(res.decision.burstMs, "auto", res.captureId);
    pose = back;
  } else {
    log(`  – holding: ${res.decision.reason}`);
  }
}

async function main() {
  log(
    `PestBlaster simulator → ${BASE}  (step ${STEP_MS} ms, ` +
      (PHOTOS.length ? `${PHOTOS.length} real photos from ${PHOTOS_DIR})` : `pest rate ${PEST_RATE})`),
  );
  const path = scanWaypoints();
  let sweep = 0;
  for (;;) {
    sweep++;
    log(`— sweep ${sweep}: ${path.length} stops, reservoir ${reservoir.toFixed(0)}% —`);
    for (const wp of path) {
      pose = wp;
      await heartbeat();
      await capture();
      await sleep(STEP_MS);
    }
    if (flag("once")) break;
  }
  await heartbeat();
  log(`done. reservoir ${reservoir.toFixed(0)}%`);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

main().catch((e) => {
  console.error(`Simulator stopped: ${e instanceof Error ? e.message : e}`);
  console.error(`Is the app running at ${BASE}? Start it with "npm run dev" first.`);
  process.exit(1);
});
