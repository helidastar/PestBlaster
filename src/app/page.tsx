"use client";

import Link from "next/link";
import { useState } from "react";
import { HOLD_REASON_TEXT } from "@/lib/decision";
import { PESTS } from "@/lib/pests";
import { send, timeAgo, usePoll } from "@/lib/client";
import type { StatusResponse } from "@/lib/view-types";
import { PestLabel } from "@/components/PestMark";
import { Radar } from "@/components/Radar";
import { Reservoir } from "@/components/Reservoir";
import { Snapshot } from "@/components/Snapshot";

export default function Home() {
  const { data, error, reload } = usePoll<StatusResponse>("/api/status", 2000);
  const [saving, setSaving] = useState(false);

  if (!data) {
    return error ? <div className="banner">{error}</div> : <p className="muted">Connecting to the turret…</p>;
  }

  const { device, online, today, latestCapture } = data;
  const autoOn = device.settings.autoFire && device.mode === "auto";

  async function toggleAuto() {
    setSaving(true);
    try {
      await send("/api/settings", "PATCH", autoOn ? { autoFire: false } : { autoFire: true, mode: "auto" });
      await reload();
    } finally {
      setSaving(false);
    }
  }

  const top = latestCapture?.detections[0];

  return (
    <>
      {error && <div className="banner">Lost connection to the server: {error}</div>}

      <div className="card-head" style={{ marginBottom: 6 }}>
        <h1 className="page-title">{device.name}</h1>
      </div>
      <div className="btn-row" style={{ marginBottom: 16, gap: 8 }}>
        <span className={`pill ${online ? "on" : "off"}`}>
          <span className="dot" /> {online ? "Online" : `Offline · last seen ${timeAgo(device.lastSeen)}`}
        </span>
        <span className={`pill ${autoOn ? "spray" : ""}`}>{autoOn ? "Auto-spray on" : "Auto-spray off"}</span>
        {data.detector === "simulated" && <span className="pill">Simulated detector</span>}
      </div>

      <section className="card radar-card" aria-labelledby="radar-title">
        <div className="card-head">
          <h2 className="card-title" id="radar-title">Where it&apos;s looking</h2>
          <span className="card-note">Last 12 sightings</span>
        </div>
        <Radar pose={device.pose} pests={data.recentPests} lastFire={data.lastFire} />
      </section>

      <section className="card">
        <div className="switch-row">
          <div>
            <strong>Auto-spray</strong>
            <span className="muted" style={{ fontSize: 14 }}>
              {autoOn
                ? `Sprays when it is at least ${Math.round(device.settings.confidenceThreshold * 100)}% sure it sees a pest.`
                : "The turret keeps watching and logging, but will not spray on its own."}
            </span>
          </div>
          <button
            className="switch"
            role="switch"
            aria-checked={autoOn}
            aria-label="Auto-spray"
            disabled={saving}
            onClick={toggleAuto}
          />
        </div>
      </section>

      <section className="card">
        <Reservoir pct={device.reservoirPct} lowPct={device.settings.reservoirLowPct} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Today</h2>
          <Link href="/history" className="card-note">Trends</Link>
        </div>
        <div className="today">
          <span><b>{today.scans}</b> spots checked</span>
          <span><b>{today.pests}</b> pests seen</span>
          <span><b>{today.sprays}</b> sprays</span>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Latest pest</h2>
          <Link href="/pests" className="card-note">All pests</Link>
        </div>
        {latestCapture && top ? (
          <>
            <Snapshot capture={latestCapture} />
            <div className="capture">
              <div className="meta">
                <div className="row">
                  <PestLabel pest={top.pest} />
                  <span className="muted">{timeAgo(latestCapture.createdAt)}</span>
                </div>
                <div className="row">
                  <span className="muted">{PESTS[top.pest].scientific}</span>
                  <span>
                    {latestCapture.decision === "fire" ? (
                      <span className="pill spray">Sprayed</span>
                    ) : (
                      <span className="pill">{HOLD_REASON_TEXT[latestCapture.holdReason ?? ""] ?? "Not sprayed"}</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="empty">
            <strong>No pests seen yet</strong>
            When the turret spots a larva, looper or aphids, the photo shows up here.
          </div>
        )}
      </section>
    </>
  );
}
