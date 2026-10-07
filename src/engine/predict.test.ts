import { describe, expect, it } from "vitest";
import { fitModel } from "./fit";
import { NO_MULTS, physDepthFt } from "./model";
import { depthChart, predictDepth, referenceRate, solveCounter, suggestNextReading } from "./predict";
import { baseCfg, simulate, spoonA } from "./test-utils";

const prior = fitModel([]);

describe("predictDepth with the catalogue only", () => {
  it("is the physical model, with a symmetric-in-log band and honest warnings", () => {
    const cfg = baseCfg();
    const p = predictDepth(prior, cfg, 150);
    expect(p.depthFt).toBeCloseTo(physDepthFt(cfg, 150, NO_MULTS), 8);
    expect(p.highFt / p.depthFt).toBeCloseTo(p.depthFt / p.lowFt, 6);
    expect(p.warnings.join(" ")).toMatch(/No readings for this lure/);
    expect(predictDepth(prior, baseCfg({ attractor: { id: "f", type: "flasher" } }), 150).warnings.join(" ")).toMatch(/attractor/);
  });

  it("splits line out into leadcore and backing", () => {
    const p = predictDepth(prior, baseCfg(), 420);
    expect(p.leadcoreOutFt).toBe(300);
    expect(p.backingOutFt).toBe(120);
    expect(predictDepth(prior, baseCfg(), 0).depthFt).toBe(0);
  });
});

describe("solveCounter", () => {
  const m = fitModel(simulate({}, 20, 1, 0.04));
  const cfg = baseCfg({ speedMph: 2.2 });

  it("round-trips: the solved counter predicts the target depth", () => {
    for (const target of [20, 35, 50, 75]) {
      const s = solveCounter(m, cfg, target);
      expect(s.achievable).toBe(true);
      expect(predictDepth(m, cfg, s.counterFt).depthFt).toBeCloseTo(target, 1);
    }
  });

  it("brackets the answer: deeper-than-expected needs less line, shallower needs more", () => {
    const s = solveCounter(m, cfg, 40);
    expect(s.counterForHighFt).toBeLessThan(s.counterFt);
    expect(s.counterForLowFt).toBeGreaterThan(s.counterFt);
    expect(s.colors).toBeCloseTo(Math.min(s.counterFt, 300) / 30, 6);
  });

  it("uses backing for deep targets and says so when a target is out of reach", () => {
    const deep = solveCounter(m, cfg, 100);
    expect(deep.backingOutFt).toBeGreaterThan(0);
    const nope = solveCounter(m, cfg, 900);
    expect(nope.achievable).toBe(false);
    expect(nope.warnings.join(" ")).toMatch(/isn't reachable/);
  });

  it("flags targets shallower than the rig can run", () => {
    const s = solveCounter(m, cfg, 1);
    expect(s.tooShallow).toBe(true);
    expect(s.warnings.join(" ")).toMatch(/shorter leader|lighter lure/);
  });

  it("asks for more line when going faster, or when the lure is draggier", () => {
    const slow = solveCounter(m, baseCfg({ speedMph: 1.8 }), 40).counterFt;
    const fast = solveCounter(m, baseCfg({ speedMph: 2.8 }), 40).counterFt;
    expect(fast).toBeGreaterThan(slow);
    const withFlasher = solveCounter(m, baseCfg({ speedMph: 2.2, attractor: { id: "f", type: "flasher" } }), 40).counterFt;
    expect(withFlasher).toBeGreaterThan(solveCounter(m, cfg, 40).counterFt);
  });
});

describe("depthChart", () => {
  it("agrees with solveCounter", () => {
    const m = fitModel(simulate({}, 20, 2, 0.04));
    const speeds = [1.6, 2.0, 2.4, 2.8];
    const depths = [15, 30, 45, 60];
    const chart = depthChart(m, baseCfg(), speeds, depths);
    chart.forEach((row, si) =>
      row.forEach((cell, di) => {
        const s = solveCounter(m, baseCfg({ speedMph: speeds[si]! }), depths[di]!);
        expect(cell.ok).toBe(s.achievable && !s.tooShallow);
        if (cell.ok) expect(Math.abs(cell.counterFt - s.counterFt)).toBeLessThan(2.5);
      }),
    );
  });

  it("marks unreachable cells", () => {
    const chart = depthChart(prior, baseCfg(), [2.0], [1, 400]);
    expect(chart[0]![0]!.ok).toBe(false);
    expect(chart[0]![1]!.ok).toBe(false);
  });
});

describe("guidance helpers", () => {
  it("suggests logging where the model is least sure", () => {
    const m = fitModel(simulate({}, 16, 3, 0.04).map((o) => ({ ...o, speedMph: 1.9 + (o.speedMph % 0.3), counterFt: 90 + (o.counterFt % 60), lure: spoonA })));
    const next = suggestNextReading(m, baseCfg({ lure: spoonA }));
    const dr = m.dataRange!;
    const outside = next.speedMph < dr.speedMph[0] - 0.15 || next.speedMph > dr.speedMph[1] + 0.15 || next.counterFt < dr.counterFt[0] || next.counterFt > dr.counterFt[1];
    expect(outside).toBe(true);
    expect(next.uncertaintyPct).toBeGreaterThan(0);
  });

  it("keeps the suggestion inside the bounds it was given", () => {
    const m = fitModel(simulate({}, 8, 5, 0.04));
    const cfg = baseCfg({ lure: spoonA });
    const next = suggestNextReading(m, cfg, { speedMph: [2.2, 2.6], counterFt: [100, 180] });
    expect(next.speedMph).toBeGreaterThanOrEqual(2.2 - 1e-9);
    expect(next.speedMph).toBeLessThanOrEqual(2.6 + 1e-9);
    expect(next.counterFt).toBeGreaterThanOrEqual(100);
    expect(next.counterFt).toBeLessThanOrEqual(180);
    // and no other point on the same grid is more uncertain
    const sdAt = (s: number, c: number) => {
      const p = predictDepth(m, { ...cfg, speedMph: s }, c);
      return p.sdLog;
    };
    const chosen = sdAt(next.speedMph, next.counterFt);
    for (const s of [2.2, 2.3, 2.4, 2.5, 2.6]) for (const c of [100, 140, 180]) expect(sdAt(s, c)).toBeLessThanOrEqual(chosen * 1.1);
  });

  it("reports the learned feet-per-colour against the starting assumption", () => {
    const r0 = referenceRate(prior, "suffix-832");
    expect(r0.ftPerColor).toBeCloseTo(r0.nominalFtPerColor, 6);
    expect(r0.nominalFtPerColor).toBeCloseTo(7.0, 1);
  });
});
