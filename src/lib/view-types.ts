import type { LiveFrame } from "./camera";
import type { DayStat } from "./store";
import type { CaptureRecord, Command, DeviceState } from "./types";

export type { DayStat };

/** Shape of GET /api/status. */
export interface StatusResponse {
  device: DeviceState;
  online: boolean;
  detector: string;
  today: { day: string; scans: number; pests: number; sprays: number; byPest: Record<string, number> };
  unreadAlerts: number;
  latestCapture: CaptureRecord | null;
  camera: LiveFrame | null;
  commands: Command[];
}
