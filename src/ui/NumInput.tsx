import { useId, useState } from "react";
import { fromDisplay, parseDecimal, round, toDisplay, type UnitDef } from "../state/units";

interface Props {
  label: string;
  /** Canonical value (ft, mph, lb…); null shows an empty box. */
  value: number | null;
  onChange: (v: number | null) => void;
  /** Display unit: the value is converted when shown and when typed. Omit for plain numbers. */
  unit?: UnitDef;
  /** Unit label for plain numbers, e.g. "lb" or "oz". */
  suffix?: string;
  /** Allowed range, in canonical units. Typed values outside it are flagged and not applied. */
  min?: number;
  max?: number;
  /** Most decimals shown / kept (default: the unit's, else 1). */
  decimals?: number;
  /** An empty box is a valid answer (sets null). */
  optional?: boolean;
  /** Show − / + buttons (nudge by the unit's step), plus ±big with "big". */
  stepper?: boolean | "big";
  /** Step in display units when there is no unit. */
  step?: number;
  hint?: string;
  placeholder?: string;
}

const show = (n: number, decimals: number) => String(Number(n.toFixed(decimals)));

export function NumInput(props: Props) {
  const { unit, value, min, max, optional } = props;
  const decimals = props.decimals ?? unit?.decimals ?? 1;
  const step = unit?.step ?? props.step ?? 1;
  const bigStep = unit?.bigStep ?? step * 5;
  const id = useId();
  const [text, setText] = useState<string | null>(null);

  const toShown = (canon: number) => (unit ? toDisplay(unit, canon) : canon);
  const toCanon = (disp: number) => (unit ? fromDisplay(unit, disp) : disp);
  const shown = text ?? (value === null ? "" : show(toShown(value), decimals));

  // What the box currently holds, for the red outline and for deciding whether to apply it.
  let invalid = false;
  if (text !== null) {
    if (text.trim() === "") invalid = !optional;
    else {
      const n = parseDecimal(text);
      const canon = n === null ? NaN : toCanon(n);
      invalid = n === null || (min !== undefined && canon < min - 1e-9) || (max !== undefined && canon > max + 1e-9);
    }
  }

  const edit = (raw: string) => {
    setText(raw);
    if (raw.trim() === "") {
      if (optional) props.onChange(null);
      return;
    }
    const n = parseDecimal(raw);
    if (n === null) return;
    const canon = toCanon(n);
    if ((min !== undefined && canon < min - 1e-9) || (max !== undefined && canon > max + 1e-9)) return;
    props.onChange(round(canon, 4));
  };

  const nudge = (amount: number) => {
    const current = value === null ? (min !== undefined ? toShown(min) : 0) : toShown(value);
    let next = round(current + amount, Math.max(decimals, 2));
    if (min !== undefined) next = Math.max(next, round(toShown(min), 2));
    if (max !== undefined) next = Math.min(next, round(toShown(max), 2));
    setText(null);
    props.onChange(round(toCanon(next), 4));
  };

  const label = props.suffix || unit ? `${props.label} (${unit?.label ?? props.suffix})` : props.label;
  const btn = (sign: 1 | -1, amount: number, big: boolean) => (
    <button
      type="button"
      className={big ? "step big" : "step"}
      aria-label={`${sign > 0 ? "Increase" : "Decrease"} ${props.label.toLowerCase()} by ${show(amount, 2)}`}
      onClick={() => nudge(sign * amount)}
    >
      {sign > 0 ? "+" : "−"}
      {big ? show(amount, 2) : ""}
    </button>
  );

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={props.stepper ? "numrow" : undefined}>
        {props.stepper === "big" && btn(-1, bigStep, true)}
        {props.stepper && btn(-1, step, false)}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          value={shown}
          placeholder={props.placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={props.hint ? `${id}-hint` : undefined}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => edit(e.target.value)}
          onBlur={() => setText(null)}
        />
        {props.stepper && btn(1, step, false)}
        {props.stepper === "big" && btn(1, bigStep, true)}
      </div>
      {props.hint && (
        <span className="hint" id={`${id}-hint`}>
          {props.hint}
        </span>
      )}
    </div>
  );
}
