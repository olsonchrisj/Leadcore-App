import type { LeaderMaterial, Observation } from "../engine";

export type SpeedUnit = "mph" | "kn" | "kmh";
export type LengthUnit = "ft" | "m";
export type Theme = "auto" | "dark" | "light";

/** What the Plan screen edits. Everything is canonical (ft, mph, lb) regardless of display units. */
export interface RigForm {
  lineId: string;
  /** Leadcore spooled on the reel, ft. */
  leadcoreFt: number;
  speedMph: number;
  leaderMaterial: LeaderMaterial;
  leaderFt: number;
  /** Leader test, lb. null = use the default (12 lb). */
  leaderTestLb: number | null;
  lureId: string;
  /** "" = none. */
  attractorId: string;
  /** The depth being planned for, ft. */
  targetFt: number;
}

export interface Settings {
  speedUnit: SpeedUnit;
  lengthUnit: LengthUnit;
  theme: Theme;
  /** ISO time of the last backup this device made. */
  lastBackupAt: string | null;
  /** How many readings the last backup held. */
  lastBackupCount: number;
}

/** A logged LiveScope reading plus the bookkeeping the UI needs. */
export interface Reading extends Observation {
  id: string;
  takenAt: string;
  /** Kept in the log but left out of the fit (a reading the user doesn't trust). */
  excluded?: boolean;
}

export const DEFAULT_RIG: Omit<RigForm, "lureId"> = {
  lineId: "suffix-832",
  leadcoreFt: 300,
  speedMph: 2,
  leaderMaterial: "fluorocarbon",
  leaderFt: 50,
  leaderTestLb: null,
  attractorId: "",
  targetFt: 30,
};

export const DEFAULT_SETTINGS: Settings = {
  speedUnit: "mph",
  lengthUnit: "ft",
  theme: "auto",
  lastBackupAt: null,
  lastBackupCount: 0,
};
