// The three leaf-feeding pests on the Approval Sheet; keys match the YOLO11n class names.
export const PEST_TYPES = ["looper", "armyworm_cutworm", "aphid_colony"] as const;
export type PestType = (typeof PEST_TYPES)[number];

export interface PestInfo {
  label: string;
  scientific: string;
  note: string;
  color: string;
}

export const PESTS: Record<PestType, PestInfo> = {
  armyworm_cutworm: {
    label: "Armyworm / cutworm",
    scientific: "Spodoptera litura, Agrotis spp.",
    note: "Smooth caterpillar with dark side stripes. Feeds mostly at dusk and at night, chewing large holes and leaf edges.",
    color: "var(--pest-army)",
  },
  looper: {
    label: "Looper",
    scientific: "Trichoplusia ni",
    note: "Green caterpillar that arches its body as it moves. Chews ragged holes.",
    color: "var(--pest-looper)",
  },
  aphid_colony: {
    label: "Aphid colony",
    scientific: "Aphididae",
    note: "Colonies of tiny soft-bodied insects on the leaves and new growth.",
    color: "var(--pest-aphid)",
  },
};

/** Class names used before the approved pest list (kept so old logs still open). */
export const RENAMED_PESTS: Record<string, PestType> = { diamondback_larva: "armyworm_cutworm", aphid_cluster: "aphid_colony" };

export function isPestType(value: unknown): value is PestType {
  return typeof value === "string" && (PEST_TYPES as readonly string[]).includes(value);
}
