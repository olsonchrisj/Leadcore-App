/**
 * Bayesian calibration of the physical model against logged readings.
 *
 * Observation model:  ln(depth_i) = f_i(θ) + ε_i,  ε_i ~ N(0, σ²/q_i)
 * Prior:              θ_j ~ N(μ_j, s_j²)  (see priors.ts)
 *
 * The posterior mode is found with Levenberg–Marquardt (Gauss–Newton with
 * damping), using a Huber loss so a single mistyped depth can't drag the whole
 * fit. The posterior covariance is the Laplace approximation (JᵀWJ/σ² + Λ)⁻¹, so
 * every prediction carries an uncertainty that shrinks where the data are.
 * Each reading only touches the handful of parameters it involves, so the
 * Jacobian is sparse and a fit with hundreds of readings still takes a fraction
 * of a second.
 */
import { logDepth, logDepthGrad, paramNamesFor, type Getter } from "./model";
import { cholesky, cholInverse, cholSolve, zeros } from "./linalg";
import { boundFor, priorFor } from "./priors";
import type { FitOptions, FittedModel, Observation, RigConfig, RowDiagnostic } from "./types";

const SIGMA0 = 0.07; // default noise on ln(depth): about 7%
const SIGMA_MIN = 0.02;
const SIGMA_MAX = 0.3;
const NU0 = 4; // how many readings' worth of belief sits behind SIGMA0
const MAX_ITER = 40;

interface Row {
  index: number;
  cfg: RigConfig;
  counter: number;
  y: number;
  q: number;
}

function sanitize(observations: Observation[], skipped: FittedModel["skipped"]): Row[] {
  const rows: Row[] = [];
  observations.forEach((o, index) => {
    const bad = (reason: string) => void skipped.push({ index, reason });
    if (!o || typeof o !== "object") return bad("not a reading");
    if (!Number.isFinite(o.counterFt) || o.counterFt <= 0) return bad("counter must be above 0");
    if (!Number.isFinite(o.depthFt) || o.depthFt <= 0) return bad("depth must be above 0");
    if (!Number.isFinite(o.speedMph) || o.speedMph <= 0 || o.speedMph > 15) return bad("speed out of range");
    if (!Number.isFinite(o.leadcoreLengthFt) || o.leadcoreLengthFt <= 0) return bad("leadcore length must be above 0");
    if (!o.lure || !o.leader || !Number.isFinite(o.leader.lengthFt) || o.leader.lengthFt < 0) return bad("missing lure or leader");
    const q = o.quality ?? 1;
    if (!(q > 0) || !Number.isFinite(q)) return bad("quality must be above 0");
    rows.push({ index, cfg: o, counter: o.counterFt, y: Math.log(o.depthFt), q });
  });
  return rows;
}

const huber = (z: number, k: number) => {
  const a = Math.abs(z);
  return a <= k ? 0.5 * z * z : k * a - 0.5 * k * k;
};

