import { useMemo } from "react";
import { depthChart, solveCounter, summarize } from "../engine";
import { useApp } from "../state/AppState";
import { fmtLen, fmtNum, fmtSpeed, fromDisplay, toDisplay } from "../state/units";
import { CurvePlot } from "../ui/CurvePlot";

const SPEED_OFFSETS = [-3, -2, -1, 0, 1, 2, 3];

export function Chart() {
  const { rig, config, model, units, lure, att, readings } = useApp();
  const len = units.length;

  // ---- table axes, in display units, then converted to what the engine speaks (mph, ft)
  const axes = useMemo(() => {
    const speedStep = units.speedUnit === "kmh" ? 0.4 : 0.2;
    const centre = Math.round(toDisplay(units.speed, rig.speedMph) / speedStep) * speedStep;
    const speedsDisp = SPEED_OFFSETS.map((k) => centre + k * speedStep).filter((s) => s >= 0.6);
    const depthStep = units.lengthUnit === "ft" ? 5 : 1;
    const depthsDisp = Array.from({ length: units.lengthUnit === "ft" ? 24 : 36 }, (_, i) => (i + 1) * depthStep);
    return {
      centre,
      speedsDisp,
      speedsMph: speedsDisp.map((s) => fromDisplay(units.speed, s)),
      depthsDisp,
      depthsFt: depthsDisp.map((d) => fromDisplay(len, d)),
    };
  }, [rig.speedMph, units.speedUnit, units.lengthUnit]);
  const { speedsDisp, depthsDisp } = axes;

  const cells = useMemo(() => depthChart(model, config, axes.speedsMph, axes.depthsFt), [model, config, axes]);
  const rows = depthsDisp
    .map((d, di) => ({ d, row: axes.speedsMph.map((_, si) => cells[si]![di]!) }))
    .filter((r) => r.row.some((c) => c.ok));
  const targetDisp = toDisplay(len, rig.targetFt);
  const targetRow = rows.length ? rows.reduce((b, r) => (Math.abs(r.d - targetDisp) < Math.abs(b.d - targetDisp) ? r : b)).d : null;
  const mainCol = speedsDisp.findIndex((s) => Math.abs(s - axes.centre) < 1e-9);

  const plan = useMemo(() => solveCounter(model, config, rig.targetFt), [model, config, rig.targetFt]);
  const planned = plan.achievable && !plan.tooShallow ? plan.counterFt : null;
  const points = useMemo(
    () =>
      readings
        .filter((r) => !r.excluded && r.lure.id === lure.id && Math.abs(r.speedMph - rig.speedMph) <= 0.4)
        .map((r) => ({ counterFt: r.counterFt, depthFt: r.depthFt })),
    [readings, lure.id, rig.speedMph],
  );
  const sum = summarize(model);

  return (
    <>
      <section className="card">
        <h2>
          {lure.brand} {lure.name}
          {att ? ` + ${att.name}` : ""}
        </h2>
        <p className="hint">
          {fmtSpeed(units, rig.speedMph)} {units.speed.label}, {fmtLen(units, rig.leaderFt)} {len.label} {rig.leaderMaterial} leader. Shaded band: where it
          should run 8 times out of 10. {points.length > 0 ? `Dots: your ${points.length} reading${points.length === 1 ? "" : "s"} near this speed.` : "No readings with this lure near this speed yet."}
        </p>
        <CurvePlot model={model} config={config} units={units} targetFt={rig.targetFt} plannedCounterFt={planned} points={points} />
      </section>

      <section className="card">
        <h2>Counter for each depth and speed</h2>
        <p className="hint">
          Down the side: target depth ({len.label}). Across the top: boat speed ({units.speed.label}).
        </p>
        <div className="table-wrap">
          <table className="chart">
            <caption className="sr-only">Counter reading in {len.label} for each target depth and boat speed</caption>
            <thead>
              <tr>
                <th scope="col">{len.label}</th>
                {speedsDisp.map((s, i) => (
                  <th key={s} scope="col" className={i === mainCol ? "now" : undefined}>
                    {fmtNum(s, 1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ d, row }) => (
                <tr key={d} className={d === targetRow ? "target" : undefined}>
                  <th scope="row">{fmtNum(d, units.lengthUnit === "ft" ? 0 : 1)}</th>
                  {row.map((c, i) => (
                    <td key={i} className={[i === mainCol ? "now" : "", c.ok && c.counterFt > config.leadcoreLengthFt ? "backing" : ""].join(" ").trim() || undefined}>
                      {c.ok ? fmtLen(units, c.counterFt) : "–"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Italic numbers are past your leadcore, so they include backing. Based on {sum.n === 0 ? "starting estimates" : `${sum.n} reading${sum.n === 1 ? "" : "s"}`}
          {sum.n >= 4 ? `: a new reading is typically within about ±${Math.max(1, Math.round(sum.looRmsPct))}% of this` : ""}.
        </p>
      </section>
    </>
  );
}
