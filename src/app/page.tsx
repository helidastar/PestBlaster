"use client";

import Link from "next/link";
import { useState } from "react";
import { HOLD_REASON_TEXT } from "@/lib/decision";
import { PESTS } from "@/lib/pests";
import { send, timeAgo, usePoll } from "@/lib/client";
import type { StatusResponse } from "@/lib/view-types";
import { ArrowIcon } from "@/components/Icons";
import { PestLabel } from "@/components/PestMark";
import { Radar } from "@/components/Radar";
import { Reservoir } from "@/components/Reservoir";
import { Snapshot } from "@/components/Snapshot";

export default function Home() {
  const { data, error, reload } = usePoll<StatusResponse>("/api/status", 2000);
  const [saving, setSaving] = useState(false);

  if (!data) {
    return error ? (
      <div className="banner">{error}</div>
    ) : (
      <div className="dash" aria-busy="true" aria-label="Connecting to the turret">
        <div className="skeleton" style={{ height: 64 }} />
        <div className="skeleton" style={{ aspectRatio: "1 / 1.15" }} />
      </div>
    );
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
  const status = !online
    ? `Not heard from since ${timeAgo(device.lastSeen)}. It will pick up commands when it reconnects.`
    : device.mode === "paused"
      ? "Paused. Watching the bed but not moving on its own."
      : latestCapture
        ? `Sweeping the bed. Last pest photo ${timeAgo(latestCapture.createdAt)}.`
        : "Sweeping the bed. Nothing found yet.";
  const flowMax = Math.max(1, today.scans);

  return (
    <div className="dash">
      {error && <div className="banner" style={{ gridColumn: "1 / -1" }}>Lost connection to the server: {error}</div>}

      <div className="dash-greet">
        <div>
          <h1 className="page-title">{device.name}</h1>
          <p>{status}</p>
        </div>
        {data.detector === "simulated" && <span className="pill">Simulated detector</span>}
      </div>

      <section className="scope" aria-labelledby="radar-title">
        <div className="card-head">
          <h2 className="card-title" id="radar-title">Where it&apos;s looking</h2>
          <span className={`scope-live${online ? "" : " idle"}`}>
            <i /> {online ? "LIVE" : "LAST KNOWN"}
          </span>
        </div>
        <Radar pose={device.pose} pests={data.recentPests} lastFire={data.lastFire} />
      </section>

      <div className="dash-side">
        <div className="dash-pair">
          <Reservoir pct={device.reservoirPct} lowPct={device.settings.reservoirLowPct} />
          <section className={`card leaf mini${autoOn ? " is-on" : ""}`}>
            <h2 id="auto-title">Auto-spray</h2>
            <p>
              {autoOn
                ? `On when ≥ ${Math.round(device.settings.confidenceThreshold * 100)}% sure`
                : "Off. Watching and logging only."}
            </p>
            <button
              className="switch"
              role="switch"
              aria-checked={autoOn}
              aria-labelledby="auto-title"
              disabled={saving}
              onClick={toggleAuto}
            />
          </section>
        </div>

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Today</h2>
            <Link href="/history" className="card-note">Trends</Link>
          </div>
          <div className="flow">
            <div className="step">
              <span className="num">{today.scans}</span>
              <span className="lbl">spots checked</span>
            </div>
            <span className="arrow"><ArrowIcon /></span>
            <div className="step found">
              <span className="num">{today.pests}</span>
              <span className="lbl">pests found</span>
            </div>
            <span className="arrow"><ArrowIcon /></span>
            <div className="step sprayed">
              <span className="num">{today.sprays}</span>
              <span className="lbl">sprayed</span>
            </div>
          </div>
          <div className="flow-bar" aria-hidden="true">
            <span style={{ width: `${(today.sprays / flowMax) * 100}%`, background: "var(--spray)" }} />
            <span style={{ width: `${(Math.max(0, today.pests - today.sprays) / flowMax) * 100}%`, background: "var(--pest-aphid)" }} />
            <span style={{ flex: 1 }} />
          </div>
        </section>

        <section className="card leaf">
          <div className="card-head">
            <h2 className="card-title">Latest pest</h2>
            <Link href="/pests" className="card-note">All pests</Link>
          </div>
          {latestCapture && top ? (
            <div className="latest">
              <Snapshot capture={latestCapture} />
              <div>
                <h3><PestLabel pest={top.pest} /></h3>
                <p className="sci">{PESTS[top.pest].scientific}</p>
                <p className="note">{PESTS[top.pest].note}</p>
                <div className="row">
                  {latestCapture.decision === "fire" ? (
                    <span className="pill spray">Sprayed</span>
                  ) : (
                    <span className="pill">{HOLD_REASON_TEXT[latestCapture.holdReason ?? ""] ?? "Not sprayed"}</span>
                  )}
                  <span className="muted" style={{ fontSize: 14 }}>{timeAgo(latestCapture.createdAt)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty">
              <strong>No pests seen yet</strong>
              When the turret spots a larva, looper or aphids, the photo shows up here.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
