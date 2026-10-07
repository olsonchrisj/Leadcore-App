import { describe, expect, it } from "vitest";
import { fitModel } from "./fit";
import { logDepth, P } from "./model";
import { predictDepth, summarize } from "./predict";
import { baseCfg, crank, makeRng, simulate, spoonA, spoonB, truthGetter } from "./test-utils";
import type { Observation } from "./types";

// A "true world" whose line sinks 20% harder than the catalogue, with draggier spoons and a different leader effect.
const TRUTH: Record<string, number> = {
  [P.lnK("suffix-832")]: 0.19,
  [P.typeDrag("spoon")]: 0.25,
  [P.lureDrag("crank-1")]: -0.2,
  [P.lnDown]: -0.2,
  [P.lnLeader]: 0.15,
  [P.c1]: -0.08,
};
const truth = truthGetter(TRUTH);
const trueDepth = (cfg: ReturnType<typeof baseCfg>, c: number) => Math.exp(logDepth(cfg, c, truth));

describe("fitModel", () => {
  it("a warm start from the previous fit lands on the same answer, in fewer iterations", () => {
    const all = simulate(TRUTH, 30, 11, 0.04);
    const cold = fitModel(all, { estimateNoise: true });
    const previous = fitModel(all.slice(0, 29), { estimateNoise: true });
    const warm = fitModel(all, { estimateNoise: true, init: previous });
    expect(warm.paramNames).toEqual(cold.paramNames);
    cold.mean.forEach((v, i) => expect(Math.abs(warm.mean[i]! - v)).toBeLessThan(0.01));
    expect(Math.abs(warm.sigma - cold.sigma)).toBeLessThan(0.005);
    expect(warm.iterations).toBeLessThanOrEqual(cold.iterations);
  });

  it("ignores a warm start that knows nothing about the new parameters", () => {
    const a = simulate(TRUTH, 12, 21, 0.04, [spoonA]);
    const b = simulate(TRUTH, 12, 22, 0.04, [crank]);
    const prev = fitModel(a);
    const warm = fitModel([...a, ...b], { init: prev });
    const cold = fitModel([...a, ...b]);
    cold.mean.forEach((v, i) => expect(Math.abs(warm.mean[i]! - v)).toBeLessThan(0.02));
  });

  it("with no readings is just the catalogue", () => {
    const m = fitModel([]);
    expect(m.nObservations).toBe(0);
    expect(m.paramNames).toEqual([]);
    expect(m.dataRange).toBeNull();
    expect(m.sigma).toBeCloseTo(0.07, 6);
  });

  it("recovers the truth: held-out predictions land within a few percent", () => {
    const m = fitModel(simulate(TRUTH, 36, 1, 0.04), { estimateNoise: true });
    expect(m.converged).toBe(true);
    const probes = [
      baseCfg({ speedMph: 1.7 }),
      baseCfg({ speedMph: 2.6, lure: spoonB }),
      baseCfg({ speedMph: 2.2, lure: crank, leader: { material: "monofilament", lengthFt: 100 } }),
    ];
    for (const cfg of probes) for (const c of [90, 150, 240]) {
      const err = predictDepth(m, cfg, c).depthFt / trueDepth(cfg, c) - 1;
      expect(Math.abs(err)).toBeLessThan(0.07);
    }
  });

  it("beats the catalogue it started from", () => {
    const m = fitModel(simulate(TRUTH, 24, 2, 0.04));
    const cat = fitModel([]);
    const cfg = baseCfg({ speedMph: 2.4 });
    const errFit = Math.abs(predictDepth(m, cfg, 180).depthFt / trueDepth(cfg, 180) - 1);
    const errCat = Math.abs(predictDepth(cat, cfg, 180).depthFt / trueDepth(cfg, 180) - 1);
    expect(errFit).toBeLessThan(errCat / 2);
  });

  it("the 80% band is honest: roughly 80% of fresh readings fall inside", () => {
    let inside = 0;
    let total = 0;
    for (const seed of [11, 12, 13]) {
      const m = fitModel(simulate(TRUTH, 30, seed, 0.05), { estimateNoise: true });
      for (const o of simulate(TRUTH, 40, seed + 100, 0.05)) {
        const p = predictDepth(m, o, o.counterFt);
        total++;
        if (o.depthFt >= p.lowFt && o.depthFt <= p.highFt) inside++;
      }
    }
    expect(inside / total).toBeGreaterThan(0.68);
    expect(inside / total).toBeLessThan(0.95);
  });

  it("uncertainty shrinks as readings accumulate", () => {
    const cfg = baseCfg({ speedMph: 2.3, lure: spoonB });
    const few = predictDepth(fitModel(simulate(TRUTH, 5, 3, 0.04)), cfg, 150).sdLog;
    const many = predictDepth(fitModel(simulate(TRUTH, 40, 3, 0.04)), cfg, 150).sdLog;
    const none = predictDepth(fitModel([]), cfg, 150).sdLog;
    expect(many).toBeLessThan(few);
    expect(few).toBeLessThan(none);
  });

  it("estimates the noise level from the scatter", () => {
    const m = fitModel(simulate(TRUTH, 80, 5, 0.1), { estimateNoise: true });
    expect(m.sigma).toBeGreaterThan(0.075);
    expect(m.sigma).toBeLessThan(0.14);
    const quiet = fitModel(simulate(TRUTH, 80, 5, 0.02), { estimateNoise: true });
    expect(quiet.sigma).toBeLessThan(0.05);
  });

  it("shrugs off a mistyped reading and flags it", () => {
    const clean = simulate(TRUTH, 30, 6, 0.03);
    const dirty = clean.map((o, i) => (i === 4 ? { ...o, depthFt: o.depthFt * 2.2 } : i === 17 ? { ...o, depthFt: o.depthFt * 0.45 } : o));
    const good = fitModel(clean, { estimateNoise: true });
    const bad = fitModel(dirty, { estimateNoise: true });
    const cfg = baseCfg({ speedMph: 2.2 });
    const dev = Math.abs(predictDepth(bad, cfg, 160).depthFt / predictDepth(good, cfg, 160).depthFt - 1);
    expect(dev).toBeLessThan(0.06);
    const flagged = bad.rows.filter((r) => r.flagged).map((r) => r.index);
    expect(flagged).toContain(4);
    expect(flagged).toContain(17);
    expect(bad.rows.find((r) => r.index === 4)!.weight).toBeLessThan(0.7);
  });

  it("skips unusable readings with a reason and never throws", () => {
    const ok = simulate(TRUTH, 8, 7, 0.04);
    const junk: Observation[] = [
      { ...ok[0]!, depthFt: -3 },
      { ...ok[0]!, counterFt: 0 },
      { ...ok[0]!, speedMph: 0 },
      { ...ok[0]!, depthFt: NaN },
      { ...ok[0]!, counterFt: Infinity },
      { ...ok[0]!, quality: 0 },
      { ...ok[0]!, leader: undefined as never },
      null as never,
    ];
    const m = fitModel([...ok, ...junk]);
    expect(m.nObservations).toBe(8);
    expect(m.skipped.map((s) => s.index)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(m.skipped.every((s) => s.reason.length > 0)).toBe(true);
  });

  it("leave-one-out errors track a brute-force refit", () => {
    const data = simulate(TRUTH, 14, 8, 0.05);
    const m = fitModel(data, { sigma: 0.05 });
    for (const i of [0, 5, 9]) {
      const rest = data.filter((_, j) => j !== i);
      const left = fitModel(rest, { sigma: 0.05 });
      const p = predictDepth(left, data[i]!, data[i]!.counterFt).depthFt;
      const exact = (data[i]!.depthFt / p - 1) * 100;
      const approx = m.rows.find((r) => r.index === i)!.looErrPct;
      expect(Math.abs(approx - exact)).toBeLessThan(2.5);
    }
  });

  it("summarises the fit", () => {
    const s = summarize(fitModel(simulate(TRUTH, 30, 9, 0.05), { estimateNoise: true }));
    expect(s.n).toBe(30);
    expect(s.looRmsPct).toBeGreaterThan(s.rmsPct * 0.9);
    expect(s.noisePct).toBeGreaterThan(2);
    expect(s.noisePct).toBeLessThan(10);
  });

  it("warns when asked to extrapolate", () => {
    const m = fitModel(simulate(TRUTH, 12, 10, 0.04).map((o) => ({ ...o, speedMph: 2 + (o.speedMph - 2) * 0.2 })));
    expect(predictDepth(m, baseCfg({ speedMph: 3.2 }), 150).warnings.join(" ")).toMatch(/extrapolation/);
    expect(predictDepth(m, baseCfg({ speedMph: 2 }), 150).warnings.join(" ")).not.toMatch(/Speed is outside/);
  });

  it("stays fast with a season of readings", () => {
    const data = simulate(TRUTH, 160, 14, 0.05);
    const t0 = performance.now();
    fitModel(data, { estimateNoise: true });
    expect(performance.now() - t0).toBeLessThan(4000);
  });

  it("keeps rigs and lures separate when they truly differ", () => {
    const t2 = { ...TRUTH, [P.lureDrag("spoon-b")]: 0.6, [P.lureOff("spoon-a")]: -0.12 };
    const m = fitModel(simulate(t2, 60, 15, 0.03, [spoonA, spoonB]), { estimateNoise: true });
    const g2 = truthGetter(t2);
    for (const lure of [spoonA, spoonB]) {
      const cfg = baseCfg({ lure, speedMph: 2.1 });
      const err = predictDepth(m, cfg, 200).depthFt / Math.exp(logDepth(cfg, 200, g2)) - 1;
      expect(Math.abs(err)).toBeLessThan(0.06);
    }
  });
});
