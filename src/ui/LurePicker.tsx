import { useId } from "react";
import { compareLures, lureFamily, type LureEntry } from "../data/lures";
import { LURE_KINDS } from "../data/kinds";

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

// Show the weight unless the name already carries a size ("Little Cleo 1/4 oz").
const modelLabel = (l: LureEntry) => (l.weightOz && lureFamily(l.name) === l.name ? `${l.name} · ${Number(l.weightOz.toFixed(2))} oz` : l.name);

/** Type → brand → model, so one tap path narrows a long catalogue. */
export function LurePicker(props: { lures: LureEntry[]; selected: LureEntry; onPick: (id: string) => void }) {
  const { lures, selected } = props;
  const id = useId();
  const types = LURE_KINDS.filter((k) => lures.some((l) => l.type === k.id));
  const brands = [...new Set(lures.filter((l) => l.type === selected.type).map((l) => l.brand))].sort(byName);
  const models = lures.filter((l) => l.type === selected.type && l.brand === selected.brand).sort(compareLures);
  const first = (f: (l: LureEntry) => boolean) => lures.filter(f).sort(compareLures)[0];
  return (
    <>
      <div className="grid">
        <div className="field">
          <label htmlFor={`${id}-type`}>Lure type</label>
          <select
            id={`${id}-type`}
            value={selected.type}
            onChange={(e) => {
              const l = first((x) => x.type === e.target.value);
              if (l) props.onPick(l.id);
            }}
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-brand`}>Brand</label>
          <select
            id={`${id}-brand`}
            value={selected.brand}
            onChange={(e) => {
              const l = first((x) => x.type === selected.type && x.brand === e.target.value);
              if (l) props.onPick(l.id);
            }}
          >
            {brands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-model`}>Model</label>
        <select id={`${id}-model`} value={selected.id} onChange={(e) => props.onPick(e.target.value)}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {modelLabel(m)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
