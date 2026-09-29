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
  const { data } = usePoll<StatusResponse>("/api/status", 10000);
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
        <HoldToSpray burstMs={data?.device.settings.burstMs ?? 400} />
        {TABS.slice(2).map(link)}
      </div>
    </nav>
  );
}

const HOLD_MS = 700;

/** Press and hold to spray, so a stray tap in the pocket never fires the turret. */
function HoldToSpray({ burstMs }: { burstMs: number }) {
  const [holding, setHolding] = useState(false);
  const [fired, setFired] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  function start() {
    if (timer.current) return;
    setHolding(true);
    timer.current = setTimeout(async () => {
      timer.current = null;
      setHolding(false);
      setFired(true);
      setTimeout(() => setFired(false), 500);
      navigator.vibrate?.(40);
      try {
        await send("/api/commands", "POST", { type: "fire", durationMs: burstMs });
        setToast(`Spray sent · ${burstMs} ms`);
      } catch (e) {
        setToast(e instanceof Error ? e.message : "Spray was not sent. Try again.");
      }
    }, HOLD_MS);
  }

  function cancel() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      setToast("Hold the button to spray");
    }
    setHolding(false);
  }

  return (
    <div className="fab-slot">
      <button
        type="button"
        className={`fab${holding ? " holding" : ""}${fired ? " fired" : ""}`}
        style={{ ["--hold" as string]: `${HOLD_MS}ms` }}
        aria-label={`Spray now, ${burstMs} milliseconds. Press and hold.`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          start();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") cancel();
        }}
        onBlur={cancel}
      >
        <svg className="ring" viewBox="0 0 78 78" aria-hidden="true">
          <circle cx="39" cy="39" r="34" />
        </svg>
        <DropIcon className="drop" />
        <span className="fab-text">Hold to spray</span>
      </button>
      <span className="fab-label" aria-hidden="true">Hold</span>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
