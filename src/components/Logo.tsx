/**
 * PestBlaster mark: a lettuce leaf whose midrib is the turret arm, pivoting at the
 * stem (the turret base) and sending a drop of deterrent off the tip.
 * Kept in sync with public/icon.svg.
 */
export function Logo() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="M4 24C2.5 13.5 9 6.5 20.5 7.5 21.5 19 14.5 25.5 4 24Z" fill="var(--scope)" />
      <path d="M9 19 8 15M9 19l4 1M12.3 15.7l-1-4M12.3 15.7l4 1" stroke="var(--heart)" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" fill="none" />
      <path d="M5.5 22.5 18 10" stroke="var(--heart)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="5.5" cy="22.5" r="2.3" fill="var(--heart)" stroke="var(--scope)" strokeWidth="1.2" />
      <path transform="translate(23.3 4.7) rotate(225)" d="M0-3.6C1.8-1.3 2.2 0 2.2.9a2.2 2.2 0 0 1-4.4 0C-2.2 0-1.8-1.3 0-3.6Z" fill="var(--spray)" />
    </svg>
  );
}
