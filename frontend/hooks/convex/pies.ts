import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useDisplayCurrency } from "./displayCurrency";

/**
 * Pies (convex/pies.ts): target-allocation strategies. The server returns
 * EUR; these hooks convert the amounts to the display currency once and tag
 * the result with `currency`, so components only format.
 */

/**
 * The user's pies with target vs actual weight and drift per slice, money
 * in the display currency; undefined while loading.
 */
export function usePies() {
  const pies = useQuery(api.pies.list);
  const { fromEur, currency, isLoading } = useDisplayCurrency();
  const converted = pies?.map((pie) => ({
    ...pie,
    totalValue: fromEur(pie.totalValue),
    slices: pie.slices.map((slice) => ({
      ...slice,
      actualValue: fromEur(slice.actualValue),
      rebalance: fromEur(slice.rebalance),
      holdings: slice.holdings.map((h) => ({ ...h, value: fromEur(h.value) })),
    })),
  }));
  return {
    pies: isLoading ? undefined : converted,
    currency,
  };
}

export type PieView = NonNullable<ReturnType<typeof usePies>["pies"]>[number];

/** The holdings a slice can name, largest first; undefined while loading. */
export function usePieHoldings(enabled = true) {
  return useQuery(api.pies.holdings, enabled ? {} : "skip");
}

export function useCreatePie() {
  return useMutation(api.pies.create);
}

export function useUpdatePie() {
  return useMutation(api.pies.update);
}

export function useRemovePie() {
  return useMutation(api.pies.remove);
}
