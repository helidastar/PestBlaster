// The three leaf-feeding pests in the PestBlaster scope (see Scope and Limitations).
export const PEST_TYPES = ["diamondback_larva", "looper", "aphid_cluster"] as const;
export type PestType = (typeof PEST_TYPES)[number];

export interface PestInfo {
  label: string;
  scientific: string;
  note: string;
  color: string;
}

export const PESTS: Record<PestType, PestInfo> = {
  diamondback_larva: {
    label: "Diamondback moth larva",
    scientific: "Plutella xylostella",
    note: "Small pale-green larva, wriggles backward when touched. Leaves windowpane holes.",
    color: "var(--pest-dbm)",
  },
  looper: {
    label: "Looper",
    scientific: "Trichoplusia ni",
    note: "Green caterpillar that arches its body as it moves. Chews ragged holes.",
    color: "var(--pest-looper)",
  },
  aphid_cluster: {
    label: "Aphid cluster",
    scientific: "Aphididae",
    note: "Groups of tiny soft-bodied insects, usually on leaf undersides.",
    color: "var(--pest-aphid)",
  },
};

export function isPestType(value: unknown): value is PestType {
  return typeof value === "string" && (PEST_TYPES as readonly string[]).includes(value);
}
