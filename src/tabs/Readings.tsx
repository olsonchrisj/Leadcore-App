import { useMemo, useState } from "react";
import { predictDepth, referenceRate, summarize } from "../engine";
import { LEADER_KINDS } from "../data/kinds";
import { useApp } from "../state/AppState";
import { ago, toObservation } from "../state/readings";
import type { Reading } from "../state/types";
import { fmtLen, fmtSpeed } from "../state/units";
import { NumInput } from "../ui/NumInput";
import type { TabId } from "../ui/tabs";

const PAGE = 30;
const DAY = 86_400_000;

type Filter = "all" | "off" | "left";

export function Readings({ goTo }: { goTo: (t: TabId) => void }) {
  const { readings, model, diag, units, rig, settings, exportData } = useApp();
  const [shown, setShown] = useState(PAGE);
  const [filter, setFilter] = useState<Filter>("all");
  const sum = useMemo(() => summarize(model), [model]);
  const rate = useMemo(() => (model.nObservations >= 3 ? referenceRate(model, rig.lineId, rig.leadcoreFt) : null), [model, rig.lineId, rig.leadcoreFt]);
  const left = readings.length - model.nObservations;
  const unit = units.length.label;

  const offCount = readings.filter((r) => diag.get(r.id)?.flagged).length;
  // If the filter's last matches go away (a typo fixed, a reading deleted), fall back to everything.
  const active: Filter = (filter === "off" && offCount === 0) || (filter === "left" && left === 0) ? "all" : filter;
  const visible = readings.filter((r) => (active === "off" ? diag.get(r.id)?.flagged : active === "left" ? r.excluded : true));

  const unsaved = Math.max(0, readings.length - settings.lastBackupCount);
  const stale = settings.lastBackupAt ? Date.now() - Date.parse(settings.lastBackupAt) > 30 * DAY : true;
  const needsBackup = readings.length > 0 && (unsaved >= 5 || (stale && unsaved > 0));

  return (
    <>
      <section className="card">
        {readings.length === 0 ? (
          <>
            <h2>No readings yet</h2>
            <p>
              Set your line to the counter number on the Plan screen, let it settle, then log the depth LiveScope shows. After a few readings per lure
              the estimates become yours instead of the starting guesses.
            </p>
            <button className="primary" onClick={() => goTo("plan")}>
              Go to Plan
            </button>
          </>
        ) : (
          <>
            <h2>
              {model.nObservations} reading{model.nObservations === 1 ? "" : "s"} in the model
            </h2>
            <ul className="facts">
              {left > 0 && <li>{left} more left out on purpose.</li>}
              {sum.n >= 4 ? (
                <li>
                  A new reading usually lands within about <b>±{Math.max(1, Math.round(sum.looRmsPct))}%</b> of the estimate (found by predicting each reading from the others).
                </li>
              ) : (
                <li>Log {Math.max(1, 4 - sum.n)} more to measure how accurate the estimates are.</li>
              )}
              {sum.flagged > 0 && (
                <li className="warn">
                  {sum.flagged} reading{sum.flagged === 1 ? " looks" : "s look"} off. Check {sum.flagged === 1 ? "it" : "them"} below.
                </li>
              )}
              {rate && (
                <li>
                  Your line sinks about <b>{fmtLen(units, rate.ftPerColor, 1)} {unit} per color</b> at 2 mph (starting estimate {fmtLen(units, rate.nominalFtPerColor, 1)}).
                </li>
              )}
            </ul>
          </>
        )}
      </section>

      {readings.length > 0 && (
        <section className={needsBackup ? "card attention" : "card"}>
          <div className="between">
            <div>
              <strong>{needsBackup ? "Back up your readings" : "Backup"}</strong>
              <div className="hint">
                Last backup: {ago(settings.lastBackupAt)}
                {unsaved > 0 && settings.lastBackupAt ? `, ${unsaved} new reading${unsaved === 1 ? "" : "s"} since` : ""}.
              </div>
            </div>
            <button className={needsBackup ? "primary" : ""} onClick={exportData}>
              Back up now
            </button>
          </div>
        </section>
      )}

      {(offCount > 0 || left > 0) && (
        <div className="chips" role="group" aria-label="Filter readings">
          <button className={active === "all" ? "chip on" : "chip"} aria-pressed={active === "all"} onClick={() => setFilter("all")}>
            All {readings.length}
          </button>
          {offCount > 0 && (
            <button className={active === "off" ? "chip on" : "chip"} aria-pressed={active === "off"} onClick={() => setFilter("off")}>
              Look off {offCount}
            </button>
          )}
          {left > 0 && (
            <button className={active === "left" ? "chip on" : "chip"} aria-pressed={active === "left"} onClick={() => setFilter("left")}>
              Left out {left}
            </button>
          )}
        </div>
      )}

      {visible.length > 0 && (
        <ul className="readings" aria-label="Logged readings">
          {visible.slice(0, shown).map((r) => (
            <ReadingRow key={r.id} r={r} />
          ))}
        </ul>
      )}
      {visible.length > shown && (
        <button className="wide" onClick={() => setShown(shown + PAGE)}>
          Show {Math.min(PAGE, visible.length - shown)} more
        </button>
      )}
    </>
  );
}

