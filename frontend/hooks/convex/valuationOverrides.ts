import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Per-asset valuation overrides (convex/valuationOverrides.ts, ENG-239):
 * a manual price or a mark-to-model for one broker position or Bitpanda
 * holding. The override's value reaches every figure through the shared
 * loader (portfolio.getUnifiedPositions `valuation`, the category pages,
 * the snapshots); these hooks only write it.
 */

/** The holding an override is for, as the positions table knows it. */
export type ValuationHoldingRef =
  | { source: "brokerPosition"; id: Id<"brokerPositions"> }
  | { source: "bitpanda"; id: Id<"bitpandaHoldings"> };

/**
 * The ref of a positions-table row, or undefined for a source without
 * overrides. The id comes from the server (getUnifiedPositions `_id`), so
 * the cast only restores its table type; the mutations check ownership.
 */
export function valuationHoldingRef(
  source: string,
  id: string,
): ValuationHoldingRef | undefined {
  if (source === "brokerPosition") {
    return { source, id: id as Id<"brokerPositions"> };
  }
  if (source === "bitpanda") {
    return { source, id: id as Id<"bitpandaHoldings"> };
  }
  return undefined;
}

export function useSetValuationOverride() {
  return useMutation(api.valuationOverrides.set);
}

export function useClearValuationOverride() {
  return useMutation(api.valuationOverrides.clear);
}
