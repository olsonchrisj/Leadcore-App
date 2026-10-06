/** Internal units: feet, miles per hour, ounces, pounds-test. */

export type LeaderMaterial =
  | "fluorocarbon"
  | "monofilament"
  | "braid"
  | "wire"
  | "other";

export interface Leader {
  material: LeaderMaterial;
  lengthFt: number;
  testLb?: number;
}

export type LureType =
  | "spoon"
  | "crankbait"
  | "stickbait"
  | "diver"
  | "plug"
  | "softbait";

export type AttractorType = "flasher" | "dodger" | "fly" | "other";

export interface LureRef {
  /** Unique id, e.g. "reef-runner-ripplin-minnow-3.5". Curves are fit per id. */
  id: string;
  type: LureType;
  weightOz?: number;
}

export interface AttractorRef {
  id: string;
  type: AttractorType;
}

/** Everything about a presentation except the line-out being solved for. */
export interface RigConfig {
  lineId: string;
  /** Total leadcore spooled, ft. Counter beyond this means backing is out. */
  leadcoreLengthFt: number;
  speedMph: number;
  lure: LureRef;
  attractor?: AttractorRef;
  leader: Leader;
  /** Optional id so one rod/reel/setup can learn its own offset. */
  rigId?: string;
}

/** One logged observation, e.g. a LiveScope reading. */
export interface Observation extends RigConfig {
  id?: string;
  /** Counter reading in feet (zeroed when leadcore reaches the rod tip). */
  counterFt: number;
  /** Observed lure depth, ft. */
  depthFt: number;
  /** Relative reliability, default 1 (higher = trusted more). */
  quality?: number;
}

export interface PriorSpec {
  mean: number;
  sd: number;
}

export interface FitOptions {
  /** Observation noise sd on ln(depth). Default 0.07 (~7%). */
  sigma?: number;
  /** Re-estimate sigma from residuals (empirical Bayes). Default false. */
  estimateNoise?: boolean;
}

export interface FittedModel {
  paramNames: string[];
  mean: number[];
  /** Posterior covariance, row-major p x p. */
  cov: number[][];
  sigma: number;
  nObservations: number;
  skipped: { index: number; reason: string }[];
  /** Params held at a physical bound during the fit. */
  pinned: string[];
}

export interface DepthPrediction {
  depthFt: number;
  /** 80% predictive band. */
  lowFt: number;
  highFt: number;
  sdLog: number;
  leadcoreOutFt: number;
  backingOutFt: number;
  warnings: string[];
}

export interface CounterSolution {
  achievable: boolean;
  counterFt: number;
  /** Counter for the shallow/deep ends of the 80% band. */
  counterForHighFt: number;
  counterForLowFt: number;
  leadcoreOutFt: number;
  backingOutFt: number;
  colors: number;
  predictedDepthFt: number;
  warnings: string[];
}
