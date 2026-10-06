import type { RigConfig } from "./types";

export interface LineOut {
  leadcoreOutFt: number;
  backingOutFt: number;
}

export function splitCounter(counterFt: number, leadcoreLengthFt: number): LineOut {
  const c = Math.max(counterFt, 0);
  return {
    leadcoreOutFt: Math.min(c, leadcoreLengthFt),
    backingOutFt: Math.max(c - leadcoreLengthFt, 0),
  };
}

/** Sparse feature vector (param name -> value) for ln(depth / leadcoreOut). */
export function features(cfg: RigConfig, out: LineOut): Map<string, number> {
  const f = new Map<string, number>();
  const set = (k: string, v: number) => f.set(k, (f.get(k) ?? 0) + v);
  const p = `line:${cfg.lineId}:`;
  const lnSpeed = Math.log(cfg.speedMph / 2);
  const leaderUnits = cfg.leader.lengthFt / 50;

  set(p + "icpt", 1);
  set(p + "speed", lnSpeed);
  set(p + "lnLen", Math.log(Math.max(out.leadcoreOutFt, 1) / 150));
  if (cfg.lure.weightOz !== undefined) set(p + "lureWt", cfg.lure.weightOz - 1);
  set(p + "backing", out.backingOutFt / 100);

  set(`leader:${cfg.leader.material}`, leaderUnits);
  if (cfg.leader.testLb) {
    set("leader:testLb", leaderUnits * Math.log(cfg.leader.testLb / 12));
  }

  set(`lureType:${cfg.lure.type}:icpt`, 1);
  set(`lureType:${cfg.lure.type}:speed`, lnSpeed);
  set(`lure:${cfg.lure.id}:icpt`, 1);
  set(`lure:${cfg.lure.id}:speed`, lnSpeed);

  if (cfg.attractor) {
    set(`attType:${cfg.attractor.type}:icpt`, 1);
    set(`att:${cfg.attractor.id}:icpt`, 1);
  }
  if (cfg.rigId) set(`rig:${cfg.rigId}:icpt`, 1);
  return f;
}
