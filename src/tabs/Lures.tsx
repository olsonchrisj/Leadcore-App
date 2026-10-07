import { useMemo, useState } from "react";
import { predictDepth, type AttractorType, type LureType } from "../engine";
import { ATTRACTOR_KINDS, LURE_KINDS, attractorKindLabel, lureKindLabel } from "../data/kinds";
import type { AttractorEntry, LureEntry } from "../data/lures";
import { useApp } from "../state/AppState";
import { lureRef } from "../state/readings";
import { fmtLen } from "../state/units";
import { NumInput } from "../ui/NumInput";
import { useToast } from "../ui/Toast";
import type { TabId } from "../ui/tabs";

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

function specLine(l: LureEntry, unit: string, show: (ft: number) => string): string {
  const dive = l.ratedDive;
  return [
    l.weightOz && `${Number(l.weightOz.toFixed(2))} oz`,
    l.lengthIn && `${l.lengthIn}"`,
    dive && `rated dive ${dive.min ? `${show(dive.min)}–` : "up to "}${show(dive.max)} ${unit} on mono, not leadcore`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function Lures({ goTo }: { goTo: (t: TabId) => void }) {
  const { lures, atts, readings, model, config, units, setRig, removeCustom } = useApp();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | LureType>("all");
  const unit = units.length.label;

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of readings) if (!r.excluded) m.set(r.lure.id, (m.get(r.lure.id) ?? 0) + 1);
    return m;
  }, [readings]);

  /** How much deeper or shallower than a typical lure of its kind this one runs, once we've seen it. */
  const insight = (l: LureEntry): string | null => {
    if (!counts.get(l.id)) return null;
    const cfg = { ...config, speedMph: 2, attractor: undefined };
    const c = Math.min(150, config.leadcoreLengthFt);
    const mine = predictDepth(model, { ...cfg, lure: lureRef(l) }, c).depthFt;
    const typical = predictDepth(model, { ...cfg, lure: { ...lureRef(l), id: "__typical__" } }, c).depthFt;
    const diff = mine - typical;
    const kindName = lureKindLabel(l.type).toLowerCase();
    if (Math.abs(diff) < 0.4) return `Runs about like a typical ${kindName}.`;
    return `Runs about ${fmtLen(units, Math.abs(diff), 1)} ${unit} ${diff > 0 ? "deeper" : "shallower"} than a typical ${kindName} (2 mph, ${fmtLen(units, c)} ${unit} out).`;
  };

  const needle = q.trim().toLowerCase();
  const matches = (s: string) => !needle || needle.split(/\s+/).every((w) => s.toLowerCase().includes(w));
  const shownLures = lures
    .filter((l) => (kind === "all" || l.type === kind) && matches(`${l.brand} ${l.name} ${lureKindLabel(l.type)}`))
    .sort((a, b) => byName(a.brand + " " + a.name, b.brand + " " + b.name));
  const shownAtts = atts.filter((a) => kind === "all" && matches(`${a.brand} ${a.name} ${attractorKindLabel(a.type)}`)).sort((a, b) => byName(a.brand + a.name, b.brand + b.name));
  const pick = (id: string) => {
    setRig({ lureId: id });
    goTo("plan");
  };

  return (
    <>
      <section className="card">
        <div className="field">
          <label htmlFor="lure-search">Search lures</label>
          <input id="lure-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. rapala, wabler, ripshad" autoComplete="off" />
        </div>
        <div className="chips" role="group" aria-label="Filter by type">
          <button className={kind === "all" ? "chip on" : "chip"} aria-pressed={kind === "all"} onClick={() => setKind("all")}>
            All
          </button>
          {LURE_KINDS.map((k) => (
            <button key={k.id} className={kind === k.id ? "chip on" : "chip"} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
              {lureKindLabel(k.id)}
            </button>
          ))}
        </div>
      </section>

      <AddCustom goTo={goTo} />

      <section className="card">
        <h2>
          Lures <span className="count">{shownLures.length}</span>
        </h2>
        {shownLures.length === 0 && <p className="hint">Nothing matches. Add it above and it will learn from your readings like the rest.</p>}
        <ul className="catalog">
          {shownLures.map((l) => {
            const n = counts.get(l.id) ?? 0;
            const tip = insight(l);
            const specs = specLine(l, unit, (ft) => fmtLen(units, ft));
            return (
              <li key={l.id}>
                <div className="cat-main">
                  <div>
                    <strong>
                      {l.brand} {l.name}
                    </strong>{" "}
                    <span className="tag">{lureKindLabel(l.type)}</span>
                    {l.custom && <span className="tag">custom</span>}
                    {n > 0 && <span className="tag good">{n} reading{n === 1 ? "" : "s"}</span>}
                  </div>
                  {(specs || l.mfrUrl || l.source) && (
                    <div className="hint">
                      {specs}
                      {(l.mfrUrl || l.source) && (
                        <>
                          {specs && " · "}
                          <a href={l.mfrUrl ?? l.source} target="_blank" rel="noreferrer">
                            {l.mfrUrl ? "manufacturer" : "retailer"}
                          </a>
                        </>
                      )}
                    </div>
                  )}
                  {tip && <div className="hint tip">{tip}</div>}
                </div>
                <div className="cat-actions">
                  <button onClick={() => pick(l.id)}>Use</button>
                  {l.custom && (
                    <button className="quiet" aria-label={`Remove ${l.brand} ${l.name}`} onClick={() => removeCustom(l.id)}>
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {kind === "all" && (
        <section className="card">
          <h2>
            Attractors <span className="count">{shownAtts.length}</span>
          </h2>
          <ul className="catalog">
            {shownAtts.map((a: AttractorEntry) => (
              <li key={a.id}>
                <div className="cat-main">
                  <strong>
                    {a.brand} {a.name}
                  </strong>{" "}
                  <span className="tag">{attractorKindLabel(a.type)}</span>
                  {a.custom && <span className="tag">custom</span>}
                </div>
                {a.custom && (
                  <div className="cat-actions">
                    <button className="quiet" aria-label={`Remove ${a.brand} ${a.name}`} onClick={() => removeCustom(a.id)}>
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function AddCustom({ goTo }: { goTo: (t: TabId) => void }) {
  const { addCustomLure, addCustomAttractor, setRig, units } = useApp();
  const toast = useToast();
  const [isAtt, setIsAtt] = useState(false);
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<LureType>("spoon");
  const [attType, setAttType] = useState<AttractorType>("flasher");
  const [weight, setWeight] = useState<number | null>(null);
  const [length, setLength] = useState<number | null>(null);
  const [dive, setDive] = useState<number | null>(null);

  const add = () => {
    if (!name.trim()) return;
    if (isAtt) {
      const a = addCustomAttractor({ brand, name, type: attType });
      if (a) toast(`Added ${a.brand} ${a.name}`);
    } else {
      const l = addCustomLure({ brand, name, type, weightOz: weight ?? undefined, lengthIn: length ?? undefined, ratedDiveFt: dive ?? undefined });
      if (l) {
        toast(`Added ${l.brand} ${l.name}`, {
          action: {
            label: "Use now",
            run: () => {
              setRig({ lureId: l.id });
              goTo("plan");
            },
          },
        });
      }
    }
    setName("");
    setWeight(null);
    setLength(null);
    setDive(null);
  };

  return (
    <details className="card">
      <summary>Add your own lure or attractor</summary>
      <div className="seg" role="group" aria-label="What to add">
        <button className={!isAtt ? "on" : ""} aria-pressed={!isAtt} onClick={() => setIsAtt(false)}>
          Lure
        </button>
        <button className={isAtt ? "on" : ""} aria-pressed={isAtt} onClick={() => setIsAtt(true)}>
          Attractor
        </button>
      </div>
      <div className="grid">
        <div className="field">
          <label htmlFor="c-brand">Brand</label>
          <input id="c-brand" value={brand} maxLength={50} onChange={(e) => setBrand(e.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="c-name">Name / size</label>
          <input id="c-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="c-type">Type</label>
          {isAtt ? (
            <select id="c-type" value={attType} onChange={(e) => setAttType(e.target.value as AttractorType)}>
              {ATTRACTOR_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          ) : (
            <select id="c-type" value={type} onChange={(e) => setType(e.target.value as LureType)}>
              {LURE_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {!isAtt && (
        <>
          <div className="grid">
            <NumInput label="Weight" suffix="oz" optional decimals={2} min={0.05} max={16} value={weight} onChange={setWeight} />
            <NumInput label="Length" suffix="in" optional decimals={2} min={0.5} max={24} value={length} onChange={setLength} />
            <NumInput label="Rated dive" unit={units.length} optional decimals={1} min={1} max={100} value={dive} onChange={setDive} />
          </div>
          <p className="hint">
            Weight and length are on the package. A crankbait's rated dive tells the model how big its bill is. Leave anything you don't know blank: readings will teach it.
          </p>
        </>
      )}
      <button className="primary" disabled={!name.trim()} onClick={add}>
        Add
      </button>
    </details>
  );
}
