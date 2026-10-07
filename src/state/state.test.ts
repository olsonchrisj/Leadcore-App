import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LURES } from "../data/lures";
import { LURE_KINDS } from "../data/kinds";
import { LURE_TYPES } from "../engine";
import { BACKUP_VERSION, buildBackup, describeImport, mergeById, parseBackup } from "./backup";
import { allAppKeys, loadStored, type StoredSpec } from "./storage";
import { fmtLen, fmtNum, fmtSpeed, fromDisplay, parseDecimal, toDisplay, unitsFor } from "./units";
import { uid, uniqueId } from "./uid";
import {
  parseCustomAtts,
  parseCustomLures,
  parseReading,
  parseReadings,
  parseRig,
  parseSettings,
  safeUrl,
} from "./validate";
import { DEFAULT_SETTINGS, type Reading } from "./types";

/** A reading exactly as version 1 of the app wrote it to localStorage. */
const legacy = {
  id: "r1",
  takenAt: "2026-10-01T12:00:00.000Z",
  lineId: "suffix-832",
  leadcoreLengthFt: 300,
  speedMph: 2,
  lure: { id: "williams-wabler-w40", type: "spoon", weightOz: 0.25 },
  leader: { material: "fluorocarbon", lengthFt: 50 },
  counterFt: 150,
  depthFt: 33,
};

describe("kinds", () => {
  it("cover exactly the lure types the engine knows", () => {
    expect(new Set(LURE_KINDS.map((k) => k.id))).toEqual(new Set(Object.keys(LURE_TYPES)));
  });
  it("every catalogue lure has a known type", () => {
    const ids = new Set(LURE_KINDS.map((k) => k.id));
    for (const l of LURES) expect(ids.has(l.type)).toBe(true);
  });
});

describe("parseReading(s)", () => {
  it("accepts a reading as the old app stored it", () => {
    expect(parseReading(legacy)).toMatchObject({ id: "r1", counterFt: 150, depthFt: 33, lure: { id: "williams-wabler-w40", weightOz: 0.25 } });
  });
  it("drops junk without throwing", () => {
    const bad = [
      null,
      "x",
      42,
      [],
      {},
      { ...legacy, counterFt: -5 },
      { ...legacy, counterFt: 0 },
      { ...legacy, depthFt: "33" },
      { ...legacy, depthFt: null },
      { ...legacy, speedMph: 99 },
      { ...legacy, leadcoreLengthFt: 0 },
      { ...legacy, lure: null },
      { ...legacy, lure: { id: "x", type: "banana" } },
      { ...legacy, lure: { id: "has spaces", type: "spoon" } },
      { ...legacy, lure: { id: "a:b", type: "spoon" } },
      { ...legacy, leader: undefined },
      { ...legacy, leader: { material: "fluorocarbon", lengthFt: -3 } },
    ];
    const { value, dropped } = parseReadings([legacy, ...bad]);
    expect(value).toHaveLength(1);
    expect(dropped).toBe(bad.length);
  });
  it("repairs what is harmlessly missing", () => {
    const r = parseReading({ ...legacy, id: undefined, takenAt: "nonsense", leader: { material: "kevlar", lengthFt: 0 } })!;
    expect(r.id).toMatch(/[0-9a-f-]{36}/);
    expect(Number.isNaN(Date.parse(r.takenAt))).toBe(false);
    expect(r.leader).toEqual({ material: "other", lengthFt: 0 });
  });
  it("keeps duplicate ids apart instead of dropping data", () => {
    const { value, dropped } = parseReadings([legacy, { ...legacy }]);
    expect(dropped).toBe(0);
    expect(new Set(value.map((r) => r.id)).size).toBe(2);
  });
  it("treats a non-array as one dropped item, and nothing as nothing", () => {
    expect(parseReadings({ a: 1 })).toEqual({ value: [], dropped: 1 });
    expect(parseReadings(undefined)).toEqual({ value: [], dropped: 0 });
  });
  it("keeps the excluded flag and attractor", () => {
    const r = parseReading({ ...legacy, excluded: true, attractor: { id: "generic-flasher", type: "flasher" } })!;
    expect(r.excluded).toBe(true);
    expect(r.attractor).toEqual({ id: "generic-flasher", type: "flasher" });
  });
  it("ignores unknown fields", () => {
    expect(Object.keys(parseReading({ ...legacy, evil: "<script>" })!)).not.toContain("evil");
  });
});

