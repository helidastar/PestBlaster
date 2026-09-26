import type { DatabaseSync } from "node:sqlite";
import { PESTS, type PestType } from "./pests";
import type {
  Alert,
  AlertKind,
  CaptureRecord,
  Command,
  CommandType,
  Decision,
  Detection,
  DeviceSettings,
  DeviceState,
  FireEvent,
  Mode,
  Pose,
} from "./types";

type Row = Record<string, unknown>;

const nowIso = () => new Date().toISOString();

/** A turret that has not checked in for this long is shown as offline. */
export const OFFLINE_AFTER_S = 30;

/** Minimum gap between two pest alerts for the same pest, so the grower is not spammed. */
export const PEST_ALERT_GAP_MIN = 5;

/** Hours added to UTC for calendar days in the pest trends (Philippines, UTC+8). */
export const LOCAL_UTC_OFFSET_H = 8;

// ---------- device ----------

function toDevice(r: Row): DeviceState {
  return {
    id: r.id as string,
    name: r.name as string,
    lastSeen: (r.last_seen as string) ?? null,
    pose: { pan: r.pan as number, lift: r.lift as number, swivel: r.swivel as number },
    reservoirPct: r.reservoir_pct as number,
    mode: r.mode as Mode,
    firmware: (r.firmware as string) ?? null,
    settings: {
      autoFire: r.auto_fire === 1,
      confidenceThreshold: r.confidence_threshold as number,
      burstMs: r.burst_ms as number,
      cooldownS: r.cooldown_s as number,
      reservoirLowPct: r.reservoir_low_pct as number,
    },
  };
}

export function getDevice(db: DatabaseSync, id: string): DeviceState | null {
  const r = db.prepare("SELECT * FROM device WHERE id = ?").get(id) as Row | undefined;
  return r ? toDevice(r) : null;
}

export function isOnline(device: DeviceState, now = new Date()): boolean {
  if (!device.lastSeen) return false;
  return now.getTime() - new Date(device.lastSeen).getTime() < OFFLINE_AFTER_S * 1000;
}

/** Records a check-in from the turret: where it is pointing and how much deterrent is left. */
export function recordHeartbeat(
  db: DatabaseSync,
  id: string,
  report: { pose: Pose; reservoirPct: number; firmware?: string },
): DeviceState {
  const before = getDevice(db, id);
  if (!before) throw new Error(`Unknown device ${id}`);
  db.prepare(
    `UPDATE device SET last_seen = ?, pan = ?, lift = ?, swivel = ?, reservoir_pct = ?,
     firmware = COALESCE(?, firmware) WHERE id = ?`,
  ).run(
    nowIso(),
    report.pose.pan,
    report.pose.lift,
    report.pose.swivel,
    report.reservoirPct,
    report.firmware ?? null,
    id,
  );
  const low = before.settings.reservoirLowPct;
  if (before.reservoirPct > low && report.reservoirPct <= low) {
    addAlert(
      db,
      "reservoir_low",
      `Deterrent reservoir is at ${Math.round(report.reservoirPct)}%. Refill it soon.`,
    );
  }
  return getDevice(db, id)!;
}

export function updateSettings(
  db: DatabaseSync,
  id: string,
  patch: Partial<DeviceSettings> & { mode?: Mode; name?: string },
): DeviceState {
  const cols: Record<string, unknown> = {
    auto_fire: patch.autoFire === undefined ? undefined : patch.autoFire ? 1 : 0,
    confidence_threshold: patch.confidenceThreshold,
    burst_ms: patch.burstMs,
    cooldown_s: patch.cooldownS,
    reservoir_low_pct: patch.reservoirLowPct,
    mode: patch.mode,
    name: patch.name,
  };
  const entries = Object.entries(cols).filter(([, v]) => v !== undefined);
  if (entries.length > 0) {
    db.prepare(`UPDATE device SET ${entries.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`).run(
      ...(entries.map(([, v]) => v) as (string | number)[]),
      id,
    );
  }
  return getDevice(db, id)!;
}

// ---------- captures & detections ----------

export function lastFireAt(db: DatabaseSync, deviceId: string): Date | null {
  const r = db
    .prepare("SELECT created_at FROM fire_events WHERE device_id = ? ORDER BY id DESC LIMIT 1")
    .get(deviceId) as Row | undefined;
  return r ? new Date(r.created_at as string) : null;
}

