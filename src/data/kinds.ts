import type { AttractorType, LeaderMaterial, LureType } from "../engine";

/** Display order and labels for the kinds the engine knows about. */
export const LURE_KINDS: { id: LureType; label: string }[] = [
  { id: "spoon", label: "Spoon" },
  { id: "crankbait", label: "Crankbait" },
  { id: "stickbait", label: "Stickbait / jerkbait" },
  { id: "plug", label: "Plug (Flatfish, Kwikfish…)" },
  { id: "diver", label: "Diver (Dipsy…)" },
  { id: "spinner", label: "Spinner / harness" },
  { id: "softbait", label: "Soft bait / hoochie" },
];

export const ATTRACTOR_KINDS: { id: AttractorType; label: string }[] = [
  { id: "flasher", label: "Flasher" },
  { id: "dodger", label: "Dodger" },
  { id: "fly", label: "Fly / hoochie" },
  { id: "other", label: "Other hardware" },
];

export const LEADER_KINDS: { id: LeaderMaterial; label: string }[] = [
  { id: "fluorocarbon", label: "Fluorocarbon" },
  { id: "monofilament", label: "Monofilament" },
  { id: "braid", label: "Braid" },
  { id: "wire", label: "Wire" },
  { id: "other", label: "Other" },
];

export const lureKindLabel = (t: string) => LURE_KINDS.find((k) => k.id === t)?.label.split(/ [\/(]/)[0] ?? t;
export const attractorKindLabel = (t: string) => ATTRACTOR_KINDS.find((k) => k.id === t)?.label ?? t;

export const LURE_KIND_IDS = new Set<string>(LURE_KINDS.map((k) => k.id));
export const ATTRACTOR_KIND_IDS = new Set<string>(ATTRACTOR_KINDS.map((k) => k.id));
export const LEADER_KIND_IDS = new Set<string>(LEADER_KINDS.map((k) => k.id));
