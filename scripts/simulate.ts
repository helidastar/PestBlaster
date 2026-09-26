/**
 * Turret simulator: plays the part of the ESP32 so the whole software loop can be
 * tested before the hardware is built. It follows the real scan path, "photographs"
 * a synthetic lettuce leaf (sometimes with pests on it), sends it to the backend,
 * aims and sprays when told to, uses up deterrent, and obeys manual commands.
 *
 *   npm run simulate                       # runs until Ctrl+C
 *   npm run simulate -- --once             # one full 360° sweep, then exit
 *   npm run simulate -- --step 800 --pest-rate 0.4 --reservoir 35
 *
 * The HTTP calls here are the same ones the firmware will make (see docs, section 10.1).
 */
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
/** Deterrent used per second of spraying, in percent of a full 2.5 L reservoir (R385 pump ≈ 2 L/min). */
const PCT_PER_SPRAY_SECOND = 1.3;
const HOME: Pose = { pan: 0, lift: 300, swivel: 60 };

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

function randomPests(p: Pose): Detection[] {
  if (Math.random() >= PEST_RATE) return [];
  const underside = p.swivel > 90;
  const count = Math.random() < 0.2 ? 2 : 1;
  const out: Detection[] = [];
  for (let i = 0; i < count; i++) {
    // Aphids gather under leaves; larvae and loopers are more often on top.
    const pest: PestType = underside
      ? Math.random() < 0.6 ? "aphid_cluster" : PEST_TYPES[Math.floor(Math.random() * 2)]
      : PEST_TYPES[Math.floor(Math.random() * 3)];
    const size = { diamondback_larva: [0.09, 0.05], looper: [0.13, 0.07], aphid_cluster: [0.15, 0.12] }[pest];
    const base = { diamondback_larva: 0.84, looper: 0.7, aphid_cluster: 0.82 }[pest];
    out.push({
      pest,
      confidence: base - (underside ? 0.08 : 0),
      bbox: {
        x: round3(0.08 + Math.random() * (0.84 - size[0])),
        y: round3(0.1 + Math.random() * (0.8 - size[1])),
        w: size[0],
        h: size[1],
      },
    });
  }
  return out;
}

function drawPest(d: Detection): string {
  const W = 640, H = 480;
  const x = d.bbox.x * W, y = d.bbox.y * H, w = d.bbox.w * W, h = d.bbox.h * H;
  const cx = x + w / 2, cy = y + h / 2;
  if (d.pest === "diamondback_larva") {
    const segs = Array.from({ length: 5 }, (_, i) =>
      `<ellipse cx="${x + (i + 0.5) * (w / 5)}" cy="${cy}" rx="${w / 9}" ry="${h / 2.4}" fill="#b9d98a" stroke="#7fa35a" stroke-width="1"/>`,
    ).join("");
    return `<g>${segs}<circle cx="${x + w - 3}" cy="${cy}" r="${h / 4}" fill="#6b5a3a"/></g>`;
  }
  if (d.pest === "looper") {
    return `<path d="M ${x} ${y + h} Q ${cx} ${y - h * 0.6} ${x + w} ${y + h}" fill="none" stroke="#8fc56a" stroke-width="${h / 2.2}" stroke-linecap="round"/>
      <path d="M ${x} ${y + h} Q ${cx} ${y - h * 0.6} ${x + w} ${y + h}" fill="none" stroke="#dff0c4" stroke-width="1.5" stroke-dasharray="3 5"/>`;
  }
  const dots = Array.from({ length: 22 }, () => {
    const dx = cx + (Math.random() - 0.5) * w * 0.9, dy = cy + (Math.random() - 0.5) * h * 0.9;
    return `<ellipse cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" rx="3.2" ry="2.3" fill="#9bc34f" stroke="#55732a" stroke-width="0.8"/>`;
  }).join("");
  return `<g>${dots}</g>`;
}

function renderLeaf(p: Pose, pests: Detection[]): string {
  const underside = p.swivel > 90;
  const leaf = underside ? "#8fb86a" : "#6fae45";
  const vein = underside ? "#cfe3b4" : "#a9d27f";
  const veins = Array.from({ length: 7 }, (_, i) => {
    const y = 70 + i * 55;
    return `<path d="M 320 ${y + 30} Q ${220 - i * 6} ${y} 90 ${y - 25}" stroke="${vein}" stroke-width="3" fill="none"/>
      <path d="M 320 ${y + 30} Q ${420 + i * 6} ${y} 550 ${y - 25}" stroke="${vein}" stroke-width="3" fill="none"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <rect width="640" height="480" fill="#3b2f22"/>
  <path d="M 320 470 C 20 420 -10 120 120 30 C 220 -10 420 -10 520 30 C 650 120 620 420 320 470 Z" fill="${leaf}"/>
  <path d="M 320 470 L 320 20" stroke="${vein}" stroke-width="7"/>
  ${veins}
  ${pests.map(drawPest).join("\n  ")}
  <text x="12" y="468" font-family="monospace" font-size="13" fill="#f2f6e9" opacity="0.8">${underside ? "UNDER LEAF" : "LEAF TOP"} · ${fmtPose(p)}</text>
</svg>`;
}

// ---------- turret actions ----------

async function heartbeat(): Promise<void> {
  const res = await postJson<{ mode: string; settings: DeviceSettings; commands: Command[] }>(
    "/api/device/heartbeat",
    { pose, reservoirPct: round1(reservoir), firmware: "simulator-0.1" },
  );
  settings = res.settings;
  for (const cmd of res.commands) await runCommand(cmd);
}

async function spray(durationMs: number, source: "auto" | "manual", captureId: number | null) {
  if (reservoir <= 0) {
    log("  ✗ reservoir empty, cannot spray");
    return false;
  }
  log(`  💧 spraying ${durationMs} ms (${source}) at ${fmtPose(pose)}`);
  await sleep(durationMs);
  reservoir = Math.max(0, reservoir - (durationMs / 1000) * PCT_PER_SPRAY_SECOND);
  await postJson("/api/device/fires", { source, durationMs, pose, captureId });
  return true;
}

async function runCommand(cmd: Command) {
  log(`→ manual command #${cmd.id}: ${cmd.type} ${JSON.stringify(cmd.payload)}`);
  let ok = true;
  if (cmd.type === "fire") ok = await spray(Number(cmd.payload.durationMs ?? 400), "manual", null);
  else if (cmd.type === "move") pose = cmd.payload.pose as Pose;
  else if (cmd.type === "home") pose = { ...HOME };
  await postJson(`/api/device/commands/${cmd.id}`, { ok });
}

async function capture(): Promise<void> {
  const truth = randomPests(pose);
  const form = new FormData();
  form.set("image", new Blob([renderLeaf(pose, truth)], { type: "image/svg+xml" }), "snap.svg");
  form.set("pose", JSON.stringify(pose));
  form.set("simTruth", JSON.stringify(truth));
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
  log(`PestBlaster simulator → ${BASE}  (step ${STEP_MS} ms, pest rate ${PEST_RATE})`);
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
