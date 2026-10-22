const BOTTLE = "M17 2h14v8l9 9v53a5 5 0 0 1-5 5H13a5 5 0 0 1-5-5V19l9-9z";
/** One wavelength is 48 units wide; two are drawn so the loop can slide by one. */
const WAVE = "q12 -5 24 0 t24 0 t24 0 t24 0 v90 h-96 z";

/** The deterrent reservoir drawn as the recycled bottle it is, water moving inside. */
export function Reservoir({ pct, lowPct }: { pct: number; lowPct: number }) {
  const low = pct <= lowPct;
  const level = Math.max(0, Math.min(1, pct / 100));
  const surface = 76 - 62 * level;
  const water = low ? "var(--danger)" : "var(--spray)";
  return (
    <section className={`card leaf tank-card${low ? " low" : ""}`} aria-label={`Deterrent bottle ${Math.round(pct)}% full`}>
      <svg viewBox="0 0 48 80" aria-hidden="true">
        <defs>
          <clipPath id="bottle">
            <path d={BOTTLE} />
          </clipPath>
        </defs>
        <g clipPath="url(#bottle)">
          <path className="wave back" d={`M0 ${surface} ${WAVE}`} style={{ fill: water }} />
          <path className="wave" d={`M0 ${surface + 1.5} ${WAVE}`} style={{ fill: water }} />
        </g>
        <path d={BOTTLE} fill="none" stroke="var(--ink-2)" strokeWidth="2" />
        <rect x="16" y="0" width="16" height="4" rx="1.5" fill="var(--ink-2)" />
      </svg>
      <div>
        <div className="level">
          {Math.round(pct)}
          <small>%</small>
        </div>
        <p>{low ? "Low. Refill the deterrent bottle." : "Deterrent left"}</p>
      </div>
    </section>
  );
}
