"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePoll } from "@/lib/client";
import { ClockIcon, LeafIcon, SlidersIcon, TurretIcon } from "./Icons";

const TABS = [
  { href: "/", label: "Turret", Icon: TurretIcon },
  { href: "/pests", label: "Pests", Icon: LeafIcon },
  { href: "/control", label: "Control", Icon: SlidersIcon },
  { href: "/history", label: "History", Icon: ClockIcon },
];

export function Nav() {
  const path = usePathname();
  const { data } = usePoll<{ unreadAlerts: number }>("/api/status", 10000);
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-inner">
        {TABS.map(({ href, label, Icon }) => (
          <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
            <Icon />
            {label}
            {href === "/history" && data && data.unreadAlerts > 0 && (
              <span className="badge" aria-label={`${data.unreadAlerts} unread alerts`}>
                {data.unreadAlerts > 99 ? "99+" : data.unreadAlerts}
              </span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
