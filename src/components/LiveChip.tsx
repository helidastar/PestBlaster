"use client";

import { timeAgo, usePoll } from "@/lib/client";
import type { StatusResponse } from "@/lib/view-types";

/** Always-visible turret connection state in the top bar. */
export function LiveChip() {
  const { data } = usePoll<StatusResponse>("/api/status", 5000);
  if (!data) return null;
  return (
    <span className={`live ${data.online ? "on" : "off"}`} role="status">
      <span className="dot" />
      {data.online ? "Turret online" : `Offline · ${timeAgo(data.device.lastSeen)}`}
    </span>
  );
}
