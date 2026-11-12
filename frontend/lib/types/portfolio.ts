/**
 * Portfolio Types
 *
 * Provider vocabulary shared by the unified positions table and the
 * provider hooks. Net worth and allocations come from the server aggregate
 * (convex/lib/netWorth.ts).
 */

/**
 * Supported financial data providers
 */
export type FinancialProvider = "plaid" | "snaptrade" | "bitpanda" | "manual";
