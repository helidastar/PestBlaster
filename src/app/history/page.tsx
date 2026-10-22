"use client";

import { useEffect, useState } from "react";
import { clock, send, timeAgo, usePoll } from "@/lib/client";
import type { Alert, FireEvent } from "@/lib/types";
import type { DayStat } from "@/lib/view-types";
import { PestLabel } from "@/components/PestMark";
import { TrendChart } from "@/components/TrendChart";

type Tab = "trends" | "sprays" | "alerts";

export default function HistoryPage() {
  const [tab, setTab] = useState<Tab>("trends");
  const stats = usePoll<DayStat[]>("/api/stats?days=7", 10000);
  const fires = usePoll<FireEvent[]>("/api/fires?limit=100", 5000);
  const alerts = usePoll<Alert[]>("/api/alerts", 5000);
  const unread = alerts.data?.filter((a) => !a.read).length ?? 0;

  // Opening the alerts tab counts as reading them.
  useEffect(() => {
    if (tab === "alerts" && unread > 0) send("/api/alerts", "POST").catch(() => {});
  }, [tab, unread]);

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">History</h1>
        <p className="page-lede">How often pests show up, every spray the turret made, and the alerts it sent you.</p>
      </header>

      <div className="tabs" role="tablist">
        {(["trends", "sprays", "alerts"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === "trends" ? "Trends" : t === "sprays" ? "Sprays" : `Alerts${unread ? ` (${unread})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "trends" && (
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Pests seen per day</h2>
            <span className="card-note">Last 7 days</span>
          </div>
          {stats.data ? <TrendChart days={stats.data} /> : <p className="muted">Loading…</p>}
        </section>
      )}

      {tab === "sprays" && (
        <section className="card">
          {fires.data?.length ? (
            <ul className="rows">
              {fires.data.map((f) => (
                <li key={f.id}>
                  <div>
                    {f.pest ? <PestLabel pest={f.pest} /> : <strong>Manual spray</strong>}
                    <div className="sub mono">
                      pan {Math.round(f.pose.pan)}° · lift {Math.round(f.pose.lift)} mm · swivel {Math.round(f.pose.swivel)}°
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className={`pill ${f.source === "auto" ? "spray" : ""}`}>
                      {f.source === "auto" ? "Auto" : "Manual"} · {f.durationMs} ms
                    </span>
                    <div className="sub">{clock(f.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <strong>No sprays yet</strong>
              Sprays appear here when the turret fires at a pest or you press Spray now.
            </div>
          )}
        </section>
      )}

      {tab === "alerts" && (
        <section className="card">
          {alerts.data?.length ? (
            <ul className="rows">
              {alerts.data.map((a) => (
                <li key={a.id} className={a.read ? "" : "unread"}>
                  <div>
                    <strong>{a.kind === "pest" ? "Pest found" : a.kind === "reservoir_low" ? "Refill needed" : "Turret"}</strong>
                    <div>{a.message}</div>
                  </div>
                  <span className="sub" style={{ whiteSpace: "nowrap" }}>{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <strong>No alerts</strong>
              You will be told here when a pest is found or the deterrent bottle runs low.
            </div>
          )}
        </section>
      )}
    </>
  );
}
