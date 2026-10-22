"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { send, usePoll } from "@/lib/client";
import type { StatusResponse } from "@/lib/view-types";
import { ClockIcon, DropIcon, LeafIcon, SlidersIcon, TurretIcon } from "./Icons";

const TABS = [
  { href: "/", label: "Turret", Icon: TurretIcon },
  { href: "/pests", label: "Pests", Icon: LeafIcon },
  { href: "/control", label: "Control", Icon: SlidersIcon },
  { href: "/history", label: "History", Icon: ClockIcon },
];

export function Nav() {
  const path = usePathname();
  const { data } = usePoll<StatusResponse>("/api/status", 3000);
  const link = ({ href, label, Icon }: (typeof TABS)[number]) => (
    <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
      <Icon />
      {label}
      {href === "/history" && data && data.unreadAlerts > 0 && (
        <span className="badge" aria-label={`${data.unreadAlerts} unread alerts`}>
          {data.unreadAlerts > 99 ? "99+" : data.unreadAlerts}
        </span>
      )}
    </Link>
  );
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-inner">
        {TABS.slice(0, 2).map(link)}
        <HoldToSpray />
        {TABS.slice(2).map(link)}
      </div>
    </nav>
  );
}

const HOLD_MS = 700;
/** Longest manual spray, the pump cap from the blueprint. Letting go stops it sooner. */
export const MAX_SPRAY_MS = 3000;

type SprayState = "idle" | "arming" | "spraying";

/**
 * Press and hold to spray, let go to stop. The first 0.7 s only arms the button,
 * so a stray tap in the pocket never fires the turret.
 */
function HoldToSpray() {
  const [state, setState] = useState<SprayState>("idle");
  const [fired, setFired] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const stateRef = useRef<SprayState>("idle");
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);

  const go = (next: SprayState) => {
    stateRef.current = next;
    setState(next);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current);
      if (capTimer.current) clearTimeout(capTimer.current);
    },
    [],
  );

  function start() {
    if (stateRef.current !== "idle") return;
    go("arming");
    armTimer.current = setTimeout(async () => {
      armTimer.current = null;
      go("spraying");
      startedAt.current = Date.now();
      setFired(true);
      setTimeout(() => setFired(false), 500);
      navigator.vibrate?.(40);
      capTimer.current = setTimeout(() => stop(true), MAX_SPRAY_MS);
      try {
        await send("/api/commands", "POST", { type: "fire", durationMs: MAX_SPRAY_MS });
        if (stateRef.current === "spraying") setToast("Spraying · let go to stop");
      } catch (e) {
        if (capTimer.current) clearTimeout(capTimer.current);
        capTimer.current = null;
        go("idle");
        setToast(e instanceof Error ? e.message : "Spray was not sent. Try again.");
      }
    }, HOLD_MS);
  }

  async function stop(atLimit = false) {
    if (capTimer.current) clearTimeout(capTimer.current);
    capTimer.current = null;
    go("idle");
    const seconds = ((Date.now() - startedAt.current) / 1000).toFixed(1);
    if (atLimit) {
      setToast(`Spray stopped at the ${MAX_SPRAY_MS / 1000} s limit`);
      return;
    }
    try {
      await send("/api/commands", "POST", { type: "stop" });
      setToast(`Spray stopped · ${seconds} s`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Stop was not sent. Try again.");
    }
  }

  function release() {
    if (stateRef.current === "arming") {
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = null;
      go("idle");
      setToast("Hold the button to spray");
    } else if (stateRef.current === "spraying") {
      stop();
    }
  }

  const text = state === "spraying" ? "Spraying… let go" : "Hold to spray";

  return (
    <div className="fab-slot">
      <button
        type="button"
        className={`fab${state === "arming" ? " holding" : ""}${state === "spraying" ? " spraying" : ""}${fired ? " fired" : ""}`}
        style={{ ["--hold" as string]: `${HOLD_MS}ms` }}
        aria-label="Spray. Press and hold to spray, let go to stop."
        aria-pressed={state === "spraying"}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          start();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") release();
        }}
        onBlur={release}
      >
        <svg className="ring" viewBox="0 0 78 78" aria-hidden="true">
          <circle cx="39" cy="39" r="34" />
        </svg>
        <DropIcon className="drop" />
        <span className="fab-text">{text}</span>
      </button>
      <span className="fab-label" aria-hidden="true">{state === "spraying" ? "Let go" : "Hold"}</span>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
