import { logDepth, type Getter } from "./model";
import type { LureRef, Observation, RigConfig } from "./types";

/** Small deterministic RNG (mulberry32) + Box–Muller normal. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
  return { u, normal };
}

export const spoonA: LureRef = { id: "spoon-a", type: "spoon", weightOz: 0.4 };
export const spoonB: LureRef = { id: "spoon-b", type: "spoon", weightOz: 0.75 };
export const crank: LureRef = { id: "crank-1", type: "crankbait", ratedDiveFt: 12 };

export const baseCfg = (over: Partial<RigConfig> = {}): RigConfig => ({
  lineId: "suffix-832",
  leadcoreLengthFt: 300,
  speedMph: 2,
  lure: spoonA,
  leader: { material: "fluorocarbon", lengthFt: 50 },
  ...over,
});

export const truthGetter = (truth: Record<string, number>): Getter => (name) => truth[name] ?? 0;

/** Readings generated from a known "true" parameter set plus multiplicative noise. */
export function simulate(truth: Record<string, number>, n: number, seed: number, noise = 0.04, lures: LureRef[] = [spoonA, spoonB, crank]): Observation[] {
  const { u, normal } = makeRng(seed);
  const get = truthGetter(truth);
  return Array.from({ length: n }, (_, i) => {
    const cfg = baseCfg({
      speedMph: Math.round((1.4 + u() * 1.6) * 10) / 10,
      lure: lures[i % lures.length]!,
      leader: i % 3 === 0 ? { material: "monofilament", lengthFt: 100 } : { material: "fluorocarbon", lengthFt: 50 },
      attractor: i % 7 === 3 ? { id: "flash-1", type: "flasher" } : undefined,
    });
    const counterFt = Math.round(45 + u() * 255);
    const depthFt = Math.exp(logDepth(cfg, counterFt, get) + noise * normal());
    return { ...cfg, counterFt, depthFt };
  });
}
