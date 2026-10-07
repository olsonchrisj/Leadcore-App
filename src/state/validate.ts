/**
 * Everything that comes from outside the running code (localStorage, a restored
 * backup file) is untrusted: an old version of the app may have written a
 * different shape, a file may be hand-edited, storage may be corrupt. These
 * parsers keep what's valid, repair what's harmlessly missing, and count what
 * they had to drop, so a bad record can never crash the app or reach the fit.
 */
import { LINES, type AttractorType, type LeaderMaterial, type LureType } from "../engine";
import type { AttractorEntry, LureEntry } from "../data/lures";
import { ATTRACTOR_KIND_IDS, LEADER_KIND_IDS, LURE_KIND_IDS } from "../data/kinds";
import { DEFAULT_RIG, DEFAULT_SETTINGS, type Reading, type RigForm, type Settings } from "./types";
import { uid } from "./uid";

export interface Parsed<T> {
  value: T;
  /** Records that were unusable and left out. */
  dropped: number;
}

export const LIMITS = {
  counterFt: [0, 3000],
  depthFt: [0, 600],
  speedMph: [0, 15],
  leadcoreFt: [0, 3000],
  leaderFt: [-1, 300],
  testLb: [0, 400],
  weightOz: [0, 16],
  lengthIn: [0, 24],
  ratedDiveFt: [0, 100],
} as const;

type Range = readonly [number, number];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
/** Ids end up inside parameter names and map keys: keep them to plain URL-safe characters. */
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._-]{1,120}$/.test(v);
/** A finite number strictly inside (lo, hi]. */
const inRange = (v: unknown, [lo, hi]: Range): v is number => typeof v === "number" && Number.isFinite(v) && v > lo && v <= hi;
const optRange = (v: unknown, r: Range): number | undefined => (inRange(v, r) ? v : undefined);
const MAX_TEXT = 120;
const text = (v: unknown, fallback = ""): string => (isStr(v) ? v.trim().slice(0, MAX_TEXT) : fallback);

/** Only plain https links are kept: nothing from a file may become a javascript: or data: link. */
export const safeUrl = (v: unknown): string | undefined =>
  typeof v === "string" && /^https:\/\/[^\s"'<>]+$/i.test(v) && v.length <= 400 ? v : undefined;

const isoOrNow = (v: unknown): string => {
  if (typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v))) return v;
  return new Date().toISOString();
};

export function parseReading(raw: unknown): Reading | null {
  if (!isObj(raw)) return null;
  const counterFt = raw.counterFt;
  const depthFt = raw.depthFt;
  const speedMph = raw.speedMph;
  const leadcoreLengthFt = raw.leadcoreLengthFt;
  if (!inRange(counterFt, LIMITS.counterFt) || !inRange(depthFt, LIMITS.depthFt)) return null;
  if (!inRange(speedMph, LIMITS.speedMph) || !inRange(leadcoreLengthFt, LIMITS.leadcoreFt)) return null;

  const lure = raw.lure;
  if (!isObj(lure) || !isId(lure.id) || !isStr(lure.type) || !LURE_KIND_IDS.has(lure.type)) return null;
  const leader = raw.leader;
  if (!isObj(leader) || !inRange(leader.lengthFt, LIMITS.leaderFt)) return null;

  const attractor = raw.attractor;
  const att = isObj(attractor) && isId(attractor.id) && isStr(attractor.type) && ATTRACTOR_KIND_IDS.has(attractor.type)
    ? { id: attractor.id, type: attractor.type as AttractorType }
    : undefined;

  const line = typeof raw.lineId === "string" && raw.lineId in LINES ? raw.lineId : DEFAULT_RIG.lineId;
  const quality = optRange(raw.quality, [0, 10]);
  const reading: Reading = {
    id: isId(raw.id) ? raw.id : uid(),
    takenAt: isoOrNow(raw.takenAt),
    lineId: line,
    leadcoreLengthFt,
    speedMph,
    counterFt,
    depthFt,
    lure: {
      id: lure.id,
      type: lure.type as LureType,
      ...(optRange(lure.weightOz, LIMITS.weightOz) !== undefined && { weightOz: lure.weightOz as number }),
    },
    leader: {
      material: (isStr(leader.material) && LEADER_KIND_IDS.has(leader.material) ? leader.material : "other") as LeaderMaterial,
      lengthFt: leader.lengthFt,
      ...(optRange(leader.testLb, LIMITS.testLb) !== undefined && { testLb: leader.testLb as number }),
    },
    ...(att && { attractor: att }),
    ...(quality !== undefined && { quality }),
    ...(raw.excluded === true && { excluded: true }),
  };
  return reading;
}

