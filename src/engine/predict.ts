import { features, splitCounter } from "./features";
import { priorFor } from "./priors";
import type {
  CounterSolution,
  DepthPrediction,
  FittedModel,
  RigConfig,
} from "./types";
import { colorsFromFt } from "./units";

const Z80 = 1.2815515655;

/** Posterior mean and sd of ln(depth/leadcoreOut); unseen params use their prior. */
function logRatio(model: FittedModel, cfg: RigConfig, counterFt: number) {
  const out = splitCounter(counterFt, cfg.leadcoreLengthFt);
  const f = features(cfg, out);
  const index = new Map(model.paramNames.map((n, i) => [n, i]));
  const known: [number, number][] = [];
  let mean = 0;
  let varLog = model.sigma ** 2;
  const warnings: string[] = [];

  for (const [name, x] of f) {
    const i = index.get(name);
    if (i === undefined) {
      const pr = priorFor(name);
      mean += x * pr.mean;
      varLog += x * x * pr.sd * pr.sd;
    } else {
      known.push([i, x]);
      mean += x * model.mean[i]!;
    }
  }
  for (const [i, xi] of known)
    for (const [j, xj] of known) varLog += xi * xj * model.cov[i]![j]!;

  if (!index.has(`lure:${cfg.lure.id}:icpt`))
    warnings.push(`No data for lure "${cfg.lure.id}"; using its type prior.`);
  if (cfg.attractor && !index.has(`att:${cfg.attractor.id}:icpt`))
    warnings.push(`No data for attractor "${cfg.attractor.id}"; using its type prior.`);

  let slope = 0;
  for (const name of [
    `line:${cfg.lineId}:speed`,
    `lureType:${cfg.lure.type}:speed`,
    `lure:${cfg.lure.id}:speed`,
  ]) {
    const i = index.get(name);
    slope += i === undefined ? priorFor(name).mean : model.mean[i]!;
  }
  if (slope > 0)
    warnings.push("Fitted speed response is non-physical (faster runs deeper); add more data.");

  return { mean, sd: Math.sqrt(Math.max(varLog, 0)), out, warnings };
}

export function predictDepth(
  model: FittedModel,
  cfg: RigConfig,
  counterFt: number,
): DepthPrediction {
  const { mean, sd, out, warnings } = logRatio(model, cfg, counterFt);
  const L = out.leadcoreOutFt;
  if (L <= 0) {
    return { depthFt: 0, lowFt: 0, highFt: 0, sdLog: sd, ...out, warnings };
  }
  return {
    depthFt: L * Math.exp(mean),
    lowFt: L * Math.exp(mean - Z80 * sd),
    highFt: L * Math.exp(mean + Z80 * sd),
    sdLog: sd,
    ...out,
    warnings,
  };
}

/** Smallest counter in (0, maxCounter] where f(counter) >= target (f assumed increasing). */
function bisect(f: (c: number) => number, target: number, maxCounter: number): number {
  if (f(maxCounter) < target) return maxCounter;
  let lo = 0.1;
  let hi = maxCounter;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Counter reading (ft) to reach targetDepthFt, with the counters that would
 * hit it if the lure actually runs at the shallow/deep end of the 80% band.
 */
export function solveCounter(
  model: FittedModel,
  cfg: RigConfig,
  targetDepthFt: number,
  maxBackingFt = 300,
): CounterSolution {
  const maxCounter = cfg.leadcoreLengthFt + maxBackingFt;
  const meanDepth = (c: number) => predictDepth(model, cfg, c).depthFt;
  const counter = bisect(meanDepth, targetDepthFt, maxCounter);
  const here = predictDepth(model, cfg, counter);
  const achievable = meanDepth(maxCounter) >= targetDepthFt;
  const k = Math.exp(Z80 * here.sdLog);
  // If the lure runs deeper than the mean (k times), less line is needed.
  const counterForHigh = bisect(meanDepth, targetDepthFt / k, maxCounter);
  const counterForLow = bisect(meanDepth, targetDepthFt * k, maxCounter);
  const warnings = [...here.warnings];
  if (!achievable) warnings.push("Target depth not reachable with the line available.");
  return {
    achievable,
    counterFt: counter,
    counterForHighFt: counterForHigh,
    counterForLowFt: counterForLow,
    leadcoreOutFt: here.leadcoreOutFt,
    backingOutFt: here.backingOutFt,
    colors: colorsFromFt(here.leadcoreOutFt),
    predictedDepthFt: here.depthFt,
    warnings,
  };
}
