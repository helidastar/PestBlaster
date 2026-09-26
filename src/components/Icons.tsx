// Small stroke icons drawn for this app (turret, leaf, sliders, clock).
const base = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const TurretIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <circle cx="12" cy="12" r="9" opacity="0.4" />
    <path d="M12 12 L19 6" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <circle cx="19" cy="6" r="1.6" />
  </svg>
);
export const LeafIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" />
    <path d="M5 19 13 11" />
    <circle cx="15.5" cy="9.5" r="1" fill="currentColor" />
  </svg>
);
export const SlidersIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);
export const ClockIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const DropIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" />
  </svg>
);
