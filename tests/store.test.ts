import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_DEVICE_ID, openDb } from "@/lib/db";
import { decide } from "@/lib/decision";
import {
  completeCommand,
  dailyStats,
  getDevice,
  lastFireAt,
  listAlerts,
  listFires,
  listPestCaptures,
  queueCommand,
  recordFire,
  recordHeartbeat,
  saveCapture,
  takePendingCommands,
  updateSettings,
} from "@/lib/store";
import type { Detection } from "@/lib/types";

let db: DatabaseSync;
const pose = { pan: 30, lift: 150, swivel: 60 };
const larva: Detection = { pest: "diamondback_larva", confidence: 0.9, bbox: { x: 0.5, y: 0.5, w: 0.1, h: 0.05 } };

beforeEach(() => {
  db = openDb(":memory:");
});

describe("store", () => {
  it("creates the default turret with safe settings", () => {
    const d = getDevice(db, DEFAULT_DEVICE_ID)!;
    expect(d.mode).toBe("auto");
    expect(d.settings.autoFire).toBe(true);
    expect(d.settings.confidenceThreshold).toBe(0.6);
  });

  it("raises one low-reservoir alert when the level crosses the threshold", () => {
    recordHeartbeat(db, DEFAULT_DEVICE_ID, { pose, reservoirPct: 50 });
    recordHeartbeat(db, DEFAULT_DEVICE_ID, { pose, reservoirPct: 18 });
    recordHeartbeat(db, DEFAULT_DEVICE_ID, { pose, reservoirPct: 15 });
    const alerts = listAlerts(db).filter((a) => a.kind === "reservoir_low");
    expect(alerts).toHaveLength(1);
    expect(getDevice(db, DEFAULT_DEVICE_ID)!.lastSeen).not.toBeNull();
  });

  it("stores a capture with its detections and links a spray to it", () => {
    const device = getDevice(db, DEFAULT_DEVICE_ID)!;
    const decision = decide({
      detections: [larva], settings: device.settings, mode: device.mode, pose,
      reservoirPct: 80, lastFireAt: null, now: new Date(),
    });
    const id = saveCapture(db, { deviceId: DEFAULT_DEVICE_ID, image: "a.svg", pose, detections: [larva], decision });
    const fire = recordFire(db, { deviceId: DEFAULT_DEVICE_ID, source: "auto", durationMs: 400, pose, captureId: id });
    expect(fire.pest).toBe("diamondback_larva");
    expect(lastFireAt(db, DEFAULT_DEVICE_ID)).not.toBeNull();
    const [cap] = listPestCaptures(db);
    expect(cap.decision).toBe("fire");
    expect(cap.detections).toHaveLength(1);
    expect(listPestCaptures(db, { pest: "looper" })).toHaveLength(0);
    expect(listAlerts(db).filter((a) => a.kind === "pest")).toHaveLength(1);
  });

  it("does not repeat a pest alert for the same pest within a few minutes", () => {
    const decision = { action: "fire" as const, target: larva, aim: pose, burstMs: 400 };
    saveCapture(db, { deviceId: DEFAULT_DEVICE_ID, image: null, pose, detections: [larva], decision });
    saveCapture(db, { deviceId: DEFAULT_DEVICE_ID, image: null, pose, detections: [larva], decision });
    expect(listAlerts(db).filter((a) => a.kind === "pest")).toHaveLength(1);
  });

  it("hands each manual command to the turret once and records the result", () => {
    const cmd = queueCommand(db, DEFAULT_DEVICE_ID, "fire", { durationMs: 500 });
    expect(takePendingCommands(db, DEFAULT_DEVICE_ID).map((c) => c.id)).toEqual([cmd.id]);
    expect(takePendingCommands(db, DEFAULT_DEVICE_ID)).toEqual([]);
    expect(completeCommand(db, DEFAULT_DEVICE_ID, cmd.id, true)?.status).toBe("done");
  });

  it("updates only the settings that were sent", () => {
    const d = updateSettings(db, DEFAULT_DEVICE_ID, { autoFire: false, mode: "paused" });
    expect(d.settings.autoFire).toBe(false);
    expect(d.mode).toBe("paused");
    expect(d.settings.burstMs).toBe(400);
  });

  it("counts pests and sprays per day", () => {
    const decision = { action: "hold" as const, reason: "auto_fire_off" as const, target: larva };
    saveCapture(db, { deviceId: DEFAULT_DEVICE_ID, image: null, pose, detections: [larva, larva], decision });
    recordFire(db, { deviceId: DEFAULT_DEVICE_ID, source: "manual", durationMs: 300, pose });
    const days = dailyStats(db, 7);
    expect(days).toHaveLength(7);
    const today = days[6];
    expect(today.counts.diamondback_larva).toBe(2);
    expect(today.sprays).toBe(1);
    expect(listFires(db)).toHaveLength(1);
  });
});
