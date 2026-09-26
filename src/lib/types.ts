import type { PestType } from "./pests";

/** Turret pose. pan: 0–360° base rotation, lift: mm of telescoping travel, swivel: ±170° camera/nozzle angle (0 = level, +90 = straight down, >90 = back under the leaf). */
export interface Pose {
  pan: number;
  lift: number;
  swivel: number;
}

/** Bounding box in normalized image coordinates (0–1, origin top-left). */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Detection {
  pest: PestType;
  confidence: number;
  bbox: BBox;
}

export type Mode = "auto" | "paused";

export interface DeviceSettings {
  autoFire: boolean;
  confidenceThreshold: number;
  burstMs: number;
  cooldownS: number;
  reservoirLowPct: number;
}

export interface DeviceState {
  id: string;
  name: string;
  lastSeen: string | null;
  pose: Pose;
  reservoirPct: number;
  mode: Mode;
  firmware: string | null;
  settings: DeviceSettings;
}

export type HoldReason =
  | "no_pest"
  | "below_threshold"
  | "paused"
  | "auto_fire_off"
  | "reservoir_empty"
  | "cooldown";

export type Decision =
  | { action: "fire"; target: Detection; aim: Pose; burstMs: number }
  | { action: "hold"; reason: HoldReason; target: Detection | null };

export type CommandType = "fire" | "move" | "home" | "set_mode";
export type CommandStatus = "pending" | "sent" | "done" | "failed";

export interface Command {
  id: number;
  deviceId: string;
  createdAt: string;
  type: CommandType;
  payload: Record<string, unknown>;
  status: CommandStatus;
  doneAt: string | null;
}

export interface CaptureRecord {
  id: number;
  deviceId: string;
  createdAt: string;
  image: string | null;
  pose: Pose;
  decision: "fire" | "hold";
  holdReason: HoldReason | null;
  detections: (Detection & { id: number })[];
}

export interface FireEvent {
  id: number;
  deviceId: string;
  createdAt: string;
  source: "auto" | "manual";
  durationMs: number;
  pose: Pose;
  captureId: number | null;
  pest: PestType | null;
}

export type AlertKind = "pest" | "reservoir_low" | "device";

export interface Alert {
  id: number;
  createdAt: string;
  kind: AlertKind;
  message: string;
  read: boolean;
}
