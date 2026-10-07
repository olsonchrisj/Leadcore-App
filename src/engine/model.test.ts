import { describe, expect, it } from "vitest";
import { P, NO_MULTS, discTerms, logDepth, logDepthGrad, lureCda, lureDiveFraction, paramNamesFor, physDepthFt } from "./model";
import { baseCfg, crank, makeRng, spoonA, spoonB, truthGetter } from "./test-utils";
import type { RigConfig } from "./types";

const depth = (cfg: RigConfig, c: number) => physDepthFt(cfg, c, NO_MULTS);

describe("catalogue calibration", () => {
  it("reference rig reproduces the rule-of-thumb feet per colour at 2 mph", () => {
    const ref = { id: "ref", type: "spoon" as const, weightOz: 0.35 };
    expect(depth(baseCfg({ lure: ref }), 300) / 10).toBeCloseTo(7.0, 1); //                       Suffix 832
    expect(depth(baseCfg({ lure: ref, lineId: "generic-leadcore" }), 300) / 10).toBeCloseTo(5.2, 1); // traditional
  });

  it("hard baits on thin line follow the scanned dive curves to within the fit's accuracy", () => {
    // Salmo Hornet H4 / H6, 10 lb braid, 2 mph: depth at 20, 40, 60, 100 ft of line (read off the chart)
    const run = (R: number, L: number) =>
      depth(baseCfg({ lure: { id: "h", type: "crankbait", ratedDiveFt: R }, leader: { material: "braid", lengthFt: L, testLb: 10 } }), 0.001);
    const cases: [number, number, number][] = [[10.5, 40, 7.7], [10.5, 60, 8.9], [19.5, 40, 12], [19.5, 60, 15], [19.5, 100, 18.7]];
    for (const [R, L, chart] of cases) expect(Math.abs(Math.log(run(R, L) / chart))).toBeLessThan(0.35);
    // and a deeper-rated bait runs deeper at every length
    for (const L of [20, 60, 100]) expect(run(19.5, L)).toBeGreaterThan(run(10.5, L));
  });

  it("matches the published rule-of-thumb examples it was anchored on", () => {
    const shadRap5 = { id: "sr5", type: "crankbait" as const, ratedDiveFt: 8, weightOz: 0.2, lengthIn: 2 };
    const trad = (counter: number) =>
      depth(baseCfg({ lineId: "generic-leadcore", lure: shadRap5, leader: { material: "monofilament", lengthFt: 50, testLb: 10 } }), counter);
    // "a #5 Shad Rap reaches an additional 8 ft on 50 ft of 10 lb mono"
    expect(trad(0.5)).toBeGreaterThan(6);
    expect(trad(0.5)).toBeLessThan(11);
    // "3 colours of leadcore get you 15 ft, the lure another 8": about 23 ft, loosely additive
    expect(trad(90)).toBeGreaterThan(18);
    expect(trad(90)).toBeLessThan(27);
    // a long traditional-leadcore set lands in the 5–6 ft per colour range quoted for 2 mph
    expect(trad(300) / 10).toBeGreaterThan(4.5);
    expect(trad(300) / 10).toBeLessThan(6.5);
  });
});

