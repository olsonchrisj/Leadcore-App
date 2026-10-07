import type { LureRef, Observation, RowDiagnostic } from "../engine";
import type { LureEntry } from "../data/lures";
import type { Reading } from "./types";

export const lureRef = (l: LureEntry): LureRef => ({
  id: l.id,
  type: l.type,
  ...(l.weightOz !== undefined && { weightOz: l.weightOz }),
  ...(l.lengthIn !== undefined && { lengthIn: l.lengthIn }),
  ...(l.ratedDive && { ratedDiveFt: l.ratedDive.max }),
});

/**
 * A reading as the engine should see it. Lure specs come from the catalogue as
 * it is now, not as it was when the reading was logged, so a corrected weight or
 * a newly found rated dive improves old readings too. A lure that's no longer
 * in the catalogue (a deleted custom one) falls back to what the reading stored.
 */
export function toObservation(r: Reading, lureById: ReadonlyMap<string, LureEntry>): Observation {
  const { excluded: _excluded, ...rest } = r;
  const l = lureById.get(r.lure.id);
  return l ? { ...rest, lure: lureRef(l) } : rest;
}

export interface FitInputs {
  observations: Observation[];
  /** Reading id for each observation (same order). */
  ids: string[];
}

export function fitInputs(readings: readonly Reading[], lureById: ReadonlyMap<string, LureEntry>): FitInputs {
  const observations: Observation[] = [];
  const ids: string[] = [];
  for (const r of readings) {
    if (r.excluded) continue;
    observations.push(toObservation(r, lureById));
    ids.push(r.id);
  }
  return { observations, ids };
}

/** Per-reading fit diagnostics keyed by reading id (excluded readings have none). */
export function diagnosticsById(rows: readonly RowDiagnostic[], ids: readonly string[]): Map<string, RowDiagnostic> {
  const out = new Map<string, RowDiagnostic>();
  for (const row of rows) {
    const id = ids[row.index];
    if (id !== undefined) out.set(id, row);
  }
  return out;
}

const DAY = 86_400_000;

/** "today", "yesterday", "5 days ago", or the date. */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "never";
  const days = Math.floor((now - t) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 45) return `${days} days ago`;
  return new Date(t).toISOString().slice(0, 10);
}
