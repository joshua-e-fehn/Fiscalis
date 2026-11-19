import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Bank depot trades imported from a DKB CSV export (convex/depotTrades.ts).
 * The holdings they make count through the shared loader; these hooks list
 * and write the trades themselves.
 */

export function useDepotTrades() {
  return useQuery(api.depotTrades.listDepotTrades);
}

export function useImportDepotTrades() {
  return useMutation(api.depotTrades.importDepotTrades);
}

export function useDeleteDepotTrade() {
  return useMutation(api.depotTrades.deleteDepotTrade);
}
