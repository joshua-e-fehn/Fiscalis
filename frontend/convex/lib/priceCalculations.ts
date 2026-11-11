/**
 * Precious-metal valuation now lives in services/finance/metals.ts (pure,
 * unit-tested, shared with the hooks and the continuous strategy). This
 * module only re-exports it for the Convex functions and components that
 * still import it from here; new code imports services/finance/metals.
 */
export * from "../../../services/finance/metals";
