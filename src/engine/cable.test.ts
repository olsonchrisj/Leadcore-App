import { describe, expect, it } from "vitest";
import { RHO_W, kFromSlope, solveCable, terminalSin, type CableSegment } from "./cable";

const seg = (over: Partial<CableSegment> = {}): CableSegment => ({ length: 90, w: 0.02, d: 0.001, cdn: 1.2, cft: 0.025, ...over });

describe("solveCable: exact limits", () => {
  it("matches the catenary when there is no drag or friction", () => {
    for (const [H, w, L] of [[2, 0.03, 60], [5, 0.05, 150], [0.5, 0.02, 40]] as const) {
      const r = solveCable(1, [seg({ length: L, w, cdn: 0, cft: 0 })], { drag: H, down: 0 });
      const a = H / w;
      const exact = a * (Math.sqrt(1 + (L / a) ** 2) - 1);
      expect(Math.abs(r.depth - exact) / exact).toBeLessThan(1e-6);
    }
  });

  it("hangs straight down with no flow, tension = pull + weight", () => {
    const r = solveCable(1e-4, [seg({ length: 30, w: 0.04, cdn: 0, cft: 0 })], { drag: 0, down: 0.3 });
    expect(r.depth).toBeGreaterThan(29.99);
    expect(r.towTension).toBeCloseTo(0.3 + 0.04 * 30, 2);
  });

  it("stays level when the line is weightless and the body only pulls aft", () => {
    const r = solveCable(1, [seg({ w: 0 })], { drag: 1, down: 0 });
    expect(Math.abs(r.depth)).toBeLessThan(1e-6);
  });

  it("settles to the terminal slope sin²θ/cosθ = (K/U)² on a long line", () => {
    const K = 0.21;
    const w = K * K * 0.5 * RHO_W * 1.2 * 0.001;
    for (const U of [0.7, 1.0, 1.4]) {
      const L = 1500;
      const r = solveCable(U, [seg({ length: L, w })], { drag: 0.3, down: 0.1 });
      expect(r.depth / L).toBeCloseTo(terminalSin(K, U), 2);
    }
  });

  it("kFromSlope inverts terminalSin", () => {
    for (const s of [0.05, 0.15, 0.3, 0.6]) expect(terminalSin(kFromSlope(s, 1.1), 1.1)).toBeCloseTo(s, 6);
  });
});

describe("solveCable: numerics", () => {
  const stack = (): CableSegment[] => [
    seg({ length: 15, w: 2e-4, d: 3e-4, cft: 0.012 }),
    seg({ length: 91, w: 0.0204 }),
    seg({ length: 30, w: 1e-4, d: 2e-4 }),
  ];

  it("is converged in step size", () => {
    const base = solveCable(1.0, stack(), { drag: 0.4, down: 0.12 });
    const fine = solveCable(1.0, stack(), { drag: 0.4, down: 0.12 }, { stepScale: 0.25 });
    expect(Math.abs(base.depth - fine.depth) / fine.depth).toBeLessThan(1e-4);
  });

  it("agrees with a refined solve across random, plausible conditions", () => {
    let s = 12345;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 60; i++) {
      const U = 0.35 + rnd() * 2.1;
      const segs = [
        seg({ length: rnd() * 40, w: (rnd() - 0.2) * 1e-3, d: 1.5e-4 + rnd() * 4e-4, cft: 0.012 }),
        seg({ length: 5 + rnd() * 190, w: 0.004 + rnd() * 0.04, d: 8e-4 + rnd() * 1e-3 }),
        seg({ length: rnd() * 90, w: (rnd() - 0.3) * 1e-3, d: 1.5e-4 + rnd() * 2e-4 }),
      ];
      const end = { drag: 0.03 + rnd() * 3, down: -0.1 + rnd() * 1.2 };
      const a = solveCable(U, segs, end);
      const b = solveCable(U, segs, end, { stepScale: 0.2 });
      expect(Number.isFinite(a.depth)).toBe(true);
      expect(Math.abs(a.depth - b.depth)).toBeLessThan(2e-3 * Math.max(Math.abs(b.depth), 1));
    }
  });

  it("is smooth enough for finite-difference derivatives", () => {
    const f = (K: number) => solveCable(1, [seg({ length: 91, w: K * K * 0.5 * RHO_W * 1.2 * 0.001 })], { drag: 0.4, down: 0.12 }).depth;
    const d = (h: number) => (Math.log(f(0.21 * Math.exp(h))) - Math.log(f(0.21))) / h;
    expect(Math.abs(d(1e-3) - d(1e-5))).toBeLessThan(1e-3);
  });

  it("is monotone: deeper with more line or weight, shallower when faster or draggier", () => {
    const run = (L: number, w: number, U: number, drag: number) => solveCable(U, [seg({ length: L, w })], { drag, down: 0.1 }).depth;
    expect(run(100, 0.02, 1, 0.3)).toBeGreaterThan(run(60, 0.02, 1, 0.3));
    expect(run(80, 0.03, 1, 0.3)).toBeGreaterThan(run(80, 0.02, 1, 0.3));
    expect(run(80, 0.02, 1.4, 0.3)).toBeLessThan(run(80, 0.02, 1, 0.3));
    expect(run(80, 0.02, 1, 1.5)).toBeLessThan(run(80, 0.02, 1, 0.3));
  });

  it("handles empty and zero-length input", () => {
    expect(solveCable(1, [], { drag: 0.2, down: 0.1 }).depth).toBe(0);
    expect(solveCable(1, [seg({ length: 0 })], { drag: 0.2, down: 0.1 }).depth).toBe(0);
  });

  it("is fast enough to fit with", () => {
    const t0 = performance.now();
    for (let i = 0; i < 400; i++) solveCable(1, [seg({ length: 91 })], { drag: 0.3, down: 0.1 });
    expect((performance.now() - t0) / 400).toBeLessThan(0.5); // ms per solve
  });
});