describe("physical behaviour", () => {
  it("depth rises with line out, including onto the backing", () => {
    let prev = 0;
    for (let c = 30; c <= 600; c += 30) {
      const d = depth(baseCfg(), c);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it("falls with speed, roughly as 1/speed for a long line", () => {
    let prev = Infinity;
    for (let s = 1.2; s <= 3.6; s += 0.3) {
      const d = depth(baseCfg({ speedMph: s }), 300);
      expect(d).toBeLessThan(prev);
      prev = d;
    }
    const e = Math.log(depth(baseCfg({ speedMph: 3 }), 300) / depth(baseCfg({ speedMph: 2 }), 300)) / Math.log(1.5);
    expect(e).toBeGreaterThan(-1.4);
    expect(e).toBeLessThan(-0.8);
  });

  it("backing keeps sinking at about the leadcore's end angle (not a token amount)", () => {
    const slope = (depth(baseCfg(), 400) - depth(baseCfg(), 300)) / 100;
    expect(slope).toBeGreaterThan(0.1);
    expect(slope).toBeLessThan(0.25);
  });

  it("a longer or denser leader lets the lure run deeper, a flasher or dodger makes it shallower", () => {
    const fl = (len: number, material: RigConfig["leader"]["material"] = "fluorocarbon") => depth(baseCfg({ leader: { material, lengthFt: len } }), 150);
    expect(fl(100)).toBeGreaterThan(fl(50));
    expect(fl(50)).toBeGreaterThan(fl(0));
    expect(fl(100)).toBeGreaterThan(fl(100, "monofilament"));
    const plain = depth(baseCfg(), 150);
    expect(depth(baseCfg({ attractor: { id: "f", type: "flasher" } }), 150)).toBeLessThan(plain);
    expect(depth(baseCfg({ attractor: { id: "d", type: "dodger" } }), 150)).toBeLessThan(plain);
    expect(depth(baseCfg({ attractor: { id: "f", type: "flasher" } }), 150)).toBeLessThan(depth(baseCfg({ attractor: { id: "d", type: "dodger" } }), 150));
  });

  it("heavier lures run deeper; bigger-billed crankbaits drag more", () => {
    expect(depth(baseCfg({ lure: spoonB }), 150)).toBeGreaterThan(depth(baseCfg({ lure: spoonA }), 150));
    expect(lureCda({ ...crank, ratedDiveFt: 30 })).toBeGreaterThan(lureCda({ ...crank, ratedDiveFt: 8 }));
    expect(lureCda({ id: "x", type: "crankbait" })).toBeGreaterThan(0);
    // a soft plastic without a weight is sized by its length; a known weight still takes precedence
    expect(lureCda({ id: "g5", type: "softbait", lengthIn: 5 })).toBeGreaterThan(lureCda({ id: "g2", type: "softbait", lengthIn: 2 }));
    expect(lureCda({ id: "g", type: "softbait", lengthIn: 5, weightOz: 0.35 })).toBeCloseTo(lureCda({ id: "g", type: "softbait", weightOz: 0.35 }), 12);
  });

  it("a deeper-rated crankbait lifts its line more steeply, so it runs deeper on a short line", () => {
    const shallow = { id: "c4", type: "crankbait" as const, ratedDiveFt: 4 };
    const deep = { id: "c20", type: "crankbait" as const, ratedDiveFt: 20 };
    expect(lureDiveFraction(deep)).toBeGreaterThan(lureDiveFraction(shallow));
    expect(lureDiveFraction({ id: "x", type: "spoon" })).toBe(0);
    expect(lureDiveFraction({ id: "x", type: "crankbait", ratedDiveFt: 500 })).toBeLessThanOrEqual(0.4);
    const run = (lure: typeof deep) => depth(baseCfg({ lure, leader: { material: "monofilament", lengthFt: 50 } }), 0.5);
    expect(run(deep)).toBeGreaterThan(run(shallow));
  });

  it("copes with edge cases", () => {
    expect(depth(baseCfg({ leader: { material: "fluorocarbon", lengthFt: 0 } }), 150)).toBeGreaterThan(0);
    // with no leadcore out only the leader and lure are in the water: shallow, but not nothing
    expect(depth(baseCfg(), 0)).toBeGreaterThan(0);
    expect(depth(baseCfg(), 0)).toBeLessThan(depth(baseCfg(), 30));
    expect(Number.isFinite(depth(baseCfg({ speedMph: 0.3 }), 300))).toBe(true);
    expect(Number.isFinite(depth(baseCfg({ speedMph: 6 }), 300))).toBe(true);
    expect(depth(baseCfg({ lineId: "not-a-real-line" }), 150)).toBeGreaterThan(0);
  });
});

describe("parameters and gradients", () => {
  const cfgs: RigConfig[] = [
    baseCfg(),
    baseCfg({ attractor: { id: "f1", type: "flasher" }, rigId: "rig-1" }),
    baseCfg({ lure: crank, leader: { material: "monofilament", lengthFt: 0 } }),
  ];

  it("paramNamesFor lists exactly the parameters the gradient touches", () => {
    for (const cfg of cfgs) {
      const names = paramNamesFor(cfg).sort();
      const grad = [...logDepthGrad(cfg, 180, () => 0).grad.keys()].sort();
      expect(names).toEqual(grad);
    }
  });

  it("gradients match central finite differences", () => {
    const { u } = makeRng(4);
    for (const cfg of cfgs) {
      const theta: Record<string, number> = {};
      for (const n of paramNamesFor(cfg)) theta[n] = (u() - 0.5) * 0.3;
      const get = truthGetter(theta);
      const { grad } = logDepthGrad(cfg, 180, get);
      // lure-level and type-level drag enter only through their sum, so the type and lure gradients are equal
      for (const name of paramNamesFor(cfg)) {
        const h = 1e-4;
        const up = logDepth(cfg, 180, (n) => (n === name ? (theta[n] ?? 0) + h : get(n)));
        const dn = logDepth(cfg, 180, (n) => (n === name ? (theta[n] ?? 0) - h : get(n)));
        const fd = (up - dn) / (2 * h);
        expect(grad.get(name)!).toBeCloseTo(fd, 3);
      }
    }
  });

  it("discrepancy terms act as documented", () => {
    const cfg = baseCfg({ speedMph: 3 });
    const a = logDepth(cfg, 150, () => 0);
    expect(logDepth(cfg, 150, (n) => (n === P.c0 ? 0.1 : 0))).toBeCloseTo(a + 0.1, 10);
    expect(logDepth(cfg, 150, (n) => (n === P.c1 ? -0.2 : 0))).toBeCloseTo(a - 0.2 * Math.log(3 / 2), 10);
    expect(logDepth(cfg, 150, (n) => (n === P.c2 ? 0.1 : 0))).toBeCloseTo(a + 0.1 * Math.log(1), 10); // 150 ft is the reference
    expect(discTerms(baseCfg({ rigId: "r" }), 100).some(([n]) => n === P.rig("r"))).toBe(true);
  });

  it("only lures with a lip have bill-lift parameters, and a stronger lift runs deeper", () => {
    expect(paramNamesFor(baseCfg()).some((n) => n.endsWith("lnDive"))).toBe(false);
    const names = paramNamesFor(baseCfg({ lure: crank }));
    expect(names).toContain(P.typeDive("crankbait"));
    expect(names).toContain(P.lureDive("crank-1"));
    const cfg = baseCfg({ lure: crank, leader: { material: "monofilament", lengthFt: 100 } });
    const base = logDepth(cfg, 100, () => 0);
    expect(logDepth(cfg, 100, (n) => (n === P.typeDive("crankbait") ? 0.4 : 0))).toBeGreaterThan(base);
    expect(logDepth(cfg, 100, (n) => (n === P.lureDive("crank-1") ? -0.4 : 0))).toBeLessThan(base);
    // the type-level and lure-level multipliers enter only through their sum
    expect(logDepth(cfg, 100, (n) => (n === P.typeDive("crankbait") ? 0.2 : n === P.lureDive("crank-1") ? 0.1 : 0))).toBeCloseTo(
      logDepth(cfg, 100, (n) => (n === P.typeDive("crankbait") ? 0.3 : 0)),
      10,
    );
  });

  it("lure drag multiplier lowers depth, lure downforce multiplier raises it", () => {
    const base = logDepth(baseCfg(), 150, () => 0);
    expect(logDepth(baseCfg(), 150, (n) => (n === P.lureDrag("spoon-a") ? 0.5 : 0))).toBeLessThan(base);
    expect(logDepth(baseCfg(), 150, (n) => (n === P.lnDown ? 0.5 : 0))).toBeGreaterThan(base);
  });
});
