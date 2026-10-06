import { describe, expect, it } from "vitest";
import {
  fitModel,
  predictDepth,
  solveCounter,
  type LureRef,
  type Observation,
  type RigConfig,
} from "./index";

// Deterministic RNG + gaussian noise.
function rng(seed: number) {
  let s = seed >>> 0;
  const u = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

const spoonA: LureRef = { id: "spoon-a", type: "spoon", weightOz: 0.4 };
const spoonB: LureRef = { id: "spoon-b", type: "spoon", weightOz: 0.4 };
const base = (lure: LureRef, over: Partial<RigConfig> = {}): RigConfig => ({
  lineId: "suffix-832",
  leadcoreLengthFt: 300,
  speedMph: 2,
  lure,
  leader: { material: "fluorocarbon", lengthFt: 50, testLb: 12 },
  ...over,
});

/** Ground truth: ln(depth/L) with its own coefficients, unlike the priors. */
function truth(cfg: RigConfig, counter: number, lureOffset: number) {
  const L = Math.min(counter, cfg.leadcoreLengthFt);
  const back = Math.max(counter - cfg.leadcoreLengthFt, 0);
  const z =
    Math.log(0.2) -
    1.3 * Math.log(cfg.speedMph / 2) +
    lureOffset +
    0.0 * Math.log(L / 150) +
    0.05 * (cfg.leader.lengthFt / 50) * (cfg.leader.material === "fluorocarbon" ? 1 : 0) +
    0.02 * (back / 100);
  return L * Math.exp(z);
}

function sample(
  lure: LureRef,
  offset: number,
  n: number,
  seed: number,
  noise = 0.04,
  over: Partial<RigConfig> = {},
): Observation[] {
  const g = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const cfg = base(lure, { speedMph: 1.4 + (i % 8) * 0.25, ...over });
    const counter = 60 + ((i * 37) % 230);
    return {
      ...cfg,
      counterFt: counter,
      depthFt: truth(cfg, counter, offset) * Math.exp(noise * g()),
    };
  });
}

describe("priors only (no data)", () => {
  const model = fitModel([]);
  it("gives ~7 ft/color for Suffix 832 at 2 mph", () => {
    const d = predictDepth(model, base(spoonA, { leader: { material: "monofilament", lengthFt: 0 } }), 150);
    expect(d.depthFt).toBeGreaterThan(25);
    expect(d.depthFt).toBeLessThan(45);
    expect(d.highFt).toBeGreaterThan(d.lowFt);
    expect(d.warnings.join()).toMatch(/No data for lure/);
  });
});

