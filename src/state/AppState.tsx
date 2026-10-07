import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ENGINE_VERSION, fitModel, predictDepth, type FitStart, type FittedModel, type LureType, type RigConfig, type RowDiagnostic } from "../engine";
import { ATTRACTORS, LURES, slug, type AttractorEntry, type LureEntry } from "../data/lures";
import { useToast } from "../ui/Toast";
import { buildBackup, describeImport, mergeById, parseBackup } from "./backup";
import { shareOrDownload } from "./files";
import { diagnosticsById, fitInputs } from "./readings";
import { allAppKeys, useStorageFailed, useStored, type StoredSpec } from "./storage";
import { DEFAULT_RIG, DEFAULT_SETTINGS, type Reading, type RigForm, type Settings } from "./types";
import { unitsFor, type Units } from "./units";
import { uid, uniqueId } from "./uid";
import { parseCustomAtts, parseCustomLures, parseReading, parseReadings, parseRig, parseSettings } from "./validate";

const FIRST_LURE = LURES[0]!.id;
const SPEC_READINGS: StoredSpec<Reading[]> = { key: "lc.readings", parse: parseReadings };
const SPEC_LURES: StoredSpec<LureEntry[]> = { key: "lc.lures", parse: parseCustomLures };
const SPEC_ATTS: StoredSpec<AttractorEntry[]> = { key: "lc.atts", parse: parseCustomAtts };
const SPEC_RIG: StoredSpec<RigForm> = { key: "lc.rig", parse: (raw) => parseRig(raw, FIRST_LURE) };
const SPEC_SETTINGS: StoredSpec<Settings> = { key: "lc.settings", parse: parseSettings };

const BUILT_IN_IDS = new Set([...LURES, ...ATTRACTORS].map((x) => x.id));

export type ReadingPatch = Partial<Pick<Reading, "counterFt" | "depthFt" | "speedMph" | "excluded">>;

export interface NewLure {
  brand: string;
  name: string;
  type: LureType;
  weightOz?: number;
  lengthIn?: number;
  ratedDiveFt?: number;
}
export interface NewAttractor {
  brand: string;
  name: string;
  type: AttractorEntry["type"];
}

export interface AppState {
  lures: LureEntry[];
  atts: AttractorEntry[];
  lureById: ReadonlyMap<string, LureEntry>;
  attById: ReadonlyMap<string, AttractorEntry>;

  rig: RigForm;
  setRig: (patch: Partial<RigForm>) => void;
  lure: LureEntry;
  att: AttractorEntry | undefined;
  config: RigConfig;

  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  units: Units;

  readings: Reading[];
  model: FittedModel;
  /** Fit diagnostics by reading id; excluded readings have none. */
  diag: ReadonlyMap<string, RowDiagnostic>;
  /** Set when the fit failed and the app is showing starting estimates instead. */
  fitFailed: boolean;

  addReading: (counterFt: number, depthFt: number) => Reading | null;
  updateReading: (id: string, patch: ReadingPatch) => boolean;
  deleteReading: (id: string) => void;

  addCustomLure: (spec: NewLure) => LureEntry | null;
  addCustomAttractor: (spec: NewAttractor) => AttractorEntry | null;
  removeCustom: (id: string) => void;

  exportData: () => Promise<void>;
  importFile: (file: File) => Promise<void>;
  eraseAll: () => void;
  storageFailed: boolean;
  /** Whether the browser promised not to clear this data when space is short (null: unknown). */
  persisted: boolean | null;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppStateProvider");
  return v;
}

const EMPTY_FIT = (): FittedModel => fitModel([]);

// The last fit's parameters are cached so the first fit after opening the app starts at the answer.
const FIT_CACHE_KEY = "lc.fit";

