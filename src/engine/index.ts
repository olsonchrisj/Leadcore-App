export * from "./types";

/** Bump whenever the physics or the starting catalogue changes, so cached fits from older versions are ignored. */
export const ENGINE_VERSION = 3;
export * from "./units";
export { fitModel } from "./fit";
export {
  predictDepth,
  solveCounter,
  depthChart,
  summarize,
  suggestNextReading,
  referenceRate,
  type ChartCell,
  type FitSummary,
  type NextReading,
  type SuggestBounds,
  type LineRate,
  type SolveOptions,
} from "./predict";
export { LINES, LURE_TYPES, ATTRACTOR_TYPES, LEADER_MATERIALS } from "./catalog";
