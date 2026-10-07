import { describe, expect, it } from "vitest";
import { ATTRACTORS, LURES, compareLures, lureFamily } from "./lures";

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
      if (l.weightOz || l.ratedDive) expect(l.mfrUrl ?? l.source).toMatch(/^https:\/\//);
    }
  });
  it("sorts each model's sizes from small to large", () => {
    expect(lureFamily("Little Cleo 1-1/4 oz")).toBe("Little Cleo");
    expect(lureFamily("Lunker Grub 3 in")).toBe("Lunker Grub");
    expect(lureFamily("Ripshad 200")).toBe("Ripshad 200");
    const kast = LURES.filter((l) => l.brand === "Acme" && lureFamily(l.name) === "Kastmaster").sort(compareLures);
    expect(kast.map((l) => l.weightOz)).toEqual([...kast.map((l) => l.weightOz)].sort((a, b) => a! - b!));
    expect(kast[0]!.name).toBe("Kastmaster 1/12 oz");
  });
  it("includes the Acme and Kalin's lines", () => {
    expect(LURES.filter((l) => l.brand === "Acme").length).toBeGreaterThanOrEqual(25);
    expect(LURES.filter((l) => l.brand === "Kalin's").length).toBeGreaterThanOrEqual(10);
  });
});
