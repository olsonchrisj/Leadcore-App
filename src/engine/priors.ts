import type { PriorSpec } from "./types";

/**
 * Priors on the learned parameters. Physical parameters are log-multipliers on
 * nominal values, so a prior mean of 0 means "trust the catalogue" and the sd is
 * how far we think the catalogue could be off (sd 0.3 ~ a factor 1.35).
 * Discrepancy parameters are small corrections and stay tight unless the data
 * insist.
 */
export function priorFor(name: string): PriorSpec {
  const parts = name.split(":");
  const scope = parts[0];
  if (scope === "phys") {
    const kind = parts[1];
    if (kind === "line") return { mean: 0, sd: 0.3 }; //         lnK
    if (kind === "lureType") return { mean: 0, sd: parts[3] === "lnDive" ? 0.4 : 0.35 }; // drag or bill lift, by type
    if (kind === "lure") return { mean: 0, sd: 0.3 }; //         drag or bill lift, this model
    if (kind === "attType") return { mean: 0, sd: 0.4 };
    if (kind === "att") return { mean: 0, sd: 0.3 };
    if (kind === "global") return { mean: 0, sd: parts[2] === "lnDown" ? 0.5 : 0.4 };
  }
  if (scope === "disc") {
    const kind = parts[1];
    if (kind === "c0") return { mean: 0, sd: 0.12 };
    if (kind === "c1") return { mean: 0, sd: 0.22 };
    if (kind === "c2") return { mean: 0, sd: 0.08 };
    if (kind === "rig") return { mean: 0, sd: 0.05 };
    if (kind === "lure") return { mean: 0, sd: 0.05 };
    if (kind === "lureType") return { mean: 0, sd: 0.06 };
  }
  throw new Error(`unknown parameter: ${name}`);
}

/** Hard limits that keep the model physical however the optimiser wanders. */
export function boundFor(name: string): { min: number; max: number } {
  const parts = name.split(":");
  if (parts[0] === "phys") return { min: -2, max: 2 };
  switch (parts[1]) {
    case "c0": return { min: -0.6, max: 0.6 };
    case "c1": return { min: -0.8, max: 0.5 };   // keeps depth falling with speed
    case "c2": return { min: -0.4, max: 0.4 };   // keeps depth rising with line out
    default: return { min: -0.4, max: 0.4 };
  }
}
