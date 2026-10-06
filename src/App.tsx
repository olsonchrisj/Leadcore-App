import { useMemo, useState } from "react";
import {
  fitModel,
  predictDepth,
  solveCounter,
  type LeaderMaterial,
  type LureType,
  type AttractorType,
  type Observation,
  type RigConfig,
} from "./engine";
import { ATTRACTORS, LURES, slug, type AttractorEntry, type LureEntry } from "./data/lures";
import { useStored } from "./store";

interface RigForm {
  lineId: string;
  leadcoreFt: number;
  speedMph: number;
  leaderMaterial: LeaderMaterial;
  leaderFt: number;
  lureId: string;
  attractorId: string;
}

interface Reading extends Observation {
  id: string;
  takenAt: string;
}

const DEFAULT_RIG: RigForm = {
  lineId: "suffix-832",
  leadcoreFt: 300,
  speedMph: 2,
  leaderMaterial: "fluorocarbon",
  leaderFt: 50,
  lureId: LURES[0]!.id,
  attractorId: "",
};

const LURE_TYPES: LureType[] = ["spoon", "crankbait", "stickbait", "diver", "plug", "spinner", "softbait"];
const ATTR_TYPES: AttractorType[] = ["flasher", "dodger", "fly", "other"];
const MATERIALS: LeaderMaterial[] = ["fluorocarbon", "monofilament", "braid", "wire", "other"];

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "–");

