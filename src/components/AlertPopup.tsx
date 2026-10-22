"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePoll } from "@/lib/client";
import type { Alert } from "@/lib/types";

const POLL_MS = 2000;
const SHOW_MS = 8000;

const TITLE: Record<Alert["kind"], string> = {
  pest: "Pest found",
  reservoir_low: "Refill the deterrent",
  device: "Turret",
};

/** Pops up each new alert as soon as the server has it, on every page. */
export function AlertPopup() {
  const { data } = usePoll<Alert[]>("/api/alerts", POLL_MS);
  const [shown, setShown] = useState<Alert[]>([]);
  const lastId = useRef<number | null>(null);

  useEffect(() => {
    if (!data) return;
    const newest = data.reduce((m, a) => Math.max(m, a.id), 0);
    // First load: only remember where we are, so old alerts don't pop up again.
    if (lastId.current === null) {
      lastId.current = newest;
      return;
    }
    const fresh = data.filter((a) => a.id > (lastId.current ?? 0)).sort((a, b) => a.id - b.id);
    lastId.current = Math.max(lastId.current, newest);
    if (fresh.length === 0) return;
    navigator.vibrate?.([60, 40, 60]);
    setShown((s) => [...fresh, ...s].slice(0, 3));
    const ids = new Set(fresh.map((a) => a.id));
    setTimeout(() => setShown((s) => s.filter((a) => !ids.has(a.id))), SHOW_MS);
  }, [data]);

  if (shown.length === 0) return null;
  return (
    <div className="alert-pops" role="alert" aria-live="assertive">
      {shown.map((a) => (
        <Link key={a.id} href="/history" className={`alert-pop ${a.kind}`} onClick={() => setShown([])}>
          <strong>{TITLE[a.kind]}</strong>
          <span>{a.message}</span>
        </Link>
      ))}
    </div>
  );
}
