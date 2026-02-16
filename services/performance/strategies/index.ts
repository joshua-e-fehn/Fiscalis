/**
 * Performance Strategies
 *
 * Strategy pattern implementations for different asset value types.
 */

// Strategy types and interfaces
export {
  // Input types
  type PerformanceCalculationOptions,
  type DiscretePerformanceInput,
  type ContinuousPerformanceInput,
  type HybridPerformanceInput,

  // Strategy interfaces
  type IPerformanceStrategy,
  type IDiscretePerformanceStrategy,
  type IContinuousPerformanceStrategy,
  type IHybridPerformanceStrategy,

  // Context types
  type CalculationContext,
  type DataPointGenerationResult,
} from "./types";

// Base strategy class
export { BasePerformanceStrategy } from "./base";

// Discrete strategy (snapshot-based)
export {
  DiscretePerformanceStrategy,
  calculateDiscretePerformance,
  getDiscreteStrategy,
} from "./discrete";

// Continuous strategy (price-based)
export {
  ContinuousPerformanceStrategy,
  calculateContinuousPerformance,
  getContinuousStrategy,
} from "./continuous";

// Hybrid strategy (combined)
export {
  HybridPerformanceStrategy,
  calculateHybridPerformance,
  getHybridStrategy,
  type PerformanceBreakdown,
  type HybridPerformanceResult,
} from "./hybrid";
