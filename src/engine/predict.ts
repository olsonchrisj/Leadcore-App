import { logDepth, logDepthGrad, physDepthFt, NO_MULTS, P, type Getter } from "./model";
import { priorFor } from "./priors";
import type { CounterSolution, DepthPrediction, FittedModel, RigConfig } from "./types";
import { colorsFromFt } from "./units";

const Z80 = 1.2815515655; // 80% two-sided
const MIN_COUNTER_FT = 0.5;

function makeGetter(model: FittedModel): Getter {
  const index = new Map(model.paramNames.map((n, i) => [n, i]));
  return (name) => {
    const i = index.get(name);
    return i === undefined ? priorFor(name).mean : model.mean[i]!;
  };
}

function split(cfg: RigConfig, counterFt: number) {
  const c = Math.max(counterFt, 0);
  return { leadcoreOutFt: Math.min(c, cfg.leadcoreLengthFt), backingOutFt: Math.max(c - cfg.leadcoreLengthFt, 0) };
}

/** ln depth and its predictive sd (parameter uncertainty + noise). Unseen parameters contribute their prior variance. */
function predictLog(model: FittedModel, cfg: RigConfig, counterFt: number) {
  const index = new Map(model.paramNames.map((n, i) => [n, i]));
  const get = makeGetter(model);
  const { y, grad } = logDepthGrad(cfg, counterFt, get);
  let v = model.sigma * model.sigma;
  const known: [number, number][] = [];
  for (const [name, g] of grad) {
    const i = index.get(name);
    if (i === undefined) v += g * g * priorFor(name).sd ** 2;
    else known.push([i, g]);
  }
  for (const [i, gi] of known) for (const [j, gj] of known) v += gi * gj * model.cov[i]![j]!;

  const warnings: string[] = [];
  if (!index.has(P.lureDrag(cfg.lure.id)))
    warnings.push("No readings for this lure yet: using the typical behaviour of its type.");
  if (cfg.attractor && !index.has(P.attDrag(cfg.attractor.id)))
    warnings.push("No readings with this attractor yet: using the typical behaviour of its type.");
  const dr = model.dataRange;
  if (dr && model.nObservations >= 3) {
    if (cfg.speedMph < dr.speedMph[0] - 0.35 || cfg.speedMph > dr.speedMph[1] + 0.35)
      warnings.push(`Speed is outside what you've logged (${dr.speedMph[0].toFixed(1)}–${dr.speedMph[1].toFixed(1)} mph): this is an extrapolation.`);
    const lc = Math.min(counterFt, cfg.leadcoreLengthFt);
    if (lc < dr.counterFt[0] * 0.6 || counterFt > dr.counterFt[1] * 1.4)
      warnings.push("Line out is beyond the range you've logged: this is an extrapolation.");
  }
  return { y, sd: Math.sqrt(Math.max(v, 0)), warnings };
}

export function predictDepth(model: FittedModel, cfg: RigConfig, counterFt: number): DepthPrediction {
  const out = split(cfg, counterFt);
  if (!(counterFt > 0)) {
    return { depthFt: 0, lowFt: 0, highFt: 0, sdLog: model.sigma, ...out, warnings: [] };
  }
  const { y, sd, warnings } = predictLog(model, cfg, counterFt);
  return {
    depthFt: Math.exp(y),
    lowFt: Math.exp(y - Z80 * sd),
    highFt: Math.exp(y + Z80 * sd),
    sdLog: sd,
    ...out,
    warnings,
  };
}