/** Repairs duplicate ids rather than dropping the data behind them. */
export function parseReadings(raw: unknown): Parsed<Reading[]> {
  if (!Array.isArray(raw)) return { value: [], dropped: raw === undefined || raw === null ? 0 : 1 };
  const seen = new Set<string>();
  const out: Reading[] = [];
  let dropped = 0;
  for (const item of raw) {
    const r = parseReading(item);
    if (!r) {
      dropped++;
      continue;
    }
    if (seen.has(r.id)) r.id = uid();
    seen.add(r.id);
    out.push(r);
  }
  return { value: out, dropped };
}

export function parseCustomLures(raw: unknown): Parsed<LureEntry[]> {
  if (!Array.isArray(raw)) return { value: [], dropped: raw === undefined || raw === null ? 0 : 1 };
  const out: LureEntry[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const item of raw) {
    if (!isObj(item) || !isId(item.id) || !isStr(item.name) || !isStr(item.type) || !LURE_KIND_IDS.has(item.type) || seen.has(item.id)) {
      dropped++;
      continue;
    }
    seen.add(item.id);
    const dive = isObj(item.ratedDive) ? optRange(item.ratedDive.max, LIMITS.ratedDiveFt) : undefined;
    out.push({
      id: item.id,
      brand: text(item.brand, "Custom"),
      name: text(item.name),
      type: item.type as LureType,
      weightOz: optRange(item.weightOz, LIMITS.weightOz),
      lengthIn: optRange(item.lengthIn, LIMITS.lengthIn),
      ratedDive: dive !== undefined ? { max: dive } : undefined,
      mfrUrl: safeUrl(item.mfrUrl),
      custom: true,
    });
  }
  return { value: out, dropped };
}

export function parseCustomAtts(raw: unknown): Parsed<AttractorEntry[]> {
  if (!Array.isArray(raw)) return { value: [], dropped: raw === undefined || raw === null ? 0 : 1 };
  const out: AttractorEntry[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const item of raw) {
    if (!isObj(item) || !isId(item.id) || !isStr(item.name) || !isStr(item.type) || !ATTRACTOR_KIND_IDS.has(item.type) || seen.has(item.id)) {
      dropped++;
      continue;
    }
    seen.add(item.id);
    out.push({ id: item.id, brand: text(item.brand, "Custom"), name: text(item.name), type: item.type as AttractorType, custom: true });
  }
  return { value: out, dropped };
}

/** Field-by-field: one bad value falls back to its default, the rest survive. */
export function parseRig(raw: unknown, fallbackLureId: string): Parsed<RigForm> {
  const d: RigForm = { ...DEFAULT_RIG, lureId: fallbackLureId };
  if (!isObj(raw)) return { value: d, dropped: 0 };
  return {
    dropped: 0,
    value: {
      lineId: typeof raw.lineId === "string" && raw.lineId in LINES ? raw.lineId : d.lineId,
      leadcoreFt: optRange(raw.leadcoreFt, LIMITS.leadcoreFt) ?? d.leadcoreFt,
      speedMph: optRange(raw.speedMph, LIMITS.speedMph) ?? d.speedMph,
      leaderMaterial: (isStr(raw.leaderMaterial) && LEADER_KIND_IDS.has(raw.leaderMaterial) ? raw.leaderMaterial : d.leaderMaterial) as LeaderMaterial,
      leaderFt: optRange(raw.leaderFt, LIMITS.leaderFt) ?? d.leaderFt,
      leaderTestLb: optRange(raw.leaderTestLb, LIMITS.testLb) ?? null,
      lureId: isId(raw.lureId) ? raw.lureId : d.lureId,
      attractorId: raw.attractorId === "" || isId(raw.attractorId) ? (raw.attractorId as string) : d.attractorId,
      targetFt: optRange(raw.targetFt, LIMITS.depthFt) ?? d.targetFt,
    },
  };
}

export function parseSettings(raw: unknown): Parsed<Settings> {
  const d = DEFAULT_SETTINGS;
  if (!isObj(raw)) return { value: { ...d }, dropped: 0 };
  const count = raw.lastBackupCount;
  return {
    dropped: 0,
    value: {
      speedUnit: raw.speedUnit === "kn" || raw.speedUnit === "kmh" || raw.speedUnit === "mph" ? raw.speedUnit : d.speedUnit,
      lengthUnit: raw.lengthUnit === "m" || raw.lengthUnit === "ft" ? raw.lengthUnit : d.lengthUnit,
      theme: raw.theme === "dark" || raw.theme === "light" || raw.theme === "auto" ? raw.theme : d.theme,
      lastBackupAt: typeof raw.lastBackupAt === "string" && !Number.isNaN(Date.parse(raw.lastBackupAt)) ? raw.lastBackupAt : null,
      lastBackupCount: typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : 0,
    },
  };
}
