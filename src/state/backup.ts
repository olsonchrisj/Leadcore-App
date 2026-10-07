import type { AttractorEntry, LureEntry } from "../data/lures";
import type { Reading } from "./types";
import { parseCustomAtts, parseCustomLures, parseReadings } from "./validate";

export const BACKUP_APP = "leadcore-calculator";
export const BACKUP_VERSION = 2;

export interface BackupData {
  readings: Reading[];
  customLures: LureEntry[];
  customAtts: AttractorEntry[];
}

export interface BackupFile extends BackupData {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
}

export function buildBackup(data: BackupData, now = new Date()): BackupFile {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), ...data };
}

export type ImportResult =
  | { ok: true; data: BackupData; skipped: number }
  | { ok: false; error: string };

/**
 * Reads a backup file's text. Nothing is applied here: the caller gets either
 * a fully validated payload or an error, so a bad file can never half-restore.
 * Files from version 1 of the app (no `app` field) are accepted.
 */
export function parseBackup(fileText: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(fileText);
  } catch {
    return { ok: false, error: "That file isn't a backup (it isn't valid JSON)." };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "That file doesn't look like a Leadcore backup." };
  }
  const o = raw as Record<string, unknown>;
  if (o.app !== undefined && o.app !== BACKUP_APP) {
    return { ok: false, error: "That file is from a different app." };
  }
  if (typeof o.version === "number" && o.version > BACKUP_VERSION) {
    return { ok: false, error: "That backup is from a newer version of the app. Update the app and try again." };
  }
  if (!("readings" in o) && !("customLures" in o) && !("customAtts" in o)) {
    return { ok: false, error: "That file doesn't contain any readings or lures." };
  }
  const readings = parseReadings(o.readings);
  const lures = parseCustomLures(o.customLures);
  const atts = parseCustomAtts(o.customAtts);
  return {
    ok: true,
    data: { readings: readings.value, customLures: lures.value, customAtts: atts.value },
    skipped: readings.dropped + lures.dropped + atts.dropped,
  };
}

export interface Merged<T> {
  merged: T[];
  added: number;
  /** Incoming records whose id was already present (kept as they are here). */
  existing: number;
}

/** Existing records win; incoming ones are appended when their id is new. */
export function mergeById<T extends { id: string }>(current: readonly T[], incoming: readonly T[]): Merged<T> {
  const ids = new Set(current.map((x) => x.id));
  const fresh: T[] = [];
  let existing = 0;
  for (const x of incoming) {
    if (ids.has(x.id)) existing++;
    else {
      ids.add(x.id);
      fresh.push(x);
    }
  }
  return { merged: [...current, ...fresh], added: fresh.length, existing };
}

export function describeImport(r: { readings: Merged<Reading>; lures: Merged<LureEntry>; atts: Merged<AttractorEntry>; skipped: number }): string {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const added = [
    r.readings.added && plural(r.readings.added, "reading"),
    r.lures.added && plural(r.lures.added, "custom lure"),
    r.atts.added && plural(r.atts.added, "custom attractor"),
  ].filter(Boolean);
  const already = r.readings.existing + r.lures.existing + r.atts.existing;
  const parts = [added.length ? `Restored ${added.join(", ")}.` : "Nothing new to restore."];
  if (already) parts.push(`${already} already here.`);
  if (r.skipped) parts.push(`${r.skipped} unusable record${r.skipped === 1 ? "" : "s"} skipped.`);
  return parts.join(" ");
}
