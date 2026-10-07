import { useMemo, useState } from "react";
import { predictDepth, solveCounter, suggestNextReading, type CounterSolution } from "../engine";
import { ATTRACTOR_KINDS, LEADER_KINDS } from "../data/kinds";
import { useApp } from "../state/AppState";
import { fmtLen, fmtSpeed, fromDisplay } from "../state/units";
import { LurePicker } from "../ui/LurePicker";
import { NumInput } from "../ui/NumInput";
import type { TabId } from "../ui/tabs";

const MAX_TARGET_FT = 250;

export function Plan({ goTo }: { goTo: (t: TabId) => void }) {
  const { rig, setRig, config, model, units, lures, atts, lure, att, readings, addReading } = useApp();
  const [counterEntered, setCounterEntered] = useState<number | null>(null);
  const [depth, setDepth] = useState<number | null>(null);

  const plan = useMemo(() => (rig.speedMph > 0 && rig.leadcoreFt > 0 && rig.targetFt > 0 ? solveCounter(model, config, rig.targetFt) : null), [model, config, rig.targetFt, rig.speedMph, rig.leadcoreFt]);
  const reachable = !!plan && plan.achievable && !plan.tooShallow;
  // The counter you'd set, rounded the way it's displayed so the log matches what's on the reel.
  const plannedCounter = reachable ? fromDisplay(units.length, Number(fmtLen(units, plan.counterFt))) : null;
  const counter = counterEntered ?? plannedCounter;

  const atCounter = useMemo(() => (counter && counter > 0 ? predictDepth(model, config, counter) : null), [model, config, counter]);
  // Suggest something near what you're fishing now: nearby speeds, and line out around the planned amount.
  const around = counter ?? 150;
  const next = useMemo(
    () =>
      readings.length >= 3 && readings.length < 60
        ? suggestNextReading(model, config, {
            speedMph: [Math.max(1.2, config.speedMph - 0.6), Math.min(3.4, config.speedMph + 0.6)],
            counterFt: [Math.max(30, around * 0.5), Math.min(config.leadcoreLengthFt + 100, Math.max(60, around * 1.6))],
          })
        : null,
    [model, config, readings.length, around],
  );

  const used = readings.filter((r) => !r.excluded).length;
  const forLure = readings.filter((r) => !r.excluded && r.lure.id === lure.id).length;

  const save = () => {
    if (!counter || !depth) return;
    if (addReading(counter, depth)) {
      setDepth(null);
      setCounterEntered(null);
    }
  };

  return (
    <>
      <section className="card">
        <NumInput
          label="Target depth"
          unit={units.length}
          decimals={units.lengthUnit === "ft" ? 0 : 1}
          value={rig.targetFt}
          onChange={(v) => v !== null && setRig({ targetFt: v })}
          stepper="big"
          min={1}
          max={MAX_TARGET_FT}
        />
        <NumInput
          label="Boat speed"
          unit={units.speed}
          value={rig.speedMph}
          onChange={(v) => v !== null && setRig({ speedMph: v })}
          stepper
          min={0.5}
          max={8}
          hint="GPS speed is fine; speed through the water is better."
        />
      </section>

      <section className="result" aria-live="polite">
        <PlanResult plan={plan} atCounter={atCounter} units={units} used={used} forLure={forLure} />
      </section>

      <section className="card">
        <h2>Rig</h2>
        <LurePicker lures={lures} selected={lure} onPick={(id) => setRig({ lureId: id })} />
        <div className="field">
          <label htmlFor="att">Attractor</label>
          <select id="att" value={att?.id ?? ""} onChange={(e) => setRig({ attractorId: e.target.value })}>
            <option value="">None</option>
            {atts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.brand} {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid">
          <div className="field">
            <label htmlFor="leader-mat">Leader</label>
            <select id="leader-mat" value={rig.leaderMaterial} onChange={(e) => setRig({ leaderMaterial: e.target.value as typeof rig.leaderMaterial })}>
              {LEADER_KINDS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <NumInput label="Leader length" unit={units.length} value={rig.leaderFt} onChange={(v) => v !== null && setRig({ leaderFt: v })} min={0} max={300} />
          <NumInput label="Leader test" suffix="lb" optional min={1} max={100} placeholder="12" value={rig.leaderTestLb} onChange={(v) => setRig({ leaderTestLb: v })} />
        </div>
        <p className="hint">
          {fmtLen(units, rig.leadcoreFt)} {units.length.label} of leadcore on the reel (change in{" "}
          <button className="link" onClick={() => goTo("settings")}>
            Settings
          </button>
          ).
        </p>
      </section>

      <section className="card">
        <h2>Log a reading</h2>
        <div className="grid">
          <NumInput
            label="Counter"
            unit={units.length}
            optional
            value={counter}
            onChange={setCounterEntered}
            min={1}
            max={3000}
          />
          <NumInput label="Depth (LiveScope)" unit={units.length} decimals={1} optional value={depth} onChange={setDepth} min={0.5} max={600} />
        </div>
        <p className="hint">
          {counterEntered === null && plannedCounter !== null ? "The counter is filled in from the plan: change it if you set something else. " : ""}
          Logging at {fmtSpeed(units, rig.speedMph)} {units.speed.label} with {lure.brand} {lure.name}
          {att ? ` + ${att.name}` : ""}. Read the depth once the line has settled, about a minute at a steady speed.
        </p>
        <button className="primary wide" disabled={!counter || !depth} onClick={save}>
          Save reading
        </button>
        {next && (
          <p className="hint">
            Most useful next reading: about {fmtLen(units, next.counterFt)} {units.length.label} out at {fmtSpeed(units, next.speedMph)} {units.speed.label}.
          </p>
        )}
      </section>
    </>
  );
}

function PlanResult(props: {
  plan: CounterSolution | null;
  atCounter: ReturnType<typeof predictDepth> | null;
  units: ReturnType<typeof useApp>["units"];
  used: number;
  forLure: number;
}) {
  const { plan, atCounter, units, used, forLure } = props;
  const unit = units.length.label;
  if (!plan) return <p className="hint">Enter a target depth and speed.</p>;

  const confidence =
    used === 0
      ? "Starting estimate: log a few LiveScope readings and this tunes itself to your gear."
      : forLure === 0
        ? `Tuned on ${used} reading${used === 1 ? "" : "s"} from other lures, none with this one yet.`
        : `Tuned on ${used} reading${used === 1 ? "" : "s"}, ${forLure} with this lure.`;

  if (plan.tooShallow) {
    return (
      <>
        <div className="kicker">Shallower than this rig runs</div>
        <div className="big">≈ {fmtLen(units, plan.predictedDepthFt, 1)} {unit} minimum</div>
        <p className="hint">With almost no line out this rig already sits that deep. Try a shorter leader or a lighter lure.</p>
        <p className="hint">{confidence}</p>
      </>
    );
  }
  if (!plan.achievable) {
    return (
      <>
        <div className="kicker">Deeper than your line reaches</div>
        <div className="big">≈ {fmtLen(units, plan.predictedDepthFt, 1)} {unit} maximum</div>
        <p className="hint">That's with all your leadcore and a long run of backing out. Slow down, or go heavier.</p>
        <p className="hint">{confidence}</p>
      </>
    );
  }
  return (
    <>
      <div className="kicker">Set counter to</div>
      <div className="big">
        {fmtLen(units, plan.counterFt)} <span className="unit">{unit}</span>
      </div>
      <div className="sub">
        {plan.colors.toFixed(1)} colors of leadcore
        {plan.backingOutFt > 0.5 && ` + ${fmtLen(units, plan.backingOutFt)} ${unit} backing`}
      </div>
      {atCounter && (
        <div className="hint">
          At {fmtLen(units, plan.counterFt)} {unit} you'd likely be {fmtLen(units, atCounter.lowFt)}–{fmtLen(units, atCounter.highFt)} {unit} deep (8 times out of 10).
        </div>
      )}
      <div className="hint">{confidence}</div>
      {plan.warnings.map((w) => (
        <div className="warn" key={w}>
          {w}
        </div>
      ))}
    </>
  );
}