/** Smallest counter in [lo, hi] where f(counter) >= target (f increasing). */
function invert(f: (c: number) => number, target: number, lo: number, hi: number): number {
  if (f(lo) >= target) return lo;
  if (f(hi) < target) return hi;
  for (let i = 0; i < 34; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export interface SolveOptions {
  /** Backing the solver may use beyond the leadcore, ft. Default 300. */
  maxBackingFt?: number;
}

/**
 * Counter reading (ft) to reach targetDepthFt, plus the counters that would
 * hit it if the lure actually runs at the deep / shallow end of the 80% band.
 */
export function solveCounter(model: FittedModel, cfg: RigConfig, targetDepthFt: number, opts: SolveOptions = {}): CounterSolution {
  const maxCounter = cfg.leadcoreLengthFt + (opts.maxBackingFt ?? 300);
  const get = makeGetter(model);
  const mean = (c: number) => Math.exp(logDepth(cfg, c, get));
  const dMin = mean(MIN_COUNTER_FT);
  const dMax = mean(maxCounter);
  const tooShallow = targetDepthFt < dMin;
  const achievable = targetDepthFt <= dMax;

  const counter = invert(mean, targetDepthFt, MIN_COUNTER_FT, maxCounter);
  const { y, sd, warnings } = predictLog(model, cfg, counter);
  const k = Math.exp(Z80 * sd);
  // If the lure runs deeper than the mean (by k), less line is needed.
  const counterForHigh = invert(mean, targetDepthFt / k, MIN_COUNTER_FT, maxCounter);
  const counterForLow = invert(mean, targetDepthFt * k, MIN_COUNTER_FT, maxCounter);
  const out = split(cfg, counter);
  const w = [...warnings];
  if (tooShallow) w.push("This rig runs deeper than that even with almost no line out: try a shorter leader or a lighter lure.");
  else if (!achievable) w.push("Target depth isn't reachable with the line available.");
  return {
    achievable,
    tooShallow,
    counterFt: counter,
    counterForHighFt: counterForHigh,
    counterForLowFt: counterForLow,
    ...out,
    colors: colorsFromFt(out.leadcoreOutFt),
    predictedDepthFt: Math.exp(y),
    warnings: w,
  };
}

export interface ChartCell {
  counterFt: number;
  /** False when the depth can't be reached (too shallow or too deep for the line). */
  ok: boolean;
}

/**
 * Counter readings for a grid of speeds × depths. Each speed is sampled once
 * along the line and inverted by interpolation, which is exact enough (depth is
 * smooth and monotonic in line out) and cheap.
 */
export function depthChart(model: FittedModel, cfg: RigConfig, speedsMph: number[], depthsFt: number[], opts: SolveOptions = {}): ChartCell[][] {
  const maxCounter = cfg.leadcoreLengthFt + (opts.maxBackingFt ?? 300);
  const get = makeGetter(model);
  const N = 72;
  const grid = Array.from({ length: N + 1 }, (_, i) => MIN_COUNTER_FT + ((maxCounter - MIN_COUNTER_FT) * i) / N);
  return speedsMph.map((s) => {
    const c = { ...cfg, speedMph: s };
    const d = grid.map((g) => Math.exp(logDepth(c, g, get)));
    return depthsFt.map((target) => {
      if (target < d[0]! || target > d[N]!) return { counterFt: target < d[0]! ? grid[0]! : maxCounter, ok: false };
      let i = 1;
      while (i < N && d[i]! < target) i++;
      const t = (target - d[i - 1]!) / (d[i]! - d[i - 1]!);
      return { counterFt: grid[i - 1]! + t * (grid[i]! - grid[i - 1]!), ok: true };
    });
  });
}

export interface FitSummary {
  n: number;
  /** Typical (rms) prediction error on held-out readings, percent. */
  looRmsPct: number;
  /** Typical misfit on the readings themselves, percent. */
  rmsPct: number;
  /** Learned noise level, percent. */
  noisePct: number;
  flagged: number;
}

export function summarize(model: FittedModel): FitSummary {
  const r = model.rows;
  const rms = (xs: number[]) => (xs.length ? Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length) : 0);
  return {
    n: model.nObservations,
    looRmsPct: rms(r.map((x) => x.looErrPct)),
    rmsPct: rms(r.map((x) => x.errPct)),
    noisePct: (Math.exp(model.sigma) - 1) * 100,
    flagged: r.filter((x) => x.flagged).length,
  };
}

export interface NextReading {
  speedMph: number;
  counterFt: number;
  /** Predictive uncertainty there, percent. */
  uncertaintyPct: number;
}

export interface SuggestBounds {
  /** Speeds worth trying, mph. Default 1.4–3.2. */
  speedMph?: [number, number];
  /** Line out worth trying, ft. Default 60 ft up to the leadcore length. */
  counterFt?: [number, number];
}

const linspace = (lo: number, hi: number, n: number) => (hi <= lo ? [lo] : Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1)));

/**
 * Where a new reading would teach the model the most: the practical speed and
 * line-out combination it is least sure about, rounded to numbers you can set.
 */
export function suggestNextReading(model: FittedModel, cfg: RigConfig, bounds: SuggestBounds = {}): NextReading {
  const [sLo, sHi] = bounds.speedMph ?? [1.4, 3.2];
  const [cLo, cHi] = bounds.counterFt ?? [60, Math.max(cfg.leadcoreLengthFt, 60)];
  let best = { sd: -1, speedMph: cfg.speedMph, counterFt: Math.min(150, cfg.leadcoreLengthFt) };
  for (const s of linspace(sLo, sHi, 7)) {
    const speedMph = Math.round(s * 10) / 10;
    for (const c of linspace(cLo, cHi, 7)) {
      const counterFt = Math.max(10, Math.round(c / 10) * 10);
      const { sd } = predictLog(model, { ...cfg, speedMph }, counterFt);
      if (sd > best.sd + 1e-9) best = { sd, speedMph, counterFt };
    }
  }
  return { speedMph: best.speedMph, counterFt: best.counterFt, uncertaintyPct: (Math.exp(Math.max(best.sd, 0)) - 1) * 100 };
}

export interface LineRate {
  /** Learned feet of depth per colour (30 ft) at 2 mph, full spool, reference leader and spoon. */
  ftPerColor: number;
  /** The same for the catalogue's starting assumption. */
  nominalFtPerColor: number;
}

export function referenceRate(model: FittedModel, lineId: string, leadcoreLengthFt = 300): LineRate {
  const ref: RigConfig = {
    lineId,
    leadcoreLengthFt,
    speedMph: 2,
    lure: { id: "__reference__", type: "spoon", weightOz: 0.35 },
    leader: { material: "fluorocarbon", lengthFt: 50 },
  };
  const colors = leadcoreLengthFt / 30;
  return {
    ftPerColor: Math.exp(logDepth(ref, leadcoreLengthFt, makeGetter(model))) / colors,
    nominalFtPerColor: physDepthFt(ref, leadcoreLengthFt, NO_MULTS) / colors,
  };
}
