import type { PriorSpec } from "./types";

/**
 * Starting beliefs, NOT measured data. Everything here is an unverified
 * rule of thumb (see SPEC.md "Research status") meant to be overridden by
 * logged observations. Scale: ln(depth / leadcoreOutFt).
 */

/** ln(depthFt / leadcoreFt) at 2.0 mph, 150 ft out, 1 oz lure, no leader effects. */
const LINE_ICPT: Record<string, PriorSpec> = {
  // ~7 ft of depth per 30 ft color => ratio 0.233. Unverified secondary source.
  "suffix-832": { mean: Math.log(7 / 30), sd: 0.3 },
  // ~4.5 ft/color for traditional leadcore. Unverified.
  default: { mean: Math.log(4.5 / 30), sd: 0.35 },
};

const LURE_TYPE_ICPT: Record<string, number> = {
  spoon: 0,
  stickbait: -0.03,
  crankbait: -0.08,
  diver: -0.15,
  plug: -0.04,
  softbait: 0,
};

const ATTRACTOR_TYPE_ICPT: Record<string, number> = {
  flasher: -0.12,
  dodger: -0.1,
  fly: -0.02,
  other: -0.05,
};

/** Per 50 ft of leader. Unverified: denser materials sink a bit more. */
const LEADER_MATERIAL: Record<string, number> = {
  fluorocarbon: 0.02,
  monofilament: 0,
  braid: 0.01,
  wire: 0.03,
  other: 0,
};

/** Parameter names are `scope:...:term`; returns the prior for one. */
export function priorFor(name: string): PriorSpec {
  const parts = name.split(":");
  const scope = parts[0]!;
  const term = parts[parts.length - 1]!;

  if (scope === "line") {
    const lineId = parts[1]!;
    switch (term) {
      case "icpt":
        return LINE_ICPT[lineId] ?? LINE_ICPT["default"]!;
      case "speed":
        return { mean: -1.0, sd: 0.5 }; // depth ~ speed^-1; unverified
      case "lnLen":
        return { mean: 0, sd: 0.15 };
      case "lureWt":
        return { mean: 0.03, sd: 0.03 }; // ~+1 ft/oz at ~35 ft
      case "backing":
        return { mean: 0.02, sd: 0.05 }; // per 100 ft of backing out
    }
  }
  if (scope === "leader") {
    if (term === "testLb") return { mean: -0.02, sd: 0.03 };
    return { mean: LEADER_MATERIAL[term] ?? 0, sd: 0.05 };
  }
  if (scope === "lureType") {
    const type = parts[1]!;
    return term === "icpt"
      ? { mean: LURE_TYPE_ICPT[type] ?? 0, sd: 0.1 }
      : { mean: 0, sd: 0.15 };
  }
  if (scope === "lure") {
    return term === "icpt" ? { mean: 0, sd: 0.08 } : { mean: 0, sd: 0.1 };
  }
  if (scope === "attType") {
    return { mean: ATTRACTOR_TYPE_ICPT[parts[1]!] ?? -0.05, sd: 0.08 };
  }
  if (scope === "att") return { mean: 0, sd: 0.05 };
  if (scope === "rig") return { mean: 0, sd: 0.05 };
  throw new Error(`unknown parameter: ${name}`);
}

/** Physical bounds enforced after fitting. */
export function boundFor(
  name: string,
): { min?: number; max?: number } | undefined {
  const parts = name.split(":");
  if (parts[0] !== "line") return undefined;
  switch (parts[parts.length - 1]) {
    case "speed":
      return { max: -0.05 }; // faster => shallower
    case "lnLen":
      return { min: -0.6 }; // keeps depth increasing with line out
    case "backing":
      return { min: 0 }; // more line out never raises the lure
  }
  return undefined;
}
