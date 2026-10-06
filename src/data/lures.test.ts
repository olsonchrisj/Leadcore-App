import { describe, expect, it } from "vitest";
import { ATTRACTORS, LURES } from "./lures";

describe("lure data", () => {
  it("has unique ids", () => {
    const ids = [...LURES, ...ATTRACTORS].map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("every spec'd entry is sane and sourced", () => {
    for (const l of LURES) {
      if (l.weightOz !== undefined) expect(l.weightOz).toBeGreaterThan(0.05);
      if (l.weightOz !== undefined) expect(l.weightOz).toBeLessThan(2);
      if (l.ratedDive) expect(l.ratedDive.max).toBeGreaterThan(l.ratedDive.min ?? 0);
      if (l.weightOz || l.ratedDive) expect(l.source).toMatch(/^https:\/\//);
    }
  });
});