export function saveCapture(
  db: DatabaseSync,
  input: {
    deviceId: string;
    image: string | null;
    pose: Pose;
    detections: Detection[];
    decision: Decision;
  },
): number {
  const createdAt = nowIso();
  const res = db
    .prepare(
      `INSERT INTO captures (device_id, created_at, image, pan, lift, swivel, decision, hold_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.deviceId,
      createdAt,
      input.image,
      input.pose.pan,
      input.pose.lift,
      input.pose.swivel,
      input.decision.action,
      input.decision.action === "hold" ? input.decision.reason : null,
    );
  const captureId = Number(res.lastInsertRowid);
  const ins = db.prepare(
    "INSERT INTO detections (capture_id, pest, confidence, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const d of input.detections) {
    ins.run(captureId, d.pest, d.confidence, d.bbox.x, d.bbox.y, d.bbox.w, d.bbox.h);
  }

  const target = input.decision.target;
  if (target && input.decision.action === "fire") {
    maybePestAlert(db, target.pest, `${PESTS[target.pest].label} found. Spraying now.`);
  } else if (target && input.decision.action === "hold" && input.decision.reason !== "below_threshold") {
    maybePestAlert(db, target.pest, `${PESTS[target.pest].label} found. Not sprayed: auto-spray is not active.`);
  }
  return captureId;
}

function maybePestAlert(db: DatabaseSync, pest: PestType, message: string) {
  const since = new Date(Date.now() - PEST_ALERT_GAP_MIN * 60_000).toISOString();
  const recent = db
    .prepare("SELECT 1 FROM alerts WHERE kind = 'pest' AND created_at >= ? AND message LIKE ? LIMIT 1")
    .get(since, `${PESTS[pest].label}%`);
  if (!recent) addAlert(db, "pest", message);
}

function toCaptures(db: DatabaseSync, rows: Row[]): CaptureRecord[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as number);
  const dets = db
    .prepare(`SELECT * FROM detections WHERE capture_id IN (${ids.map(() => "?").join(",")}) ORDER BY confidence DESC`)
    .all(...ids) as Row[];
  return rows.map((r) => ({
    id: r.id as number,
    deviceId: r.device_id as string,
    createdAt: r.created_at as string,
    image: (r.image as string) ?? null,
    pose: { pan: r.pan as number, lift: r.lift as number, swivel: r.swivel as number },
    decision: r.decision as "fire" | "hold",
    holdReason: (r.hold_reason as CaptureRecord["holdReason"]) ?? null,
    detections: dets
      .filter((d) => d.capture_id === r.id)
      .map((d) => ({
        id: d.id as number,
        pest: d.pest as PestType,
        confidence: d.confidence as number,
        bbox: { x: d.x as number, y: d.y as number, w: d.w as number, h: d.h as number },
      })),
  }));
}

/** Captures that contain at least one detection, newest first. */
export function listPestCaptures(
  db: DatabaseSync,
  opts: { limit?: number; pest?: PestType } = {},
): CaptureRecord[] {
  const limit = Math.min(opts.limit ?? 30, 200);
  const rows = (
    opts.pest
      ? db
          .prepare(
            `SELECT * FROM captures WHERE id IN (SELECT capture_id FROM detections WHERE pest = ?)
             ORDER BY id DESC LIMIT ?`,
          )
          .all(opts.pest, limit)
      : db
          .prepare(
            `SELECT * FROM captures WHERE id IN (SELECT capture_id FROM detections)
             ORDER BY id DESC LIMIT ?`,
          )
          .all(limit)
  ) as Row[];
  return toCaptures(db, rows);
}

// ---------- fire events ----------

export function recordFire(
  db: DatabaseSync,
  input: {
    deviceId: string;
    source: "auto" | "manual";
    durationMs: number;
    pose: Pose;
    captureId?: number | null;
  },
): FireEvent {
  let pest: PestType | null = null;
  if (input.captureId) {
    const r = db
      .prepare("SELECT pest FROM detections WHERE capture_id = ? ORDER BY confidence DESC LIMIT 1")
      .get(input.captureId) as Row | undefined;
    pest = (r?.pest as PestType) ?? null;
  }
  const res = db
    .prepare(
      `INSERT INTO fire_events (device_id, created_at, source, duration_ms, pan, lift, swivel, capture_id, pest)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.deviceId,
      nowIso(),
      input.source,
      input.durationMs,
      input.pose.pan,
      input.pose.lift,
      input.pose.swivel,
      input.captureId ?? null,
      pest,
    );
  return listFires(db, { limit: 1, afterId: Number(res.lastInsertRowid) - 1 })[0];
}

export function listFires(db: DatabaseSync, opts: { limit?: number; afterId?: number } = {}): FireEvent[] {
  const rows = db
    .prepare("SELECT * FROM fire_events WHERE id > ? ORDER BY id DESC LIMIT ?")
    .all(opts.afterId ?? 0, Math.min(opts.limit ?? 50, 500)) as Row[];
  return rows.map((r) => ({
    id: r.id as number,
    deviceId: r.device_id as string,
    createdAt: r.created_at as string,
    source: r.source as "auto" | "manual",
    durationMs: r.duration_ms as number,
    pose: { pan: r.pan as number, lift: r.lift as number, swivel: r.swivel as number },
    captureId: (r.capture_id as number) ?? null,
    pest: (r.pest as PestType) ?? null,
  }));
}

// ---------- commands (manual override) ----------

function toCommand(r: Row): Command {
  return {
    id: r.id as number,
    deviceId: r.device_id as string,
    createdAt: r.created_at as string,
    type: r.type as CommandType,
    payload: JSON.parse(r.payload as string),
    status: r.status as Command["status"],
    doneAt: (r.done_at as string) ?? null,
  };
}

