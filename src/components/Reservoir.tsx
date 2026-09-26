/** The deterrent reservoir drawn as the recycled bottle it is. */
export function Reservoir({ pct, lowPct }: { pct: number; lowPct: number }) {
  const low = pct <= lowPct;
  const h = 52 * Math.max(0, Math.min(1, pct / 100));
  return (
    <div className="tank">
      <svg viewBox="0 0 44 72" aria-hidden="true">
        <defs>
          <clipPath id="bottle">
            <path d="M16 2h12v8l8 8v48a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V18l8-8z" />
          </clipPath>
        </defs>
        <rect x="0" y={70 - h} width="44" height={h} clipPath="url(#bottle)" style={{ fill: low ? "var(--danger)" : "var(--spray)" }} />
        <path d="M16 2h12v8l8 8v48a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V18l8-8z" fill="none" stroke="var(--ink-2)" strokeWidth="2" />
      </svg>
      <div>
        <div className="level">{Math.round(pct)}%</div>
        <div className={low ? "" : "muted"} style={low ? { color: "var(--danger)", fontWeight: 700 } : undefined}>
          {low ? "Low. Refill the deterrent bottle." : "Deterrent left in the bottle"}
        </div>
      </div>
    </div>
  );
}