describe("custom entries", () => {
  it("keeps good lures, drops bad ones, forces custom", () => {
    const { value, dropped } = parseCustomLures([
      { id: "a", brand: "Me", name: "Mine", type: "spoon", weightOz: 0.4, ratedDive: { max: 12 } },
      { id: "b", brand: "Me", name: "Bad", type: "nope" },
      { id: "a", brand: "Me", name: "Dup", type: "spoon" },
      { name: "no id", type: "spoon" },
      { id: "bad id", brand: "Me", name: "Spaces", type: "spoon" },
      { id: "a:b", brand: "Me", name: "Colon", type: "spoon" },
    ]);
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({ id: "a", custom: true, weightOz: 0.4, ratedDive: { max: 12 } });
    expect(dropped).toBe(5);
  });
  it("never lets a file plant a non-https link", () => {
    const [l] = parseCustomLures([{ id: "a", brand: "x", name: "y", type: "spoon", mfrUrl: "javascript:alert(1)" }]).value;
    expect(l!.mfrUrl).toBeUndefined();
    expect(safeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeUrl("http://example.com")).toBeUndefined();
    expect(safeUrl("data:text/html,hi")).toBeUndefined();
    expect(safeUrl('https://x.com/"onmouseover="alert(1)')).toBeUndefined();
  });
  it("parses attractors", () => {
    const { value, dropped } = parseCustomAtts([{ id: "f", brand: "B", name: "N", type: "flasher" }, { id: "g", name: "N", type: "zzz" }]);
    expect(value).toHaveLength(1);
    expect(dropped).toBe(1);
  });
});

describe("parseRig / parseSettings", () => {
  it("falls back field by field", () => {
    const { value } = parseRig({ speedMph: -1, leadcoreFt: 450, leaderMaterial: "braid", leaderFt: 0, lureId: "" }, "fallback");
    expect(value).toMatchObject({ speedMph: 2, leadcoreFt: 450, leaderMaterial: "braid", leaderFt: 0, lureId: "fallback", lineId: "suffix-832", leaderTestLb: null });
  });
  it("gives defaults for junk", () => {
    expect(parseRig("junk", "x").value.leadcoreFt).toBe(300);
    expect(parseSettings(undefined).value).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ speedUnit: "furlongs", theme: "light", lastBackupCount: -2 }).value).toMatchObject({ speedUnit: "mph", theme: "light", lastBackupCount: 0 });
  });
});

describe("backup", () => {
  const r = parseReading(legacy) as Reading;
  it("round-trips", () => {
    const file = buildBackup({ readings: [r], customLures: [], customAtts: [] }, new Date("2026-10-07T00:00:00Z"));
    expect(file.version).toBe(BACKUP_VERSION);
    const res = parseBackup(JSON.stringify(file));
    expect(res.ok && res.data.readings).toEqual([r]);
  });
  it("reads a version 1 file", () => {
    const res = parseBackup(JSON.stringify({ version: 1, readings: [legacy], customLures: [], customAtts: [] }));
    expect(res.ok && res.data.readings).toHaveLength(1);
  });
  it("refuses things that aren't backups, without applying anything", () => {
    for (const text of ["not json", "[]", "42", "{}", '{"app":"other","readings":[]}', '{"version":99,"readings":[]}']) {
      const res = parseBackup(text);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.length).toBeGreaterThan(10);
    }
  });
  it("counts unusable records", () => {
    const res = parseBackup(JSON.stringify({ readings: [legacy, { junk: true }], customLures: [{ id: "x" }] }));
    expect(res.ok && res.skipped).toBe(2);
  });
  it("merges by id, existing wins", () => {
    const a = { ...r, id: "a", depthFt: 10 };
    const b = { ...r, id: "b" };
    const m = mergeById([a], [{ ...a, depthFt: 99 }, b]);
    expect(m.merged.map((x) => x.id)).toEqual(["a", "b"]);
    expect(m.merged[0]!.depthFt).toBe(10);
    expect(m.added).toBe(1);
    expect(m.existing).toBe(1);
  });
  it("describes an import in plain words", () => {
    const empty = { merged: [], added: 0, existing: 0 };
    expect(describeImport({ readings: { ...empty, added: 1 }, lures: { ...empty, added: 2 }, atts: empty, skipped: 0 })).toBe("Restored 1 reading, 2 custom lures.");
    expect(describeImport({ readings: { ...empty, existing: 3 }, lures: empty, atts: empty, skipped: 1 })).toBe("Nothing new to restore. 3 already here. 1 unusable record skipped.");
  });
});

