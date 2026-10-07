/** Public units: feet, miles per hour, ounces, pounds-test. (The solver works in SI internally.) */

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
  /** Overrides the diameter implied by material and test, mm. */
  diameterMm?: number;
}

export type LureType =
  | "spoon"
  | "crankbait"
  | "stickbait"
  | "diver"
  | "plug"
  | "softbait"
  | "spinner";

export type AttractorType = "flasher" | "dodger" | "fly" | "other";

export interface LureRef {
  /** Unique id, e.g. "reef-runner-ripplin-minnow-3.5". Curves are fit per id. */
  id: string;
  type: LureType;
  weightOz?: number;
  /** Body length, inches, when known (scales the drag prior for hard baits). */
  lengthIn?: number;
  /** Maker's rated maximum dive depth, ft (a proxy for bill size and drag). */
  ratedDiveFt?: number;
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
  /** ISO timestamp. */
  takenAt?: string;
}

export interface PriorSpec {
  mean: number;
  sd: number;
}

export interface FitOptions {
  /** Observation noise sd on ln(depth). Default 0.07 (~7%). */
  sigma?: number;
  /** Re-estimate sigma from the residuals (needs a handful of readings). */
  estimateNoise?: boolean;
  /** Huber threshold in sigmas; readings beyond it are down-weighted. Default 2. */
  huber?: number;
  /** A previous fit to start from: far fewer iterations when one reading is added. */
  init?: FitStart;
}

/** The part of a fit that is useful as a starting point (what the app caches between sessions). */
export type FitStart = Pick<FittedModel, "paramNames" | "mean" | "sigma">;

export interface RowDiagnostic {
  /** Index into the observations array that was passed to fitModel. */
  index: number;
  counterFt: number;
  depthFt: number;
  predictedFt: number;
  /** (observed - predicted) / predicted, percent. */
  errPct: number;
  /** Residual in noise sds. */
  z: number;
  /** Leave-one-out error, percent: how wrong a model fit without this reading would have been. */
  looErrPct: number;
  /** Robust weight actually used in the fit (1 = full). */
  weight: number;
  /** Looks like a mistyped or unusual reading. */
  flagged: boolean;
}

export interface DataRange {
  speedMph: [number, number];
  counterFt: [number, number];
}

export interface FittedModel {
  paramNames: string[];
  /** Posterior mean of every learned parameter. */
  mean: number[];
  /** Posterior covariance (Laplace approximation), row-major. */
  cov: number[][];
  /** Noise sd on ln(depth). */
  sigma: number;
  nObservations: number;
  skipped: { index: number; reason: string }[];
  rows: RowDiagnostic[];
  dataRange: DataRange | null;
  converged: boolean;
  iterations: number;
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
  /** The target is shallower than this rig runs even with almost no line out. */
  tooShallow: boolean;
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
