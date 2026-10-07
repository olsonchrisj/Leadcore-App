/**
 * Forward model: rig configuration + line out -> predicted lure depth.
 *
 * ln(depth_ft) = ln(physical cable solution) + discrepancy
 *
 * The physical part is the towed-cable model in cable.ts, with three learned
 * log-multipliers: on the line constant K (how hard the line sinks), on the
 * lure's drag area and on the attractor's drag area. The discrepancy is a small
 * linear correction (offset, speed slope, length slope, per-rig / per-lure
 * offsets) that soaks up whatever the physics doesn't capture, kept tight by
 * its priors.
 */
import { solveCable, RHO_W, G, type CableSegment, type EndBody } from "./cable";
import {
  ATTRACTOR_TYPES,
  BACKING,
  DEFAULT_LEADER_TEST_LB,
  FT,
  HARDWARE,
  LEADER_CDN,
  LEADER_CFT,
  LEADER_MATERIALS,
  LURE_TYPES,
  MPH,
  OZ,
  REF_LEADCORE_FT,
  REF_SPEED_MPH,
  lineSpec,
} from "./catalog";
import type { LureRef, RigConfig } from "./types";

/** Parameter names (keys of the fitted vector). */
export const P = {
  lnK: (line: string) => `phys:line:${line}:lnK`,
  typeDrag: (t: string) => `phys:lureType:${t}:lnDrag`,
  lureDrag: (id: string) => `phys:lure:${id}:lnDrag`,
  attTypeDrag: (t: string) => `phys:attType:${t}:lnDrag`,
  attDrag: (id: string) => `phys:att:${id}:lnDrag`,
  /** Global: scale on the lure's net downward force (weight in water + dive force). */
  lnDown: "phys:global:lnDown",
  /** Global: scale on the leader's drag. */
  lnLeader: "phys:global:lnLeader",
  c0: "disc:c0",
  c1: "disc:c1",
  c2: "disc:c2",
  rig: (id: string) => `disc:rig:${id}`,
  lureOff: (id: string) => `disc:lure:${id}`,
  typeOff: (t: string) => `disc:lureType:${t}`,
};

export interface PhysMults {
  lnK: number;
  lnLure: number;
  lnAtt: number;
  lnDown: number;
  lnLeader: number;
}

export const NO_MULTS: PhysMults = { lnK: 0, lnLure: 0, lnAtt: 0, lnDown: 0, lnLeader: 0 };

/** Lure drag area at nominal multiplier, adjusted for size information when we have it. */
export function lureCda(lure: LureRef): number {
  const t = LURE_TYPES[lure.type];
  let f = 1;
  if ((lure.type === "crankbait" || lure.type === "stickbait") && lure.ratedDiveFt) {
    f = (1 + 0.12 * lure.ratedDiveFt) / (1 + 0.12 * 8);
  } else if ((lure.type === "crankbait" || lure.type === "stickbait" || lure.type === "plug") && lure.lengthIn) {
    f = Math.pow(lure.lengthIn / 3, 1.5);
  } else if (lure.weightOz) {
    f = Math.pow(lure.weightOz / t.defaultOz, 2 / 3);
  }
  return t.cda * Math.min(3.5, Math.max(0.5, f));
}

function leaderSegment(cfg: RigConfig, lnLeader: number): CableSegment | null {
  const L = cfg.leader.lengthFt * FT;
  if (!(L > 0)) return null;
  const m = LEADER_MATERIALS[cfg.leader.material] ?? LEADER_MATERIALS.other;
  const d =
    cfg.leader.diameterMm !== undefined
      ? cfg.leader.diameterMm * 1e-3
      : m.dPerSqrtLb * Math.sqrt(cfg.leader.testLb ?? DEFAULT_LEADER_TEST_LB);
  const w = (m.rho - RHO_W) * G * Math.PI * 0.25 * d * d;
  return { length: L, w, d, cdn: LEADER_CDN * Math.exp(lnLeader), cft: LEADER_CFT };
}

export interface Cable {
  segments: CableSegment[];
  end: EndBody;
  speed: number; // m/s
  leadcoreOutFt: number;
  backingOutFt: number;
}

export function buildCable(cfg: RigConfig, counterFt: number, m: PhysMults = NO_MULTS): Cable {
  const speed = cfg.speedMph * MPH;
  const q = 0.5 * RHO_W * speed * speed;
  const c = Math.max(counterFt, 0);
  const leadcoreOutFt = Math.min(c, cfg.leadcoreLengthFt);
  const backingOutFt = Math.max(c - cfg.leadcoreLengthFt, 0);

  // end body: lure + attractor + hardware
  const lt = LURE_TYPES[cfg.lure.type];
  const cdaLure = lureCda(cfg.lure) * Math.exp(m.lnLure);
  const massKg = (cfg.lure.weightOz ?? lt.defaultOz) * OZ;
  let cdaAtt = 0;
  let wAtt = 0;
  if (cfg.attractor) {
    const at = ATTRACTOR_TYPES[cfg.attractor.type];
    cdaAtt = at.cda * Math.exp(m.lnAtt);
    wAtt = at.weightN;
  }
  const drag = q * (cdaLure + cdaAtt + HARDWARE.cda);
  const down = Math.exp(m.lnDown) * (lt.netWeightFrac * massKg * G + lt.hookN + wAtt + HARDWARE.weightN + lt.dive * q * cdaLure);

  const line = lineSpec(cfg.lineId);
  const K = line.K * Math.exp(m.lnK);
  const wLine = K * K * 0.5 * RHO_W * line.cdn * line.d;
  const segments: CableSegment[] = [];
  const ls = leaderSegment(cfg, m.lnLeader);
  if (ls) segments.push(ls);
  segments.push({ length: leadcoreOutFt * FT, w: wLine, d: line.d, cdn: line.cdn, cft: line.cft });
  if (backingOutFt > 0) {
    const wB = (BACKING.rho - RHO_W) * G * Math.PI * 0.25 * BACKING.d * BACKING.d;
    segments.push({ length: backingOutFt * FT, w: wB, d: BACKING.d, cdn: BACKING.cdn, cft: BACKING.cft });
  }
  return { segments, end: { drag, down }, speed, leadcoreOutFt, backingOutFt };
}