function loadFitCache(): FitStart | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem(FIT_CACHE_KEY) ?? "null");
    if (!raw || raw.v !== ENGINE_VERSION || !Array.isArray(raw.paramNames) || !Array.isArray(raw.mean)) return undefined;
    if (raw.paramNames.length !== raw.mean.length || raw.paramNames.length > 5000) return undefined;
    if (!raw.paramNames.every((n: unknown) => typeof n === "string") || !raw.mean.every((x: unknown) => typeof x === "number" && Number.isFinite(x))) return undefined;
    if (typeof raw.sigma !== "number" || !(raw.sigma > 0.005 && raw.sigma < 1)) return undefined;
    return { paramNames: raw.paramNames, mean: raw.mean, sigma: raw.sigma };
  } catch {
    return undefined;
  }
}

function saveFitCache(m: FittedModel) {
  if (m.paramNames.length === 0) return;
  try {
    localStorage.setItem(FIT_CACHE_KEY, JSON.stringify({ v: ENGINE_VERSION, paramNames: m.paramNames, mean: m.mean, sigma: m.sigma }));
  } catch {
    /* it's only a cache */
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const storageFailed = useStorageFailed();
  const [readings, setReadings] = useStored(SPEC_READINGS);
  const [customLures, setCustomLures] = useStored(SPEC_LURES);
  const [customAtts, setCustomAtts] = useStored(SPEC_ATTS);
  const [rig, setRigState] = useStored(SPEC_RIG);
  const [settings, setSettingsState] = useStored(SPEC_SETTINGS);

  // ---- catalogue (built-in + the angler's own)
  const lures = useMemo(() => [...LURES, ...customLures.filter((c) => !BUILT_IN_IDS.has(c.id))], [customLures]);
  const atts = useMemo(() => [...ATTRACTORS, ...customAtts.filter((c) => !BUILT_IN_IDS.has(c.id))], [customAtts]);
  const lureById = useMemo(() => new Map(lures.map((l) => [l.id, l])), [lures]);
  const attById = useMemo(() => new Map(atts.map((a) => [a.id, a])), [atts]);

  const lure = lureById.get(rig.lureId) ?? lures[0]!;
  const att = rig.attractorId ? attById.get(rig.attractorId) : undefined;
  const units = useMemo(() => unitsFor(settings.speedUnit, settings.lengthUnit), [settings.speedUnit, settings.lengthUnit]);

  const config = useMemo<RigConfig>(
    () => ({
      lineId: rig.lineId,
      leadcoreLengthFt: rig.leadcoreFt,
      speedMph: rig.speedMph,
      lure: { id: lure.id, type: lure.type, weightOz: lure.weightOz, lengthIn: lure.lengthIn, ratedDiveFt: lure.ratedDive?.max },
      attractor: att ? { id: att.id, type: att.type } : undefined,
      leader: { material: rig.leaderMaterial, lengthFt: rig.leaderFt, ...(rig.leaderTestLb ? { testLb: rig.leaderTestLb } : {}) },
    }),
    [rig, lure, att],
  );

  // ---- the model: refit whenever the log changes, starting from the last answer
  const prevFit = useRef<FitStart | undefined>(undefined);
  if (prevFit.current === undefined) prevFit.current = loadFitCache();
  const fit = useMemo(() => {
    const { observations, ids } = fitInputs(readings, lureById);
    try {
      const model = fitModel(observations, { estimateNoise: observations.length >= 6, init: prevFit.current });
      prevFit.current = model;
      return { model, ids, failed: false };
    } catch (e) {
      console.error("fit failed", e);
      return { model: EMPTY_FIT(), ids: [] as string[], failed: true };
    }
  }, [readings, lureById]);
  const diag = useMemo(() => diagnosticsById(fit.model.rows, fit.ids), [fit]);
  useEffect(() => {
    if (!fit.failed) saveFitCache(fit.model);
  }, [fit]);

  // ---- ask the browser to keep our data when storage is tight
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const sm = navigator.storage;
        if (!sm?.persist) return;
        setPersisted((await sm.persisted()) || (await sm.persist()));
      } catch {
        setPersisted(null);
      }
    })();
  }, []);

  // ---- display theme
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const setRig = useCallback((patch: Partial<RigForm>) => setRigState((r) => ({ ...r, ...patch })), [setRigState]);
  const setSettings = useCallback((patch: Partial<Settings>) => setSettingsState((s) => ({ ...s, ...patch })), [setSettingsState]);

  // ---- readings
  const addReading = useCallback(
    (counterFt: number, depthFt: number): Reading | null => {
      const r = parseReading({
        id: uid(),
        takenAt: new Date().toISOString(),
        lineId: config.lineId,
        leadcoreLengthFt: config.leadcoreLengthFt,
        speedMph: config.speedMph,
        lure: { id: lure.id, type: lure.type, weightOz: lure.weightOz },
        attractor: att ? { id: att.id, type: att.type } : undefined,
        leader: config.leader,
        counterFt,
        depthFt,
      });
      if (!r) {
        toast("That reading is outside what the model accepts. Check the counter and depth.");
        return null;
      }
      const expected = predictDepth(fit.model, config, counterFt).depthFt;
      const off = (depthFt / expected - 1) * 100;
      const how = Math.abs(off) < 2 ? "right on the estimate" : `${Math.abs(off).toFixed(0)}% ${off > 0 ? "deeper" : "shallower"} than estimated`;
      setReadings((rs) => [r, ...rs]);
      toast(`Saved: ${how}. Estimates updated.`, {
        action: { label: "Undo", run: () => setReadings((rs) => rs.filter((x) => x.id !== r.id)) },
      });
      return r;
    },
    [config, lure, att, fit.model, setReadings, toast],
  );

  const updateReading = useCallback(
    (id: string, patch: ReadingPatch): boolean => {
      const cur = readings.find((r) => r.id === id);
      if (!cur) return false;
      const next = parseReading({ ...cur, ...patch });
      if (!next) return false;
      setReadings((rs) => rs.map((r) => (r.id === id ? next : r)));
      return true;
    },
    [readings, setReadings],
  );

  const deleteReading = useCallback(
    (id: string) => {
      const index = readings.findIndex((r) => r.id === id);
      if (index < 0) return;
      const removed = readings[index]!;
      setReadings((rs) => rs.filter((r) => r.id !== id));
      toast("Reading deleted", {
        action: {
          label: "Undo",
          run: () => setReadings((rs) => (rs.some((r) => r.id === id) ? rs : [...rs.slice(0, index), removed, ...rs.slice(index)])),
        },
      });
    },
    [readings, setReadings, toast],
  );

  // ---- custom lures and attractors
  const takenIds = useCallback(() => new Set([...BUILT_IN_IDS, ...customLures.map((l) => l.id), ...customAtts.map((a) => a.id)]), [customLures, customAtts]);

  const addCustomLure = useCallback(
    (spec: NewLure): LureEntry | null => {
      const brand = spec.brand.trim() || "Custom";
      const entry = parseCustomLures([
        {
          id: uniqueId(slug(`${brand} ${spec.name}`).slice(0, 80) || "custom-lure", takenIds()),
          brand,
          name: spec.name.trim(),
          type: spec.type,
          weightOz: spec.weightOz,
          lengthIn: spec.lengthIn,
          ratedDive: spec.ratedDiveFt ? { max: spec.ratedDiveFt } : undefined,
        },
      ]).value[0];
      if (!entry) {
        toast("Couldn't add that lure. Check the name and sizes.");
        return null;
      }
      setCustomLures((cs) => [...cs, entry]);
      return entry;
    },
    [takenIds, setCustomLures, toast],
  );

  const addCustomAttractor = useCallback(
    (spec: NewAttractor): AttractorEntry | null => {
      const brand = spec.brand.trim() || "Custom";
      const entry = parseCustomAtts([{ id: uniqueId(slug(`${brand} ${spec.name}`).slice(0, 80) || "custom-attractor", takenIds()), brand, name: spec.name.trim(), type: spec.type }]).value[0];
      if (!entry) {
        toast("Couldn't add that attractor. Check the name.");
        return null;
      }
      setCustomAtts((cs) => [...cs, entry]);
      return entry;
    },
    [takenIds, setCustomAtts, toast],
  );

  const removeCustom = useCallback(
    (id: string) => {
      const l = customLures.find((x) => x.id === id);
      if (l) {
        setCustomLures((cs) => cs.filter((c) => c.id !== id));
        toast(`${l.brand} ${l.name} removed`, { action: { label: "Undo", run: () => setCustomLures((cs) => (cs.some((c) => c.id === id) ? cs : [...cs, l])) } });
        return;
      }
      const a = customAtts.find((x) => x.id === id);
      if (a) {
        setCustomAtts((cs) => cs.filter((c) => c.id !== id));
        toast(`${a.brand} ${a.name} removed`, { action: { label: "Undo", run: () => setCustomAtts((cs) => (cs.some((c) => c.id === id) ? cs : [...cs, a])) } });
      }
    },
    [customLures, customAtts, setCustomLures, setCustomAtts, toast],
  );

  // ---- backup / restore / erase
  const exportData = useCallback(async () => {
    const text = JSON.stringify(buildBackup({ readings, customLures, customAtts }), null, 2);
    const outcome = await shareOrDownload(`leadcore-backup-${new Date().toISOString().slice(0, 10)}.json`, text);
    if (outcome === "cancelled") return;
    setSettings({ lastBackupAt: new Date().toISOString(), lastBackupCount: readings.length });
    toast(outcome === "downloaded" ? "Backup downloaded. Keep it somewhere safe." : "Backup shared.");
  }, [readings, customLures, customAtts, setSettings, toast]);

  const importFile = useCallback(
    async (file: File) => {
      if (file.size > 25_000_000) {
        toast("That file is too large to be a backup.");
        return;
      }
      let result;
      try {
        result = parseBackup(await file.text());
      } catch {
        toast("Couldn't read that file.");
        return;
      }
      if (!result.ok) {
        toast(result.error);
        return;
      }
      const r = mergeById(readings, result.data.readings);
      const l = mergeById(customLures, result.data.customLures);
      const a = mergeById(customAtts, result.data.customAtts);
      setReadings(r.merged);
      setCustomLures(l.merged);
      setCustomAtts(a.merged);
      toast(describeImport({ readings: r, lures: l, atts: a, skipped: result.skipped }), { ms: 7000 });
    },
    [readings, customLures, customAtts, setReadings, setCustomLures, setCustomAtts, toast],
  );

  const eraseAll = useCallback(() => {
    setReadings([]);
    setCustomLures([]);
    setCustomAtts([]);
    setRigState({ ...DEFAULT_RIG, lureId: FIRST_LURE });
    setSettingsState({ ...DEFAULT_SETTINGS });
    for (const k of allAppKeys()) {
      if (k.includes(".rescued.") || k === FIT_CACHE_KEY) {
        try {
          localStorage.removeItem(k);
        } catch {
          /* ignore */
        }
      }
    }
    toast("All data erased.");
  }, [setReadings, setCustomLures, setCustomAtts, setRigState, setSettingsState, toast]);

  const value = useMemo<AppState>(
    () => ({
      lures, atts, lureById, attById,
      rig, setRig, lure, att, config,
      settings, setSettings, units,
      readings, model: fit.model, diag, fitFailed: fit.failed,
      addReading, updateReading, deleteReading,
      addCustomLure, addCustomAttractor, removeCustom,
      exportData, importFile, eraseAll, storageFailed, persisted,
    }),
    [
      lures, atts, lureById, attById, rig, setRig, lure, att, config, settings, setSettings, units,
      readings, fit, diag, addReading, updateReading, deleteReading, addCustomLure, addCustomAttractor,
      removeCustom, exportData, importFile, eraseAll, storageFailed, persisted,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
