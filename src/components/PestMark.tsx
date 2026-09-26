import { PESTS, type PestType } from "@/lib/pests";

/** Each pest has its own shape as well as color, so it never depends on color alone. */
export function PestShape({ pest, x, y, r = 6, className }: { pest: PestType; x: number; y: number; r?: number; className?: string }) {
  const fill = PESTS[pest].color;
  if (pest === "diamondback_larva") {
    return <circle className={className} cx={x} cy={y} r={r} style={{ fill }} />;
  }
  if (pest === "looper") {
    return <rect className={className} x={x - r} y={y - r} width={r * 2} height={r * 2} rx={2} style={{ fill }} />;
  }
  const h = r * 1.15;
  return (
    <path
      className={className}
      d={`M ${x} ${y - h} L ${x + h} ${y + h * 0.8} L ${x - h} ${y + h * 0.8} Z`}
      style={{ fill }}
      strokeLinejoin="round"
    />
  );
}

export function PestSwatch({ pest }: { pest: PestType }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <PestShape pest={pest} x={7} y={7} r={5} />
    </svg>
  );
}

export function PestLabel({ pest }: { pest: PestType }) {
  return (
    <span className="pest-name">
      <PestSwatch pest={pest} />
      {PESTS[pest].label}
    </span>
  );
}