function ReadingRow({ r }: { r: Reading }) {
  const { units, lureById, attById, diag, model, updateReading, deleteReading } = useApp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ counterFt: r.counterFt, depthFt: r.depthFt, speedMph: r.speedMph });
  const unit = units.length.label;
  const d = diag.get(r.id);

  const predicted = useMemo(() => d?.predictedFt ?? predictDepth(model, toObservation(r, lureById), r.counterFt).depthFt, [d, model, r, lureById]);
  const errPct = d ? d.errPct : (r.depthFt / predicted - 1) * 100;
  const lure = lureById.get(r.lure.id);
  const att = r.attractor ? attById.get(r.attractor.id) : undefined;
  const name = lure ? `${lure.brand} ${lure.name}` : r.lure.id.replace(/-/g, " ");
  const when = new Date(r.takenAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const material = LEADER_KINDS.find((m) => m.id === r.leader.material)?.label.toLowerCase() ?? r.leader.material;
  const err = `${errPct >= 0 ? "+" : "−"}${Math.abs(errPct).toFixed(0)}%`;
  const cls = ["reading", d?.flagged ? "flagged" : "", r.excluded ? "excluded" : ""].join(" ").trim();

  const dirty = draft.counterFt !== r.counterFt || draft.depthFt !== r.depthFt || draft.speedMph !== r.speedMph;
  const invalid = !(draft.counterFt > 0 && draft.depthFt > 0 && draft.speedMph > 0);

  return (
    <li className={cls}>
      <button
        className="reading-head"
        aria-expanded={open}
        onClick={() => {
          setDraft({ counterFt: r.counterFt, depthFt: r.depthFt, speedMph: r.speedMph });
          setOpen(!open);
        }}
      >
        <span className="r-main">
          <strong>
            {name}
            {att ? ` + ${att.name}` : ""}
          </strong>
          <span className="hint">
            {when} · {fmtSpeed(units, r.speedMph)} {units.speed.label} · {fmtLen(units, r.leader.lengthFt)} {unit} {material}
          </span>
        </span>
        <span className="r-nums">
          <span>
            {fmtLen(units, r.counterFt)} → <b>{fmtLen(units, r.depthFt, 1)}</b> {unit}
          </span>
          <span className="hint">
            model {fmtLen(units, predicted, 1)} · {err}
          </span>
        </span>
      </button>
      {(d?.flagged || r.excluded) && (
        <div className="r-tags">
          {d?.flagged && <span className="tag warn-tag">looks off: check the counter and depth</span>}
          {r.excluded && <span className="tag">left out of the model</span>}
        </div>
      )}
      {open && (
        <div className="r-edit">
          <div className="grid">
            <NumInput label="Counter" unit={units.length} value={draft.counterFt} onChange={(v) => v !== null && setDraft({ ...draft, counterFt: v })} min={1} max={3000} />
            <NumInput label="Depth" unit={units.length} decimals={1} value={draft.depthFt} onChange={(v) => v !== null && setDraft({ ...draft, depthFt: v })} min={0.5} max={600} />
            <NumInput label="Speed" unit={units.speed} value={draft.speedMph} onChange={(v) => v !== null && setDraft({ ...draft, speedMph: v })} min={0.5} max={15} />
          </div>
          <label className="check">
            <input type="checkbox" checked={!!r.excluded} onChange={(e) => updateReading(r.id, { excluded: e.target.checked })} />
            Leave this reading out of the model
          </label>
          <div className="row">
            <button
              className="primary"
              disabled={!dirty || invalid}
              onClick={() => {
                if (updateReading(r.id, draft)) setOpen(false);
              }}
            >
              Save changes
            </button>
            <button onClick={() => setOpen(false)}>Close</button>
            <button className="danger" onClick={() => deleteReading(r.id)}>
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