function NumInput(props: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  optional?: boolean;
  suffix?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (props.value === null ? "" : String(props.value));
  return (
    <label className="field">
      <span>{props.label}{props.suffix ? ` (${props.suffix})` : ""}</span>
      <input
        inputMode="decimal"
        value={shown}
        step={props.step}
        onChange={(e) => {
          setText(e.target.value);
          const v = e.target.value.trim();
          if (v === "" && props.optional) return props.onChange(null);
          const n = Number(v);
          if (v !== "" && Number.isFinite(n) && n >= 0) props.onChange(n);
        }}
        onBlur={() => setText(null)}
      />
    </label>
  );
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [tab, setTab] = useState<"calc" | "readings" | "lures">("calc");
  const [rig, setRig] = useStored<RigForm>("lc.rig", DEFAULT_RIG);
  const [readings, setReadings] = useStored<Reading[]>("lc.readings", []);
  const [customLures, setCustomLures] = useStored<LureEntry[]>("lc.lures", []);
  const [customAtts, setCustomAtts] = useStored<AttractorEntry[]>("lc.atts", []);
  const [target, setTarget] = useState<number | null>(30);
  const [counter, setCounter] = useState<number | null>(null);
  const [depth, setDepth] = useState<number | null>(null);

  const lures = useMemo(() => [...LURES, ...customLures], [customLures]);
  const atts = useMemo(() => [...ATTRACTORS, ...customAtts], [customAtts]);
  const lure = lures.find((l) => l.id === rig.lureId) ?? lures[0]!;
  const att = atts.find((a) => a.id === rig.attractorId);
  const set = <K extends keyof RigForm>(k: K, v: RigForm[K]) => setRig({ ...rig, [k]: v });

  const config: RigConfig = {
    lineId: "suffix-832",
    leadcoreLengthFt: rig.leadcoreFt,
    speedMph: rig.speedMph,
    lure: { id: lure.id, type: lure.type, weightOz: lure.weightOz },
    attractor: att ? { id: att.id, type: att.type } : undefined,
    leader: { material: rig.leaderMaterial, lengthFt: rig.leaderFt },
  };

  const model = useMemo(() => fitModel(readings, { estimateNoise: readings.length >= 6 }), [readings]);
  const valid = rig.speedMph > 0 && rig.leadcoreFt > 0;
  const plan = valid && target ? solveCounter(model, config, target) : null;
  const forward = valid && counter ? predictDepth(model, config, counter) : null;
  const lureReadings = readings.filter((r) => r.lure.id === lure.id).length;

  const saveReading = () => {
    if (!counter || !depth || !valid) return;
    const r: Reading = {
      ...config,
      id: crypto.randomUUID(),
      takenAt: new Date().toISOString(),
      counterFt: counter,
      depthFt: depth,
    };
    setReadings([r, ...readings]);
    setDepth(null);
  };

  const exportAll = () =>
    download(
      `leadcore-data-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ version: 1, readings, customLures, customAtts }, null, 2),
      "application/json",
    );

  const importAll = async (file: File) => {
    try {
      const d = JSON.parse(await file.text());
      const ids = new Set(readings.map((r) => r.id));
      setReadings([...readings, ...(d.readings ?? []).filter((r: Reading) => !ids.has(r.id))]);
      const lid = new Set(customLures.map((l) => l.id));
      setCustomLures([...customLures, ...(d.customLures ?? []).filter((l: LureEntry) => !lid.has(l.id))]);
      const aid = new Set(customAtts.map((l) => l.id));
      setCustomAtts([...customAtts, ...(d.customAtts ?? []).filter((l: AttractorEntry) => !aid.has(l.id))]);
    } catch {
      alert("Could not read that file.");
    }
  };

  return (
    <main>
      <h1>Leadcore Calculator</h1>
      <nav>
        {(["calc", "readings", "lures"] as const).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "calc" ? "Calculator" : t === "readings" ? `Readings (${readings.length})` : "Lures"}
          </button>
        ))}
      </nav>

      {tab === "calc" && (
        <>
          <section>
            <h2>Rig</h2>
            <div className="grid">
              <NumInput label="Leadcore on reel" suffix="ft" value={rig.leadcoreFt} onChange={(v) => set("leadcoreFt", v ?? 0)} />
              <NumInput label="Speed" suffix="mph" step={0.1} value={rig.speedMph} onChange={(v) => set("speedMph", v ?? 0)} />
            </div>
            <div className="grid">
              <label className="field">
                <span>Leader material</span>
                <select value={rig.leaderMaterial} onChange={(e) => set("leaderMaterial", e.target.value as LeaderMaterial)}>
                  {MATERIALS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              <NumInput label="Leader length" suffix="ft" value={rig.leaderFt} onChange={(v) => set("leaderFt", v ?? 0)} />
            </div>
            <label className="field">
              <span>Lure</span>
              <select value={lure.id} onChange={(e) => set("lureId", e.target.value)}>
                {[...lures].sort((a, b) => `${a.type}${a.brand}${a.name}`.localeCompare(`${b.type}${b.brand}${b.name}`)).map((l) => (
                  <option key={l.id} value={l.id}>{l.type} · {l.brand} {l.name}</option>
                ))}
              </select>
            </label>
            <div className="grid">
              <label className="field">
                <span>Attractor</span>
                <select value={rig.attractorId} onChange={(e) => set("attractorId", e.target.value)}>
                  <option value="">None</option>
                  {atts.map((a) => <option key={a.id} value={a.id}>{a.brand} {a.name}</option>)}
                </select>
              </label>
            </div>
            <p className="hint">
              {lureReadings === 0
                ? "No readings for this lure yet: using type-level estimates."
                : `${lureReadings} reading${lureReadings > 1 ? "s" : ""} for this lure.`}
            </p>
          </section>

          <section>
            <h2>Plan</h2>
            <NumInput label="Target depth" suffix="ft" value={target} onChange={setTarget} />
            {plan && (
              <div className="result">
                <div className="big">Set counter to {fmt(plan.counterFt, 0)} ft</div>
                <div>
                  {fmt(plan.colors)} colors of leadcore
                  {plan.backingOutFt > 0 && ` + ${fmt(plan.backingOutFt, 0)} ft backing`}
                </div>
                <div className="hint">
                  Likely range {fmt(plan.counterForHighFt, 0)}–{fmt(plan.counterForLowFt, 0)} ft
                  (80%). Predicted depth {fmt(plan.predictedDepthFt)} ft.
                </div>
                {plan.warnings.map((w) => <div className="warn" key={w}>{w}</div>)}
              </div>
            )}
          </section>

          <section>
            <h2>Log a reading</h2>
            <div className="grid">
              <NumInput label="Counter" suffix="ft" value={counter} optional onChange={setCounter} />
              <NumInput label="Depth (LiveScope)" suffix="ft" value={depth} optional onChange={setDepth} />
            </div>
            {forward && <div className="hint">Model expected {fmt(forward.depthFt)} ft ({fmt(forward.lowFt)}–{fmt(forward.highFt)}).</div>}
            <button className="primary" disabled={!counter || !depth || !valid} onClick={saveReading}>Save reading</button>
          </section>
        </>
      )}

      {tab === "readings" && (
        <section>
          <h2>Readings</h2>
          <div className="row">
            <button onClick={exportAll}>Export JSON</button>
            <label className="button">Import JSON<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importAll(e.target.files[0])} /></label>
          </div>
          <table>
            <thead><tr><th>Lure</th><th>mph</th><th>Counter</th><th>Depth</th><th /></tr></thead>
            <tbody>
              {readings.map((r) => (
                <tr key={r.id}>
                  <td>{r.lure.id}{r.attractor ? ` + ${r.attractor.id}` : ""}<div className="hint">{r.takenAt.slice(0, 10)} · {r.leader.material} {r.leader.lengthFt} ft</div></td>
                  <td>{r.speedMph}</td><td>{fmt(r.counterFt, 0)}</td><td>{fmt(r.depthFt)}</td>
                  <td><button onClick={() => setReadings(readings.filter((x) => x.id !== r.id))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!readings.length && <p className="hint">No readings yet.</p>}
        </section>
      )}

      {tab === "lures" && <Lures lures={lures} atts={atts} addLure={(l) => setCustomLures([...customLures, l])} addAtt={(a) => setCustomAtts([...customAtts, a])} />}
    </main>
  );
}

function Lures(props: {
  lures: LureEntry[];
  atts: AttractorEntry[];
  addLure: (l: LureEntry) => void;
  addAtt: (a: AttractorEntry) => void;
}) {
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<LureType>("spoon");
  const [isAtt, setIsAtt] = useState(false);
  const [attType, setAttType] = useState<AttractorType>("flasher");
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  const add = () => {
    if (!name.trim()) return;
    const id = slug(`${brand} ${name}`);
    if (isAtt) props.addAtt({ id, brand: brand.trim() || "Custom", name: name.trim(), type: attType, custom: true });
    else props.addLure({ id, brand: brand.trim() || "Custom", name: name.trim(), type, custom: true });
    setName("");
  };
  return (
    <section>
      <h2>Lures</h2>
      <label className="field"><span>Search</span><input value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <h3>Add custom</h3>
      <div className="grid">
        <label className="field"><span>Brand</span><input value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
        <label className="field"><span>Name / size</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Kind</span>
          <select value={isAtt ? "att" : type} onChange={(e) => { const v = e.target.value; if (v === "att") setIsAtt(true); else { setIsAtt(false); setType(v as LureType); } }}>
            {LURE_TYPES.map((t) => <option key={t}>{t}</option>)}
            <option value="att">attractor</option>
          </select>
        </label>
        {isAtt && (
          <label className="field"><span>Attractor type</span>
            <select value={attType} onChange={(e) => setAttType(e.target.value as AttractorType)}>{ATTR_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
        )}
      </div>
      <button className="primary" onClick={add}>Add</button>
      <h3>Lures ({props.lures.length})</h3>
      <ul>{props.lures.filter((l) => match(`${l.brand} ${l.name} ${l.type}`)).map((l) => <li key={l.id}>{l.brand} {l.name} <span className="tag">{l.type}</span>{l.custom && <span className="tag">custom</span>}{(l.weightOz || l.ratedDive) && <div className="hint">{[l.weightOz && `${l.weightOz.toFixed(2)} oz`, l.lengthIn && `${l.lengthIn}"`, l.ratedDive && `rated dive ${l.ratedDive.min ? l.ratedDive.min + "–" : "≤"}${l.ratedDive.max} ft (not leadcore)`].filter(Boolean).join(" · ")}{l.source && <> · <a href={l.source} target="_blank" rel="noreferrer">source</a></>}</div>}</li>)}</ul>
      <h3>Attractors</h3>
      <ul>{props.atts.filter((a) => match(`${a.brand} ${a.name} ${a.type}`)).map((a) => <li key={a.id}>{a.brand} {a.name} <span className="tag">{a.type}</span></li>)}</ul>
    </section>
  );
}