export function queueCommand(
  db: DatabaseSync,
  deviceId: string,
  type: CommandType,
  payload: Record<string, unknown> = {},
): Command {
  const res = db
    .prepare("INSERT INTO commands (device_id, created_at, type, payload) VALUES (?, ?, ?, ?)")
    .run(deviceId, nowIso(), type, JSON.stringify(payload));
  return toCommand(db.prepare("SELECT * FROM commands WHERE id = ?").get(Number(res.lastInsertRowid)) as Row);
}

/** Hands pending commands to the turret and marks them as sent. */
export function takePendingCommands(db: DatabaseSync, deviceId: string): Command[] {
  const rows = db
    .prepare("SELECT * FROM commands WHERE device_id = ? AND status = 'pending' ORDER BY id")
    .all(deviceId) as Row[];
  if (rows.length) {
    db.prepare(
      `UPDATE commands SET status = 'sent' WHERE id IN (${rows.map(() => "?").join(",")})`,
    ).run(...rows.map((r) => r.id as number));
  }
  return rows.map((r) => toCommand({ ...r, status: "sent" }));
}

export function completeCommand(
  db: DatabaseSync,
  deviceId: string,
  id: number,
  ok: boolean,
): Command | null {
  db.prepare("UPDATE commands SET status = ?, done_at = ? WHERE id = ? AND device_id = ?").run(
    ok ? "done" : "failed",
    nowIso(),
    id,
    deviceId,
  );
  const r = db.prepare("SELECT * FROM commands WHERE id = ?").get(id) as Row | undefined;
  return r ? toCommand(r) : null;
}

export function listCommands(db: DatabaseSync, limit = 20): Command[] {
  return (db.prepare("SELECT * FROM commands ORDER BY id DESC LIMIT ?").all(limit) as Row[]).map(toCommand);
}

// ---------- alerts ----------

export function addAlert(db: DatabaseSync, kind: AlertKind, message: string): void {
  db.prepare("INSERT INTO alerts (created_at, kind, message) VALUES (?, ?, ?)").run(nowIso(), kind, message);
}

export function listAlerts(db: DatabaseSync, limit = 50): Alert[] {
  return (db.prepare("SELECT * FROM alerts ORDER BY id DESC LIMIT ?").all(limit) as Row[]).map((r) => ({
    id: r.id as number,
    createdAt: r.created_at as string,
    kind: r.kind as AlertKind,
    message: r.message as string,
    read: r.read === 1,
  }));
}

export function markAlertsRead(db: DatabaseSync): void {
  db.prepare("UPDATE alerts SET read = 1 WHERE read = 0").run();
}

export function unreadAlertCount(db: DatabaseSync): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE read = 0").get() as Row).n as number;
}

// ---------- stats ----------

export interface DayStat {
  day: string;
  counts: Record<PestType, number>;
  sprays: number;
}

/** Pest detections and sprays per local calendar day for the last `days` days, oldest first. */
export function dailyStats(db: DatabaseSync, days = 7, now = new Date()): DayStat[] {
  const shift = `+${LOCAL_UTC_OFFSET_H} hours`;
  const out: DayStat[] = [];
  const local = new Date(now.getTime() + LOCAL_UTC_OFFSET_H * 3600_000);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(local.getTime() - i * 86400_000).toISOString().slice(0, 10);
    out.push({ day: d, counts: { diamondback_larva: 0, looper: 0, aphid_cluster: 0 }, sprays: 0 });
  }
  const byDay = new Map(out.map((s) => [s.day, s]));
  const pestRows = db
    .prepare(
      `SELECT date(c.created_at, ?) AS day, d.pest AS pest, COUNT(*) AS n
       FROM detections d JOIN captures c ON c.id = d.capture_id GROUP BY day, pest`,
    )
    .all(shift) as Row[];
  for (const r of pestRows) {
    const s = byDay.get(r.day as string);
    if (s && (r.pest as string) in s.counts) s.counts[r.pest as PestType] = r.n as number;
  }
  const fireRows = db
    .prepare("SELECT date(created_at, ?) AS day, COUNT(*) AS n FROM fire_events GROUP BY day")
    .all(shift) as Row[];
  for (const r of fireRows) {
    const s = byDay.get(r.day as string);
    if (s) s.sprays = r.n as number;
  }
  return out;
}

export function todaySummary(db: DatabaseSync, now = new Date()) {
  const today = dailyStats(db, 1, now)[0];
  const scans = db
    .prepare("SELECT COUNT(*) AS n FROM captures WHERE date(created_at, ?) = ?")
    .get(`+${LOCAL_UTC_OFFSET_H} hours`, today.day) as Row;
  return {
    day: today.day,
    scans: scans.n as number,
    pests: Object.values(today.counts).reduce((a, b) => a + b, 0),
    sprays: today.sprays,
    byPest: today.counts,
  };
}