export function physDepthFt(cfg: RigConfig, counterFt: number, m: PhysMults = NO_MULTS): number {
  const cab = buildCable(cfg, counterFt, m);
  return solveCable(cab.speed, cab.segments, cab.end).depth / FT;
}

const MIN_DEPTH_FT = 0.05;
const lnPhys = (cfg: RigConfig, counterFt: number, m: PhysMults) =>
  Math.log(Math.max(physDepthFt(cfg, counterFt, m), MIN_DEPTH_FT));

/** Every learned parameter this configuration touches (same keys as logDepthGrad's gradient). */
export function paramNamesFor(cfg: RigConfig): string[] {
  const out = [
    P.lnK(cfg.lineId),
    P.typeDrag(cfg.lure.type),
    P.lureDrag(cfg.lure.id),
    P.lnDown,
    P.c0,
    P.c1,
    P.c2,
    P.lureOff(cfg.lure.id),
    P.typeOff(cfg.lure.type),
  ];
  if (cfg.leader.lengthFt > 0) out.push(P.lnLeader);
  if (cfg.attractor) out.push(P.attTypeDrag(cfg.attractor.type), P.attDrag(cfg.attractor.id));
  if (cfg.rigId) out.push(P.rig(cfg.rigId));
  return out;
}

/** Linear discrepancy terms: [parameter name, feature value]. */
export function discTerms(cfg: RigConfig, counterFt: number): [string, number][] {
  const lc = Math.max(Math.min(counterFt, cfg.leadcoreLengthFt), 1);
  const out: [string, number][] = [
    [P.c0, 1],
    [P.c1, Math.log(cfg.speedMph / REF_SPEED_MPH)],
    [P.c2, Math.log(lc / REF_LEADCORE_FT)],
    [P.lureOff(cfg.lure.id), 1],
    [P.typeOff(cfg.lure.type), 1],
  ];
  if (cfg.rigId) out.push([P.rig(cfg.rigId), 1]);
  return out;
}

export type Getter = (name: string) => number;

export function multsFrom(cfg: RigConfig, get: Getter): PhysMults {
  return {
    lnK: get(P.lnK(cfg.lineId)),
    lnLure: get(P.typeDrag(cfg.lure.type)) + get(P.lureDrag(cfg.lure.id)),
    lnAtt: cfg.attractor ? get(P.attTypeDrag(cfg.attractor.type)) + get(P.attDrag(cfg.attractor.id)) : 0,
    lnDown: get(P.lnDown),
    lnLeader: get(P.lnLeader),
  };
}

/** ln(predicted depth in ft). */
export function logDepth(cfg: RigConfig, counterFt: number, get: Getter): number {
  let y = lnPhys(cfg, counterFt, multsFrom(cfg, get));
  for (const [name, v] of discTerms(cfg, counterFt)) y += get(name) * v;
  return y;
}

export interface Gradient {
  /** ln depth at the current parameters. */
  y: number;
  /** Sparse derivative: parameter name -> ∂y/∂param. */
  grad: Map<string, number>;
}

const FD = 1e-4;

/** ln depth and its derivatives with respect to every parameter the configuration touches. */
export function logDepthGrad(cfg: RigConfig, counterFt: number, get: Getter): Gradient {
  const m = multsFrom(cfg, get);
  const y0 = lnPhys(cfg, counterFt, m);
  const grad = new Map<string, number>();
  const add = (n: string, v: number) => grad.set(n, (grad.get(n) ?? 0) + v);

  const dK = (lnPhys(cfg, counterFt, { ...m, lnK: m.lnK + FD }) - y0) / FD;
  add(P.lnK(cfg.lineId), dK);
  const dL = (lnPhys(cfg, counterFt, { ...m, lnLure: m.lnLure + FD }) - y0) / FD;
  add(P.typeDrag(cfg.lure.type), dL);
  add(P.lureDrag(cfg.lure.id), dL);
  if (cfg.attractor) {
    const dA = (lnPhys(cfg, counterFt, { ...m, lnAtt: m.lnAtt + FD }) - y0) / FD;
    add(P.attTypeDrag(cfg.attractor.type), dA);
    add(P.attDrag(cfg.attractor.id), dA);
  }
  add(P.lnDown, (lnPhys(cfg, counterFt, { ...m, lnDown: m.lnDown + FD }) - y0) / FD);
  if (cfg.leader.lengthFt > 0) add(P.lnLeader, (lnPhys(cfg, counterFt, { ...m, lnLeader: m.lnLeader + FD }) - y0) / FD);
  let y = y0;
  for (const [name, v] of discTerms(cfg, counterFt)) {
    y += get(name) * v;
    add(name, v);
  }
  return { y, grad };
}
