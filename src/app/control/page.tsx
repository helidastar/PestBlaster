"use client";

import { useEffect, useState } from "react";
import { send, timeAgo, usePoll } from "@/lib/client";
import { LIMITS } from "@/lib/targeting";
import type { DeviceSettings, Pose } from "@/lib/types";
import type { StatusResponse } from "@/lib/view-types";
import { DropIcon } from "@/components/Icons";

const COMMAND_TEXT: Record<string, string> = {
  fire: "Spray now",
  move: "Move turret",
  home: "Return home",
  set_mode: "Change mode",
};
const STATUS_TEXT: Record<string, string> = {
  pending: "Waiting for turret",
  sent: "Turret is doing it",
  done: "Done",
  failed: "Turret could not do it",
};

export default function ControlPage() {
  const { data, error, reload } = usePoll<StatusResponse>("/api/status", 2000);
  const [aim, setAim] = useState<Pose | null>(null);
  const [draft, setDraft] = useState<DeviceSettings | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (data && !aim) setAim(data.device.pose);
    if (data && !draft) setDraft(data.device.settings);
  }, [data, aim, draft]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!data || !aim || !draft) {
    return error ? <div className="banner">{error}</div> : <p className="muted">Connecting to the turret…</p>;
  }

  const { device, online } = data;
  const paused = device.mode === "paused";

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      setToast(label);
      await reload();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "That did not work. Try again.");
    }
  }

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Control</h1>
        <p className="page-lede">Take over the turret by hand, or pause it while you harvest or refill.</p>
      </header>
      {!online && (
        <div className="banner">
          The turret is offline (last seen {timeAgo(device.lastSeen)}). Commands will wait until it reconnects.
        </div>
      )}

      <section className="card leaf spray-card">
        <div className="switch-row">
          <div>
            <strong>{paused ? "Turret paused" : "Turret running"}</strong>
            <span className="muted" style={{ fontSize: 14 }}>
              {paused ? "No automatic spraying. Manual spraying still works." : "Scanning and spraying on its own."}
            </span>
          </div>
          <button
            className="switch"
            role="switch"
            aria-checked={!paused}
            aria-label="Turret running"
            onClick={() =>
              run(paused ? "Turret resumed" : "Turret paused", () =>
                send("/api/settings", "PATCH", { mode: paused ? "auto" : "paused" }),
              )
            }
          />
        </div>
        <button
          className="btn btn-spray"
          style={{ width: "100%" }}
          onClick={() => run("Spray sent", () => send("/api/commands", "POST", { type: "fire", durationMs: draft.burstMs }))}
        >
          <DropIcon /> Spray now ({draft.burstMs} ms)
        </button>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Aim by hand</h2>
          <span className="card-note mono">
            now {Math.round(device.pose.pan)}° · {Math.round(device.pose.lift)} mm · {Math.round(device.pose.swivel)}°
          </span>
        </div>
        <Slider label="Pan (turn)" unit="°" min={0} max={359} value={aim.pan} onChange={(pan) => setAim({ ...aim, pan })} />
        <Slider
          label="Lift (height)"
          unit=" mm"
          min={LIMITS.liftMinMm}
          max={LIMITS.liftMaxMm}
          value={aim.lift}
          onChange={(lift) => setAim({ ...aim, lift })}
          hint="0 is soil level, 300 is the top of the post"
        />
        <Slider
          label="Swivel (camera angle)"
          unit="°"
          min={LIMITS.swivelMin}
          max={LIMITS.swivelMax}
          value={aim.swivel}
          onChange={(swivel) => setAim({ ...aim, swivel })}
          hint="90° looks straight down, above 90° looks back under the leaf"
        />
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => run("Move sent", () => send("/api/commands", "POST", { type: "move", pose: aim }))}>
            Move turret
          </button>
          <button className="btn" onClick={() => run("Return home sent", () => send("/api/commands", "POST", { type: "home" }))}>
            Return home
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title" style={{ marginBottom: 14 }}>Spray settings</h2>
        <Slider
          label="Only spray when at least"
          unit="% sure"
          min={30}
          max={95}
          value={Math.round(draft.confidenceThreshold * 100)}
          onChange={(v) => setDraft({ ...draft, confidenceThreshold: v / 100 })}
          hint="Higher means fewer wrong sprays but more missed pests"
        />
        <Slider label="Spray length" unit=" ms" min={100} max={2000} step={50} value={draft.burstMs} onChange={(burstMs) => setDraft({ ...draft, burstMs })} />
        <Slider
          label="Wait between sprays"
          unit=" s"
          min={0}
          max={120}
          value={draft.cooldownS}
          onChange={(cooldownS) => setDraft({ ...draft, cooldownS })}
          hint="Gives the deterrent time to work before spraying again"
        />
        <Slider
          label="Warn me when the bottle is below"
          unit="%"
          min={5}
          max={60}
          value={draft.reservoirLowPct}
          onChange={(reservoirLowPct) => setDraft({ ...draft, reservoirLowPct })}
        />
        <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => run("Settings saved", () => send("/api/settings", "PATCH", draft))}>
          Save settings
        </button>
      </section>

      <section className="card">
        <h2 className="card-title" style={{ marginBottom: 6 }}>Recent commands</h2>
        {data.commands.length === 0 ? (
          <p className="muted">Commands you send appear here with their progress.</p>
        ) : (
          <ul className="rows">
            {data.commands.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>{COMMAND_TEXT[c.type]}</strong>
                  <div className="sub">{timeAgo(c.createdAt)}</div>
                </div>
                <span className={`pill ${c.status === "done" ? "on" : c.status === "failed" ? "off" : ""}`}>
                  {STATUS_TEXT[c.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function Slider(props: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const id = props.label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div className="field">
      <label htmlFor={id}>
        {props.label}
        <span className="mono">
          {Math.round(props.value)}
          {props.unit}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        style={{ ["--p" as string]: `${((props.value - props.min) / (props.max - props.min)) * 100}%` }}
      />
      {props.hint && <span className="hint">{props.hint}</span>}
    </div>
  );
}