export function fitModel(observations: Observation[], opts: FitOptions = {}): FittedModel {
  const skipped: FittedModel["skipped"] = [];
  const rows = sanitize(observations, skipped);
  const k = opts.huber ?? 2;
  let sigma = opts.sigma ?? SIGMA0;
  const n = rows.length;

  // ---- parameter registry
  const names = [...new Set(rows.flatMap((r) => paramNamesFor(r.cfg)))].sort();
  const idx = new Map(names.map((nm, i) => [nm, i]));
  const p = names.length;
  const prior = names.map(priorFor);
  const mu = prior.map((s) => s.mean);
  const lam = prior.map((s) => 1 / (s.sd * s.sd));
  const bounds = names.map(boundFor);
  const clamp = (th: number[]) => th.map((v, i) => Math.min(bounds[i]!.max, Math.max(bounds[i]!.min, v)));

  const getter = (th: number[]): Getter => (name) => {
    const i = idx.get(name);
    return i === undefined ? priorFor(name).mean : th[i]!;
  };

  const priorTerm = (th: number[]) => {
    let s = 0;
    for (let i = 0; i < p; i++) s += 0.5 * lam[i]! * (th[i]! - mu[i]!) ** 2;
    return s;
  };
  const objective = (th: number[], sg: number) => {
    const get = getter(th);
    let s = priorTerm(th);
    for (const r of rows) s += huber(((r.y - logDepth(r.cfg, r.counter, get)) * Math.sqrt(r.q)) / sg, k);
    return s;
  };

  interface Lin {
    f: number[];
    gIdx: number[][];
    gVal: number[][];
  }
  const linearise = (th: number[]): Lin => {
    const get = getter(th);
    const f: number[] = [];
    const gIdx: number[][] = [];
    const gVal: number[][] = [];
    for (const r of rows) {
      const { y, grad } = logDepthGrad(r.cfg, r.counter, get);
      f.push(y);
      const ii: number[] = [];
      const vv: number[] = [];
      for (const [name, g] of grad) {
        const i = idx.get(name);
        if (i !== undefined) {
          ii.push(i);
          vv.push(g);
        }
      }
      gIdx.push(ii);
      gVal.push(vv);
    }
    return { f, gIdx, gVal };
  };

  /** Normal equations at θ with robust weights; also returns the weights. */
  const normalEquations = (th: number[], sg: number) => {
    const lin = linearise(th);
    const A = zeros(p, p);
    const b = new Array<number>(p).fill(0);
    for (let i = 0; i < p; i++) {
      A[i]![i] = lam[i]!;
      b[i] = -lam[i]! * (th[i]! - mu[i]!);
    }
    const w: number[] = [];
    rows.forEach((r, ri) => {
      const res = r.y - lin.f[ri]!;
      const z = (res * Math.sqrt(r.q)) / sg;
      const rho = Math.abs(z) <= k ? 1 : k / Math.abs(z);
      w.push(rho);
      const c = (r.q * rho) / (sg * sg);
      const ii = lin.gIdx[ri]!;
      const vv = lin.gVal[ri]!;
      for (let a = 0; a < ii.length; a++) {
        b[ii[a]!]! += c * vv[a]! * res;
        for (let bb = 0; bb < ii.length; bb++) A[ii[a]!]![ii[bb]!]! += c * vv[a]! * vv[bb]!;
      }
    });
    return { A, b, w, lin };
  };

  let theta = mu.slice();
  if (opts.init) {
    const prev = new Map(opts.init.paramNames.map((nm, i) => [nm, opts.init!.mean[i]!]));
    theta = names.map((nm, i) => prev.get(nm) ?? mu[i]!);
  }
  theta = clamp(theta);
  let converged = p === 0;
  let iterations = 0;

  const optimise = (sg: number) => {
    let lambda = 1e-3;
    let phi = objective(theta, sg);
    for (let iter = 0; iter < MAX_ITER; iter++) {
      iterations++;
      const { A, b } = normalEquations(theta, sg);
      let accepted = false;
      for (let tries = 0; tries < 12; tries++) {
        const D = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) : v)));
        const L = cholesky(D);
        if (!L) {
          lambda *= 10;
          continue;
        }
        const delta = cholSolve(L, b);
        const next = clamp(theta.map((v, i) => v + delta[i]!));
        const phiNew = objective(next, sg);
        if (Number.isFinite(phiNew) && phiNew <= phi) {
          const move = Math.max(...next.map((v, i) => Math.abs(v - theta[i]!)));
          const gain = phi - phiNew;
          theta = next;
          phi = phiNew;
          lambda = Math.max(lambda / 3, 1e-9);
          accepted = true;
          if (move < 1e-6 || gain < 1e-10 * (1 + Math.abs(phi))) {
            converged = true;
            return;
          }
          break;
        }
        lambda *= 4;
      }
      if (!accepted) {
        converged = true; // no step improves the objective: at a (local) optimum
        return;
      }
    }
    converged = false;
  };

  let cov: number[][] = [];
  let rowsDiag: RowDiagnostic[] = [];

  if (p > 0) {
    optimise(sigma);
    const posterior = (sg: number) => {
      const { A, w, lin } = normalEquations(theta, sg);
      const L = cholesky(A);
      const C = L ? cholInverse(L) : A.map((_, i) => A.map((__, j) => (i === j ? 1 / (lam[i]! || 1) : 0)));
      return { C, w, lin };
    };
    let post = posterior(sigma);

    if (opts.estimateNoise && n >= 4) {
      for (let pass = 0; pass < 3; pass++) {
        let rss = 0;
        let trH = 0;
        rows.forEach((r, ri) => {
          const res = r.y - post.lin.f[ri]!;
          rss += r.q * post.w[ri]! * res * res;
          const ii = post.lin.gIdx[ri]!;
          const vv = post.lin.gVal[ri]!;
          let quad = 0;
          for (let a = 0; a < ii.length; a++) for (let bb = 0; bb < ii.length; bb++) quad += vv[a]! * vv[bb]! * post.C[ii[a]!]![ii[bb]!]!;
          trH += ((r.q * post.w[ri]!) / (sigma * sigma)) * quad;
        });
        const dof = Math.max(n - trH, 0.5);
        const next = Math.min(SIGMA_MAX, Math.max(SIGMA_MIN, Math.sqrt((NU0 * SIGMA0 * SIGMA0 + rss) / (NU0 + dof))));
        const change = Math.abs(next - sigma) / sigma;
        sigma = next;
        optimise(sigma);
        post = posterior(sigma);
        if (change < 0.03) break;
      }
    }
    cov = post.C;

    // ---- per-reading diagnostics (leverage -> leave-one-out error)
    rowsDiag = rows.map((r, ri) => {
      const res = r.y - post.lin.f[ri]!;
      const ii = post.lin.gIdx[ri]!;
      const vv = post.lin.gVal[ri]!;
      let quad = 0;
      for (let a = 0; a < ii.length; a++) for (let bb = 0; bb < ii.length; bb++) quad += vv[a]! * vv[bb]! * post.C[ii[a]!]![ii[bb]!]!;
      const h = Math.min(((r.q * post.w[ri]!) / (sigma * sigma)) * quad, 0.95);
      const loo = res / (1 - h);
      const z = (res * Math.sqrt(r.q)) / sigma;
      return {
        index: r.index,
        counterFt: r.counter,
        depthFt: Math.exp(r.y),
        predictedFt: Math.exp(post.lin.f[ri]!),
        errPct: (Math.exp(res) - 1) * 100,
        z,
        looErrPct: (Math.exp(loo) - 1) * 100,
        weight: post.w[ri]!,
        flagged: Math.abs(z) > 2.5 && n >= 4,
      };
    });
  }

  const dataRange =
    n === 0
      ? null
      : {
          speedMph: [Math.min(...rows.map((r) => r.cfg.speedMph)), Math.max(...rows.map((r) => r.cfg.speedMph))] as [number, number],
          counterFt: [Math.min(...rows.map((r) => r.counter)), Math.max(...rows.map((r) => r.counter))] as [number, number],
        };

  return {
    paramNames: names,
    mean: theta,
    cov,
    sigma,
    nObservations: n,
    skipped,
    rows: rowsDiag,
    dataRange,
    converged,
    iterations,
  };
}