describe("units", () => {
  it("parses what people type", () => {
    expect(parseDecimal("2.5")).toBe(2.5);
    expect(parseDecimal("2,5")).toBe(2.5);
    expect(parseDecimal(" 30 ")).toBe(30);
    expect(parseDecimal(".5")).toBe(0.5);
    for (const bad of ["", " ", "abc", "1.2.3", "1e3", "-4", "2 ft", ".", ","]) expect(parseDecimal(bad)).toBeNull();
  });
  it("converts both ways", () => {
    const u = unitsFor("kmh", "m");
    expect(toDisplay(u.speed, 2)).toBeCloseTo(3.2187, 3);
    expect(fromDisplay(u.speed, toDisplay(u.speed, 2.3))).toBeCloseTo(2.3, 10);
    expect(toDisplay(u.length, 100)).toBeCloseTo(30.48, 6);
    expect(fromDisplay(u.length, 30.48)).toBeCloseTo(100, 6);
  });
  it("formats", () => {
    const ft = unitsFor("mph", "ft");
    const m = unitsFor("kn", "m");
    expect(fmtLen(ft, 112.4)).toBe("112");
    expect(fmtLen(ft, 31.26, 1)).toBe("31.3");
    expect(fmtLen(m, 100)).toBe("30.5"); // metres always keep a decimal
    expect(fmtSpeed(ft, 2)).toBe("2.0");
    expect(fmtSpeed(m, 2)).toBe("1.7");
    expect(fmtNum(NaN, 1)).toBe("–");
    expect(fmtNum(-0.04, 1)).toBe("0.0");
  });
});

describe("ids", () => {
  it("uid is unique and well formed", () => {
    const ids = new Set(Array.from({ length: 200 }, uid));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("uniqueId suffixes collisions", () => {
    expect(uniqueId("a", new Set())).toBe("a");
    expect(uniqueId("a", new Set(["a", "a-2"]))).toBe("a-3");
  });
});

describe("loadStored", () => {
  const store = new Map<string, string>();
  const fake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  const spec: StoredSpec<Reading[]> = { key: "lc.readings", parse: parseReadings };
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true });
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("returns the default when nothing is stored", () => {
    expect(loadStored(spec)).toEqual([]);
  });
  it("loads valid data untouched, with no rescue copy", () => {
    store.set("lc.readings", JSON.stringify([legacy]));
    expect(loadStored(spec)).toHaveLength(1);
    expect(allAppKeys()).toEqual(["lc.readings"]);
  });
  it("sanitises and keeps a copy of anything it had to drop", () => {
    const text = JSON.stringify([legacy, { broken: true }]);
    store.set("lc.readings", text);
    expect(loadStored(spec)).toHaveLength(1);
    const rescued = allAppKeys().filter((k) => k.includes(".rescued."));
    expect(rescued).toHaveLength(1);
    expect(store.get(rescued[0]!)).toBe(text);
  });
  it("survives corrupt JSON and keeps the text", () => {
    store.set("lc.readings", "{not json");
    expect(loadStored(spec)).toEqual([]);
    expect(allAppKeys().some((k) => k.includes(".rescued."))).toBe(true);
  });
  it("keeps at most three rescued copies, newest last", () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 6; i++) {
        vi.setSystemTime(1_700_000_000_000 + i * 1000);
        store.set("lc.readings", `{bad${i}`);
        loadStored(spec);
      }
    } finally {
      vi.useRealTimers();
    }
    const rescued = allAppKeys().filter((k) => k.includes(".rescued.")).sort();
    expect(rescued).toHaveLength(3);
    expect(rescued.map((k) => store.get(k))).toEqual(["{bad3", "{bad4", "{bad5"]);
  });
  it("survives storage that throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: { getItem: () => { throw new Error("denied"); } },
      configurable: true,
    });
    expect(loadStored(spec)).toEqual([]);
  });
});
