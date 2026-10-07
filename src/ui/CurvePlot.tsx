import { useMemo } from "react";
import { predictDepth, type FittedModel, type RigConfig } from "../engine";
import { fmtLen, toDisplay, type Units } from "../state/units";

interface Props {
  model: FittedModel;
  config: RigConfig;
  units: Units;
  targetFt: number;
  /** Counter that reaches the target, when it's reachable. */
  plannedCounterFt: number | null;
  /** Logged readings to overlay. */
  points: { counterFt: number; depthFt: number }[];
}

const W = 340;
const H = 224;
const ML = 40;
const MR = 12;
const MT = 12;
const MB = 34;

/** A tick step (in display units) that gives roughly `count` ticks over `range`. */
export function niceStep(range: number, count: number): number {
  const raw = range / Math.max(count, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

/** Depth versus line out for the current rig and speed, with the model's 80% band and your own readings. */
export function CurvePlot({ model, config, units, targetFt, plannedCounterFt, points }: Props) {
  const maxC = config.leadcoreLengthFt + 80;
  const samples = useMemo(() => {
    const N = 40;
    return Array.from({ length: N + 1 }, (_, i) => {
      const c = Math.max(0.5, (maxC * i) / N);
      const p = predictDepth(model, config, c);
      return { c, d: p.depthFt, lo: p.lowFt, hi: p.highFt };
    });
  }, [model, config, maxC]);

  const maxDepthFt = Math.max(...samples.map((s) => s.hi), targetFt * 1.1);
  const len = units.length;
  const yStep = niceStep(toDisplay(len, maxDepthFt), 5);
  const yTop = Math.ceil(toDisplay(len, maxDepthFt) / yStep) * yStep; // display units
  const maxD = yTop / len.perCanonical; // ft
  const xStep = niceStep(toDisplay(len, maxC), 6);

  const x = (c: number) => ML + (c / maxC) * (W - ML - MR);
  const y = (d: number) => MT + (d / maxD) * (H - MT - MB);

  const xTicks: number[] = [];
  for (let v = 0; v <= toDisplay(len, maxC) + 1e-9; v += xStep) xTicks.push(v / len.perCanonical);
  const yTicks: number[] = [];
  for (let v = 0; v <= yTop + 1e-9; v += yStep) yTicks.push(v / len.perCanonical);

  const band =
    "M" + samples.map((s) => `${x(s.c).toFixed(1)},${y(s.lo).toFixed(1)}`).join("L") +
    "L" + [...samples].reverse().map((s) => `${x(s.c).toFixed(1)},${y(s.hi).toFixed(1)}`).join("L") + "Z";
  const line = "M" + samples.map((s) => `${x(s.c).toFixed(1)},${y(s.d).toFixed(1)}`).join("L");
  const unit = len.label;
  const visible = points.filter((p) => p.counterFt <= maxC && p.depthFt <= maxD);

  const alt =
    `Depth against line out at ${config.speedMph.toFixed(1)} mph. ` +
    (plannedCounterFt !== null ? `About ${fmtLen(units, plannedCounterFt)} ${unit} of line reaches ${fmtLen(units, targetFt)} ${unit}.` : "The target depth is out of reach for this rig.");

  return (
    <svg className="plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt}>
      {yTicks.map((d) => (
        <g key={`y${d}`}>
          <line className="plot-grid" x1={ML} x2={W - MR} y1={y(d)} y2={y(d)} />
          <text className="plot-label" x={ML - 6} y={y(d) + 4} textAnchor="end">
            {Math.round(toDisplay(len, d))}
          </text>
        </g>
      ))}
      {xTicks.map((c) => (
        <g key={`x${c}`}>
          <line className="plot-grid" x1={x(c)} x2={x(c)} y1={MT} y2={H - MB} />
          <text className="plot-label" x={x(c)} y={H - MB + 15} textAnchor="middle">
            {Math.round(toDisplay(len, c))}
          </text>
        </g>
      ))}
      <text className="plot-axis" x={(ML + W - MR) / 2} y={H - 4} textAnchor="middle">
        Line out ({unit})
      </text>
      <text className="plot-axis" transform={`translate(10 ${(MT + H - MB) / 2}) rotate(-90)`} textAnchor="middle">
        Depth ({unit})
      </text>

      {config.leadcoreLengthFt < maxC && (
        <g>
          <line className="plot-backing" x1={x(config.leadcoreLengthFt)} x2={x(config.leadcoreLengthFt)} y1={MT} y2={H - MB} />
          <text className="plot-label" x={x(config.leadcoreLengthFt) + 4} y={MT + 10}>
            backing
          </text>
        </g>
      )}

      <path className="plot-band" d={band} />
      <path className="plot-line" d={line} />

      {targetFt <= maxD && <line className="plot-target" x1={ML} x2={W - MR} y1={y(targetFt)} y2={y(targetFt)} />}
      {plannedCounterFt !== null && plannedCounterFt <= maxC && (
        <>
          <line className="plot-target" x1={x(plannedCounterFt)} x2={x(plannedCounterFt)} y1={MT} y2={H - MB} />
          <circle className="plot-mark" cx={x(plannedCounterFt)} cy={y(targetFt)} r="4.5" />
        </>
      )}
      {visible.map((p, i) => (
        <circle key={i} className="plot-dot" cx={x(p.counterFt)} cy={y(p.depthFt)} r="3.2" />
      ))}
    </svg>
  );
}