describe("fit and prediction", () => {
  const data = sample(spoonA, 0, 30, 1);
  const model = fitModel(data);

  it("recovers the truth within a few percent", () => {
    for (const [speed, counter] of [[2, 150], [1.8, 200], [2.6, 100]] as const) {
      const cfg = base(spoonA, { speedMph: speed });
      const d = predictDepth(model, cfg, counter).depthFt;
      expect(Math.abs(d / truth(cfg, counter, 0) - 1)).toBeLessThan(0.06);
    }
  });

  it("is monotone: more line = deeper, faster = shallower", () => {
    let prev = 0;
    for (let c = 20; c <= 500; c += 20) {
      const d = predictDepth(model, base(spoonA), c).depthFt;
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
    let prevD = Infinity;
    for (let v = 1.2; v <= 3.4; v += 0.2) {
      const d = predictDepth(model, base(spoonA, { speedMph: v }), 150).depthFt;
      expect(d).toBeLessThan(prevD);
      prevD = d;
    }
  });

  it("prediction band narrows with data", () => {
    const few = fitModel(sample(spoonA, 0, 4, 2));
    const sdFew = predictDepth(few, base(spoonA), 150).sdLog;
    const sdMany = predictDepth(model, base(spoonA), 150).sdLog;
    expect(sdMany).toBeLessThan(sdFew);
  });
});

describe("solveCounter", () => {
  const model = fitModel(sample(spoonA, 0, 30, 3));
  it("round-trips: depth at the solved counter equals the target", () => {
    for (const target of [15, 30, 45]) {
      const s = solveCounter(model, base(spoonA), target);
      expect(s.achievable).toBe(true);
      expect(predictDepth(model, base(spoonA), s.counterFt).depthFt).toBeCloseTo(target, 2);
      expect(s.counterForHighFt).toBeLessThan(s.counterFt);
      expect(s.counterForLowFt).toBeGreaterThan(s.counterFt);
      expect(s.colors).toBeCloseTo(s.leadcoreOutFt / 30, 6);
    }
  });
  it("uses backing past the leadcore and reports unreachable depths", () => {
    const deep = solveCounter(model, base(spoonA), 80);
    if (deep.achievable) expect(deep.backingOutFt).toBeGreaterThanOrEqual(0);
    const nope = solveCounter(model, base(spoonA), 5000);
    expect(nope.achievable).toBe(false);
    expect(nope.warnings.join()).toMatch(/not reachable/);
  });
});

describe("per-lure curves", () => {
  // B runs 15% shallower than A.
  const data = [...sample(spoonA, 0, 20, 4), ...sample(spoonB, Math.log(0.85), 20, 5)];
  const model = fitModel(data);
  it("separates lures that behave differently", () => {
    const a = predictDepth(model, base(spoonA), 150).depthFt;
    const b = predictDepth(model, base(spoonB), 150).depthFt;
    expect(b / a).toBeGreaterThan(0.8);
    expect(b / a).toBeLessThan(0.9);
  });
  it("shrinks a lure with little data toward its type", () => {
    const sparse: LureRef = { id: "spoon-c", type: "spoon", weightOz: 0.4 };
    const one = sample(sparse, Math.log(0.7), 1, 6);
    const m = fitModel([...data, ...one]);
    const c = predictDepth(m, base(sparse), 150).depthFt;
    const typical = predictDepth(m, base(spoonA), 150).depthFt;
    const full = typical * 0.7;
    // Pulled below the type average but not all the way to its single reading.
    expect(c).toBeLessThan(typical);
    expect(c).toBeGreaterThan(full);
  });
});

describe("leader variable", () => {
  it("responds to leader length and material once data varies them", () => {
    const rows: Observation[] = [];
    for (const len of [10, 30, 60, 100]) {
      rows.push(...sample(spoonA, 0, 8, 10 + len, 0.03, { leader: { material: "fluorocarbon", lengthFt: len, testLb: 12 } }));
      rows.push(...sample(spoonA, 0, 8, 20 + len, 0.03, { leader: { material: "monofilament", lengthFt: len, testLb: 12 } }));
    }
    const m = fitModel(rows);
    const cfg = (material: "fluorocarbon" | "monofilament", lengthFt: number) =>
      base(spoonA, { leader: { material, lengthFt, testLb: 12 } });
    const fluoroLong = predictDepth(m, cfg("fluorocarbon", 100), 150).depthFt;
    const fluoroShort = predictDepth(m, cfg("fluorocarbon", 10), 150).depthFt;
    const monoLong = predictDepth(m, cfg("monofilament", 100), 150).depthFt;
    expect(fluoroLong).toBeGreaterThan(fluoroShort);
    expect(fluoroLong).toBeGreaterThan(monoLong);
  });
});

describe("physical constraints and bad input", () => {
  it("pins a non-physical speed response and flags nothing worse than a pin", () => {
    // Adversarial data: deeper at higher speed.
    const g = rng(9);
    const rows: Observation[] = Array.from({ length: 30 }, (_, i) => {
      const v = 1.5 + (i % 6) * 0.3;
      return { ...base(spoonA, { speedMph: v }), counterFt: 150, depthFt: 20 * (v / 2) * Math.exp(0.02 * g()) };
    });
    const m = fitModel(rows);
    expect(m.pinned).toContain("line:suffix-832:speed");
    const slow = predictDepth(m, base(spoonA, { speedMph: 1.5 }), 150).depthFt;
    const fast = predictDepth(m, base(spoonA, { speedMph: 3 }), 150).depthFt;
    expect(fast).toBeLessThan(slow);
  });

  it("skips invalid observations with reasons", () => {
    const ok = sample(spoonA, 0, 3, 7);
    const m = fitModel([
      ...ok,
      { ...ok[0]!, depthFt: -4 },
      { ...ok[0]!, counterFt: 0 },
      { ...ok[0]!, speedMph: 0 },
      { ...ok[0]!, quality: 0 },
    ]);
    expect(m.nObservations).toBe(3);
    expect(m.skipped.map((s) => s.index)).toEqual([3, 4, 5, 6]);
  });

  it("estimateNoise tracks the true scatter", () => {
    const m = fitModel(sample(spoonA, 0, 60, 8, 0.1), { estimateNoise: true });
    expect(m.sigma).toBeGreaterThan(0.06);
    expect(m.sigma).toBeLessThan(0.16);
  });
});
