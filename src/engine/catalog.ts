/**
 * Nominal physical properties used as the model's starting point.
 *
 * These are engineering estimates, not measurements: the line constants are
 * calibrated so a reference rig reproduces common rules of thumb (about 7 ft of
 * depth per 30 ft colour for Suffix 832, 4.5 for traditional leadcore at 2 mph),
 * and lure/attractor drag areas are typical orders of magnitude. All of them are
 * multiplied by learned factors as readings come in, so errors here cost
 * accuracy only until the logs outvote them.
 */
import type { AttractorType, LeaderMaterial, LureType } from "./types";

export const FT = 0.3048; // m per ft
export const MPH = 0.44704; // m/s per mph
export const OZ = 0.0283495; // kg per oz
export const LB = 0.45359237; // kg per lb

export interface LineSpec {
  id: string;
  label: string;
  /**
   * Speed (m/s) at which a long line of this construction would hang vertically.
   * Terminal slope: sin²θ / cosθ = (K/U)².
   */
  K: number;
  /** Diameter, m (sets drag and friction; the weight follows from K). */
  d: number;
  cdn: number;
  cft: number;
}

export const LINES: Record<string, LineSpec> = {
  "suffix-832": { id: "suffix-832", label: "Suffix 832 Advanced Lead Core", K: 0.1885, d: 0.0010, cdn: 1.2, cft: 0.025 },
  "generic-leadcore": { id: "generic-leadcore", label: "Traditional leadcore", K: 0.1129, d: 0.0016, cdn: 1.2, cft: 0.025 },
};

export function lineSpec(id: string): LineSpec {
  return LINES[id] ?? LINES["generic-leadcore"]!;
}

export interface MaterialSpec {
  /** Density, kg/m³. */
  rho: number;
  /** Diameter per √(lb test), m. */
  dPerSqrtLb: number;
}

export const LEADER_MATERIALS: Record<LeaderMaterial, MaterialSpec> = {
  fluorocarbon: { rho: 1780, dPerSqrtLb: 0.085e-3 },
  monofilament: { rho: 1140, dPerSqrtLb: 0.088e-3 },
  braid: { rho: 980, dPerSqrtLb: 0.034e-3 },
  wire: { rho: 6000, dPerSqrtLb: 0.055e-3 },
  other: { rho: 1140, dPerSqrtLb: 0.088e-3 },
};

export const DEFAULT_LEADER_TEST_LB = 12;
export const LEADER_CDN = 1.2;
export const LEADER_CFT = 0.012;

/** Backing is assumed to be thin braid unless told otherwise. */
export const BACKING = { rho: 980, d: 0.20e-3, cdn: 1.2, cft: 0.02 };

export interface LureTypeSpec {
  /** Drag area Cd·A at nominal size, m². */
  cda: number;
  /** Typical in-air mass, oz, when the weight isn't known. */
  defaultOz: number;
  /** Fraction of the in-air weight that remains as weight in water. */
  netWeightFrac: number;
  /** Extra static weight in water from hooks, N. */
  hookN: number;
  /** Downward bill/dive force as a fraction of the lure's drag. */
  dive: number;
}

export const LURE_TYPES: Record<LureType, LureTypeSpec> = {
  spoon: { cda: 9.0e-4, defaultOz: 0.35, netWeightFrac: 0.86, hookN: 0.005, dive: 0 },
  crankbait: { cda: 3.0e-3, defaultOz: 0.3, netWeightFrac: 0.0, hookN: 0.015, dive: 0.3 },
  stickbait: { cda: 1.6e-3, defaultOz: 0.3, netWeightFrac: 0.0, hookN: 0.012, dive: 0.18 },
  plug: { cda: 5.0e-3, defaultOz: 0.55, netWeightFrac: 0.04, hookN: 0.02, dive: 0.22 },
  spinner: { cda: 1.0e-3, defaultOz: 0.3, netWeightFrac: 0.55, hookN: 0.006, dive: 0.05 },
  softbait: { cda: 5.0e-4, defaultOz: 0.35, netWeightFrac: 0.88, hookN: 0.004, dive: 0 },
  diver: { cda: 8.0e-3, defaultOz: 2.0, netWeightFrac: 0.85, hookN: 0.01, dive: 0.35 },
};

export interface AttractorTypeSpec {
  cda: number;
  weightN: number;
}

export const ATTRACTOR_TYPES: Record<AttractorType, AttractorTypeSpec> = {
  flasher: { cda: 3.5e-3, weightN: 0.02 },
  dodger: { cda: 2.0e-3, weightN: 0.02 },
  fly: { cda: 4.0e-4, weightN: 0.004 },
  other: { cda: 1.0e-3, weightN: 0.01 },
};

/** Hardware at the end of the leader (snap, swivel, knots). */
export const HARDWARE = { cda: 6.0e-5, weightN: 0.01 };

/** Reference conditions for the learned log-linear corrections. */
export const REF_SPEED_MPH = 2;
export const REF_LEADCORE_FT = 150;
