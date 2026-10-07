/**
 * Steady towed-cable model.
 *
 * A flexible line is towed at speed U. We integrate its shape from the end body
 * (lure, attractor, hardware) back to the tow point, arc length u measured from
 * the body. With θ the angle of the line below horizontal and T its tension:
 *
 *   dT/du = w sinθ + f_t            weight along the line + skin friction
 *   dθ/du = (w cosθ − f_n) / T      weight across the line vs normal drag
 *   dz/du = sinθ                    depth gained going back toward the boat
 *   dx/du = cosθ
 *
 *   f_n = ½ρ C_dn d U² sinθ|sinθ|              normal drag per metre
 *   f_t = ½ρ C_ft π d U² cosθ|cosθ|            tangential drag per metre
 *
 * w is the submerged weight per metre (negative for a line that floats). The body
 * at the end is in equilibrium: T0 cosθ0 = drag, T0 sinθ0 = downward force, which
 * is where lure drag, lure weight and any bill/dive force enter.
 *
 * Far from the body a long line settles to a terminal slope where normal drag
 * balances the normal weight component (sin²θ / cosθ = K²/U² with
 * K² = w / (½ρ C_dn d)), so depth ≈ L·K/U for a long line, the familiar
 * "feet of depth per colour, shallower when you go faster".
 *
 * The step grid depends only on segment lengths, never on the state, so the
 * result is a smooth function of every physical parameter (finite-difference
 * Jacobians in the fitter rely on this).
 *
 * SI units throughout: metres, newtons, seconds, radians.
 */

export const RHO_W = 1000; // kg/m³, fresh water
export const G = 9.80665;

export interface CableSegment {
  /** Length, m. */
  length: number;
  /** Submerged weight per metre, N/m (negative: buoyant). */
  w: number;
  /** Diameter, m. */
  d: number;
  /** Normal drag coefficient (based on d). */
  cdn: number;
  /** Tangential friction coefficient (based on wetted area π d). */
  cft: number;
}

export interface EndBody {
  /** Hydrodynamic drag on the end body, N (acts aft). */
  drag: number;
  /** Net downward force on the end body, N (weight in water + dive force). */
  down: number;
}

export interface CableSolution {
  /** Vertical distance from the tow point down to the end body, m. */
  depth: number;
  /** Horizontal distance, tow point to end body, m. */
  setback: number;
  /** Tension at the tow point, N. */
  towTension: number;
  /** Line angle below horizontal at the tow point, rad. */
  towAngle: number;
  /** Line angle below horizontal at the end body, rad. */
  endAngle: number;
  steps: number;
}

const T_FLOOR = 0.05; // N, keeps dθ/du finite for a body with almost no pull
const TH_MAX = 1.5700; // 89.95°
const H0 = 0.02; // m, first step
const H_GROW = 1.25; // step growth per step
const H_MAX = 1.5; // m

/** Step sizes from the body to the boat, landing exactly on every segment boundary. */
function stepSchedule(ends: number[], growth = H_GROW, h0 = H0, hMax = H_MAX): number[] {
  const out: number[] = [];
  let u = 0;
  let k = 0;
  let si = 0;
  const total = ends[ends.length - 1] ?? 0;
  while (u < total - 1e-12 && si < ends.length) {
    let h = Math.min(hMax, h0 * Math.pow(growth, k));
    const segEnd = ends[si]!;
    if (u + h >= segEnd - 1e-9) {
      h = segEnd - u;
      si++;
    }
    if (h > 0) {
      out.push(h);
      u += h;
      k++;
    }
  }
  return out;
}

const k1 = new Float64Array(4);
const k2 = new Float64Array(4);
const k3 = new Float64Array(4);
const k4 = new Float64Array(4);

function deriv(T: number, th: number, seg: CableSegment, q: number, out: Float64Array): void {
  const s = Math.sin(th);
  const c = Math.cos(th);
  const Tn = T < T_FLOOR ? T_FLOOR : T;
  out[0] = seg.w * s + q * seg.cft * Math.PI * seg.d * c * Math.abs(c);
  out[1] = (seg.w * c - q * seg.cdn * seg.d * s * Math.abs(s)) / Tn;
  out[2] = s;
  out[3] = c;
}

export interface SolveOptions {
  /** Refinement for convergence tests: smaller = finer. */
  stepScale?: number;
}

/**
 * @param speed  tow speed, m/s
 * @param segments  ordered from the end body back toward the boat (e.g. leader, leadcore, backing)
 */
export function solveCable(
  speed: number,
  segments: CableSegment[],
  end: EndBody,
  opts: SolveOptions = {},
): CableSolution {
  const segs = segments.filter((s) => s.length > 0);
  const q = 0.5 * RHO_W * speed * speed;
  let T = Math.max(Math.hypot(end.drag, end.down), T_FLOOR);
  let th = Math.max(-TH_MAX, Math.min(TH_MAX, Math.atan2(end.down, end.drag)));
  const th0 = th;
  let z = 0;
  let x = 0;
  if (segs.length === 0) {
    return { depth: 0, setback: 0, towTension: T, towAngle: th, endAngle: th0, steps: 0 };
  }
  const ends: number[] = [];
  let acc = 0;
  for (const s of segs) {
    acc += s.length;
    ends.push(acc);
  }
  const sc = opts.stepScale ?? 1;
  const hs = stepSchedule(ends, 1 + (H_GROW - 1) * sc, H0 * sc, H_MAX * sc);

  let u = 0;
  let si = 0;
  for (const h of hs) {
    while (si < segs.length - 1 && u >= ends[si]! - 1e-9) si++;
    const seg = segs[si]!;
    deriv(T, th, seg, q, k1);
    deriv(T + 0.5 * h * k1[0]!, th + 0.5 * h * k1[1]!, seg, q, k2);
    deriv(T + 0.5 * h * k2[0]!, th + 0.5 * h * k2[1]!, seg, q, k3);
    deriv(T + h * k3[0]!, th + h * k3[1]!, seg, q, k4);
    T += (h / 6) * (k1[0]! + 2 * k2[0]! + 2 * k3[0]! + k4[0]!);
    th += (h / 6) * (k1[1]! + 2 * k2[1]! + 2 * k3[1]! + k4[1]!);
    z += (h / 6) * (k1[2]! + 2 * k2[2]! + 2 * k3[2]! + k4[2]!);
    x += (h / 6) * (k1[3]! + 2 * k2[3]! + 2 * k3[3]! + k4[3]!);
    if (T < T_FLOOR) T = T_FLOOR;
    if (th > TH_MAX) th = TH_MAX;
    else if (th < -TH_MAX) th = -TH_MAX;
    u += h;
  }
  return { depth: z, setback: x, towTension: T, towAngle: th, endAngle: th0, steps: hs.length };
}

/** Terminal slope sinθ of a long line: sin²θ / cosθ = (K/U)². */
export function terminalSin(K: number, speed: number): number {
  const r = (K / speed) ** 2;
  // s² = r·sqrt(1−s²)  →  solve by fixed point (converges fast for r ≲ 1)
  let s = Math.min(Math.sqrt(r), 0.999);
  for (let i = 0; i < 60; i++) s = Math.sqrt(r * Math.sqrt(Math.max(1 - s * s, 1e-12)));
  return Math.min(s, 0.999999);
}

/** K = speed at which a long line of this construction would hang vertically. */
export function kFromSlope(sinTheta: number, speed: number): number {
  return speed * Math.sqrt(sinTheta * sinTheta / Math.sqrt(1 - sinTheta * sinTheta));
}
