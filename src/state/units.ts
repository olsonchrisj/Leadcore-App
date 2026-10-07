import { KMH_PER_MPH, KNOTS_PER_MPH } from "../engine";
import type { LengthUnit, SpeedUnit } from "./types";

/**
 * The app stores and computes in feet and mph. Display units are a presentation
 * layer: values are converted when they're shown and when they're typed in.
 */
export interface UnitDef {
  label: string;
  /** Display units per canonical unit (ft or mph). */
  perCanonical: number;
  /** Decimals shown by default. */
  decimals: number;
  /** Fine / coarse nudge for ± buttons, in display units. */
  step: number;
  bigStep: number;
}

export const SPEED_UNITS: Record<SpeedUnit, UnitDef> = {
  mph: { label: "mph", perCanonical: 1, decimals: 1, step: 0.1, bigStep: 0.5 },
  kn: { label: "kn", perCanonical: KNOTS_PER_MPH, decimals: 1, step: 0.1, bigStep: 0.5 },
  kmh: { label: "km/h", perCanonical: KMH_PER_MPH, decimals: 1, step: 0.2, bigStep: 1 },
};

export const LENGTH_UNITS: Record<LengthUnit, UnitDef> = {
  ft: { label: "ft", perCanonical: 1, decimals: 0, step: 1, bigStep: 5 },
  m: { label: "m", perCanonical: 0.3048, decimals: 1, step: 0.5, bigStep: 2 },
};

export interface Units {
  speed: UnitDef;
  length: UnitDef;
  speedUnit: SpeedUnit;
  lengthUnit: LengthUnit;
}

export function unitsFor(speedUnit: SpeedUnit, lengthUnit: LengthUnit): Units {
  return { speed: SPEED_UNITS[speedUnit], length: LENGTH_UNITS[lengthUnit], speedUnit, lengthUnit };
}

export const toDisplay = (u: UnitDef, canonical: number) => canonical * u.perCanonical;
export const fromDisplay = (u: UnitDef, display: number) => display / u.perCanonical;

export function fmtNum(n: number | null | undefined, decimals: number): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const s = n.toFixed(decimals);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

/** A length in the display unit, from feet. Metres always keep one decimal. */
export function fmtLen(u: Units, ft: number, decimals = 0): string {
  return fmtNum(toDisplay(u.length, ft), Math.max(decimals, u.length.decimals));
}

export function fmtSpeed(u: Units, mph: number): string {
  return fmtNum(toDisplay(u.speed, mph), u.speed.decimals);
}

/** Reads what a person types: accepts "2.5", "2,5", " 2.5 "; rejects everything else. */
export function parseDecimal(input: string): number | null {
  const t = input.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(t) || !/\d/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const round = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};
