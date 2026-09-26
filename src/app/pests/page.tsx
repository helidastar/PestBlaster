"use client";

import { useState } from "react";
import { HOLD_REASON_TEXT } from "@/lib/decision";
import { PEST_TYPES, PESTS, type PestType } from "@/lib/pests";
import { clock, pct, timeAgo, usePoll } from "@/lib/client";
import type { CaptureRecord } from "@/lib/types";
import { PestLabel, PestSwatch } from "@/components/PestMark";
import { Snapshot } from "@/components/Snapshot";

export default function PestsPage() {
  const [filter, setFilter] = useState<PestType | null>(null);
  const url = `/api/captures?limit=40${filter ? `&pest=${filter}` : ""}`;
  const { data, error } = usePoll<CaptureRecord[]>(url, 4000);

  return (
    <>
      <h1 className="page-title">Pests seen</h1>
      <p className="page-lede">Every photo where the turret found a pest, newest first, and what it did about it.</p>

      <div className="chips" role="group" aria-label="Filter by pest">
        <button className="chip" aria-pressed={filter === null} onClick={() => setFilter(null)}>All</button>
        {PEST_TYPES.map((p) => (
          <button key={p} className="chip" aria-pressed={filter === p} onClick={() => setFilter(p)}>
            <PestSwatch pest={p} /> {PESTS[p].label}
          </button>
        ))}
      </div>

      {error && <div className="banner">{error}</div>}
      {data && data.length === 0 && (
        <div className="card empty">
          <strong>{filter ? `No ${PESTS[filter].label.toLowerCase()} seen` : "No pests seen yet"}</strong>
          Photos appear here as soon as the turret finds something on the lettuce.
        </div>
      )}

      <div className="capture-list">
        {data?.map((c) => (
          <article key={c.id} className="card capture" style={{ marginBottom: 0 }}>
            <Snapshot capture={c} />
            <div className="meta">
              {c.detections.map((d) => (
                <div className="row" key={d.id}>
                  <PestLabel pest={d.pest} />
                  <span className="mono">{pct(d.confidence)} sure</span>
                </div>
              ))}
              <div className="row">
                <span className="muted">
                  {clock(c.createdAt)} · {timeAgo(c.createdAt)}
                </span>
                {c.decision === "fire" ? (
                  <span className="pill spray">Sprayed</span>
                ) : (
                  <span className="pill">{HOLD_REASON_TEXT[c.holdReason ?? ""] ?? "Not sprayed"}</span>
                )}
              </div>
              <div className="row muted mono" style={{ fontSize: 12 }}>
                <span>pan {Math.round(c.pose.pan)}° · lift {Math.round(c.pose.lift)} mm · swivel {Math.round(c.pose.swivel)}°</span>
                <span>{c.pose.swivel > 90 ? "under leaf" : "leaf top"}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
