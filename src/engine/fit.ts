import { features, splitCounter } from "./features";
import { invertSPD, matVec, zeros } from "./linalg";
import { boundFor, priorFor } from "./priors";
import type { FitOptions, FittedModel, Observation, PriorSpec } from "./types";

const DEFAULT_SIGMA = 0.07;
const PIN_SD = 1e-4;
const SPEED_MAX = -0.05; // keep in step with boundFor(line speed)

/**
 * Hierarchical model as one Bayesian linear regression: line-wide terms,
 * lure-type offsets, per-lure offsets, attractor, and rig offsets all get
 * Gaussian priors, so sparse lures shrink toward their type (partial pooling).
 */
export function fitModel(
  observations: Observation[],
  opts: FitOptions = {},
): FittedModel {
  let sigma = opts.sigma ?? DEFAULT_SIGMA;
  const skipped: { index: number; reason: string }[] = [];

  const rows: { f: Map<string, number>; y: number; q: number }[] = [];
  // line / type / lure speed-param names that appear together in the data.
  const speedChains = new Set<string>();
  observations.forEach((o, index) => {
    const out = splitCounter(o.counterFt, o.leadcoreLengthFt);
    if (!(out.leadcoreOutFt > 0)) return void skipped.push({ index, reason: "no leadcore out" });
    if (!(o.depthFt > 0)) return void skipped.push({ index, reason: "depth must be > 0" });
    if (!(o.speedMph > 0)) return void skipped.push({ index, reason: "speed must be > 0" });
    const q = o.quality ?? 1;
    if (!(q > 0)) return void skipped.push({ index, reason: "quality must be > 0" });
    speedChains.add(
      [`line:${o.lineId}:speed`, `lureType:${o.lure.type}:speed`, `lure:${o.lure.id}:speed`].join("|"),
    );
    rows.push({
      f: features(o, out),
      y: Math.log(o.depthFt / out.leadcoreOutFt),
      q,
    });
  });

  const names = [...new Set(rows.flatMap((r) => [...r.f.keys()]))].sort();
  const idx = new Map(names.map((n, i) => [n, i]));
  const p = names.length;
  const n = rows.length;

  const X = rows.map((r) => {
    const x = new Array<number>(p).fill(0);
    for (const [k, v] of r.f) x[idx.get(k)!] = v;
    return x;
  });
  const y = rows.map((r) => r.y);
  const q = rows.map((r) => r.q);

  const priors = new Map<string, PriorSpec>(names.map((nm) => [nm, priorFor(nm)]));
  const pinned = new Set<string>();

  const solve = () => {
    const A = zeros(p, p);
    const b = new Array<number>(p).fill(0);
    for (let i = 0; i < p; i++) {
      const pr = priors.get(names[i]!)!;
      A[i]![i] = 1 / (pr.sd * pr.sd);
      b[i] = pr.mean / (pr.sd * pr.sd);
    }
    for (let r = 0; r < n; r++) {
      const w = q[r]! / (sigma * sigma);
      const xr = X[r]!;
      for (let i = 0; i < p; i++) {
        if (xr[i] === 0) continue;
        b[i]! += w * xr[i]! * y[r]!;
        for (let j = 0; j < p; j++) A[i]![j]! += w * xr[i]! * xr[j]!;
      }
    }
    const cov = invertSPD(A);
    return { cov, mean: matVec(cov, b) };
  };

  let post = solve();
  const enforceBounds = () => {
    for (let guard = 0; guard < p + 1; guard++) {
      let violated = false;
      names.forEach((nm, i) => {
        const bd = boundFor(nm);
        if (!bd || pinned.has(nm)) return;
        const m = post.mean[i]!;
        const clamp =
          bd.max !== undefined && m > bd.max ? bd.max :
          bd.min !== undefined && m < bd.min ? bd.min : undefined;
        if (clamp !== undefined) {
          priors.set(nm, { mean: clamp, sd: PIN_SD });
          pinned.add(nm);
          violated = true;
        }
      });
      // Total speed slope (line + type + lure) must stay physical per lure.
      for (const chain of speedChains) {
        const [lineN, typeN, lureN] = chain.split("|") as [string, string, string];
        const mean = (nm: string) => post.mean[idx.get(nm) ?? -1] ?? 0;
        for (const level of [typeN, lureN]) {
          if (pinned.has(level) || !idx.has(level)) continue;
          const upTo = level === typeN ? mean(lineN) + mean(typeN) : mean(lineN) + mean(typeN) + mean(lureN);
          if (upTo > SPEED_MAX) {
            priors.set(level, { mean: mean(level) - (upTo - SPEED_MAX), sd: PIN_SD });
            pinned.add(level);
            violated = true;
          }
        }
      }
      if (!violated) return;
      post = solve();
    }
  };
  enforceBounds();

  if (opts.estimateNoise && n > 2) {
    for (let iter = 0; iter < 5; iter++) {
      let rss = 0;
      let trace = 0;
      for (let r = 0; r < n; r++) {
        const xr = X[r]!;
        let pred = 0;
        for (let i = 0; i < p; i++) pred += xr[i]! * post.mean[i]!;
        rss += q[r]! * (y[r]! - pred) ** 2;
        const cx = matVec(post.cov, xr);
        trace += (q[r]! / (sigma * sigma)) * xr.reduce((s, v, i) => s + v * cx[i]!, 0);
      }
      const dof = n - trace;
      if (dof < 1) break;
      sigma = Math.min(0.3, Math.max(0.02, Math.sqrt(rss / dof)));
      post = solve();
      enforceBounds();
    }
  }

  return {
    paramNames: names,
    mean: post.mean,
    cov: post.cov,
    sigma,
    nObservations: n,
    skipped,
    pinned: [...pinned],
  };
}
