import { useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMetalsPrices } from "@/hooks/metals";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";
import {
  MetalsPrices,
  MetalItemWithValuation,
  MetalsType,
} from "@/lib/types/metals-extended";
import type { MetalsDisplayCurrency, SpotQuotes } from "@/lib/types/metals";
import {
  resolvePremiums,
  spotQuoteIn,
  summarizeMetalItems,
  valueMetalItem,
  vaultDisplayRates,
  type MetalsPortfolioSummary,
  type SpotExchangeRates,
} from "@/../services/finance/metals";
import { convertBetween } from "@/../services/finance/currency";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Return type for useMetals hook */
interface UseMetalsReturn {
  items: MetalItemWithValuation[] | undefined;
  /** The display currency every amount of `items` and `spotPrices` is in */
  currency: MetalsDisplayCurrency;
  isLoading: boolean;
  isError: boolean;
  pricesLoading: boolean;
  pricesError: Error | null;
  /** The raw price feed (quote columns EUR/USD/CHF), for the Prices tab */
  prices: MetalsPrices | undefined;
  /** Spot quotes in the display currency (native columns, else EUR × rate) */
  spotPrices: SpotQuotes | undefined;
  /** The display currency's rate is still loading */
  ratesLoading: boolean;
  /** When the oldest spot price an item is valued at was observed (ms) */
  spotAsOf: number | null;
}

/** Return type for useMetalsSummary hook */
interface UseMetalsSummaryReturn {
  /** Unrealized, realized and total P/L; undefined until prices load */
  summary: MetalsPortfolioSummary | undefined;
  /** The display currency the summary is in */
  currency: MetalsDisplayCurrency;
  isLoading: boolean;
  isError: boolean;
  pricesLoading: boolean;
  /** When the oldest spot price used was observed (ms); null without one */
  pricesAsOf: number | null;
}

/** Return type for useMetalItem hook */
interface UseMetalItemReturn {
  item: MetalItemWithValuation | undefined;
  /** The display currency the item's amounts are in */
  currency: MetalsDisplayCurrency;
  transactions:
    | typeof api.vault.getVaultItemTransactions._returnType
    | undefined;
  isLoading: boolean;
  isError: boolean;
  pricesLoading: boolean;
}

const METALS: readonly MetalsType[] = ["gold", "silver", "platinum", "palladium"];

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * A vault item in the display currency, from its server valuation
 * (vault.getUserVaultItems: EUR at the Convex spot mirror, the valuation
 * net worth uses). Value, cost and realized P/L are converted through
 * convertBetween at `unitsPerEur` (vaultDisplayRates: the display rate,
 * plus the spot payload's USD/CHF rates for legacy costs); nothing is
 * revalued from the client price feed. The ledger cost is historical EUR
 * translated at today's rate, like every other display-currency P/L.
 */
function enrichItemWithValuation(
  item: NonNullable<typeof api.vault.getUserVaultItems._returnType>[number],
  unitsPerEur: Readonly<Record<string, number>>,
  currency: MetalsDisplayCurrency,
): MetalItemWithValuation {
  const { buyPremium, sellPremium } = resolvePremiums({
    // `premium` is the legacy single-premium field on old documents
    buy: [item.buyPremium, (item as { premium?: number }).premium],
    sell: [item.sellPremium],
  });

  // Quantity and average cost from the item's replayed ledger; the cached
  // item fields only when the ledger cannot be replayed
  const { ledger } = item;
  const quantity = ledger ? ledger.quantity : item.quantity;
  const averageCost = ledger
    ? ledger.averageCost
    : (item.purchasePricePerUnit ?? null);
  // The ledger is in EUR; the cached fields in their purchase currency
  const costCurrency = ledger ? "EUR" : (item.purchaseCurrency ?? "EUR");

  // Unknown when a rate is missing
  const toDisplay = (amount: number | null, from: string) =>
    amount === null ? null : convertBetween(amount, from, currency, unitsPerEur);
  const unitCost = toDisplay(averageCost, costCurrency);
  const toEur = (amount: number | null, from: string) =>
    amount === null ? null : convertBetween(amount, from, "EUR", unitsPerEur);

  const valuation = valueMetalItem(
    { fineWeightGrams: item.fineWeightGrams, quantity, buyPremium, sellPremium },
    item.valuation,
    currency,
    unitsPerEur,
  );

  return {
    _id: item._id,
    userId: item.userId,
    catalogItemId: item.catalogItemId ?? undefined,
    customName: item.customName ?? undefined,
    metalType: item.metalType as MetalsType,
    category: item.category as "coin" | "bar" | "jewelry" | "scrap",
    purity: item.purity,
    weightGrams: item.weightGrams,
    fineWeightGrams: item.fineWeightGrams,
    quantity,
    buyPremium,
    sellPremium,
    purchasePricePerUnit: unitCost ?? undefined,
    purchaseDate: item.purchaseDate ?? undefined,
    // The unit cost above, converted to the display currency
    purchaseCurrency: currency.toUpperCase(),
    storageLocation: item.storageLocation ?? undefined,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    displayName: item.displayName,
    catalogItem: item.catalogItem
      ? {
          name: item.catalogItem.name,
          country: item.catalogItem.country ?? undefined,
          mint: item.catalogItem.mint ?? undefined,
          imageUrl: item.catalogItem.imageUrl ?? undefined,
        }
      : undefined,
    ...valuation,
    // EUR, as documented (sale previews convert it): an unreplayable
    // item's cached cost is in its purchase currency, so it is converted
    // too, and unknown without a rate
    averageCost: toEur(averageCost, costCurrency),
    // An unreplayable ledger's sales have an unknown realized P/L
    realizedProfitLoss:
      ledger?.realizedComplete === true
        ? toDisplay(ledger.realizedProfitLoss, "EUR")
        : null,
    soldCost: toDisplay(ledger?.soldCost ?? 0, "EUR") ?? 0,
  };
}

/**
 * The display currency and the rates a vault view converts with
 * (vaultDisplayRates). While the display rate loads, the currency is EUR
 * at the identity with `ratesLoading` set (useDisplayCurrency).
 */
function useVaultRates(spot: SpotExchangeRates | undefined) {
  const display = useDisplayCurrency();
  const { code, unitsPerEur: displayRate } = display;
  const unitsPerEur = useMemo(
    () => vaultDisplayRates(spot, { code, unitsPerEur: displayRate }),
    [spot, code, displayRate],
  );
  return {
    currency: display.currency,
    displayRate,
    unitsPerEur,
    ratesLoading: display.isLoading,
  };
}

// ═══════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Main metals hook: the vault items with their server valuation (EUR at the
 * Convex spot mirror) in the display currency, and the spot quotes in it.
 * The client price feed supplies the quotes and the USD/CHF rates of legacy
 * item costs.
 */
export function useMetals(): UseMetalsReturn {
  const metalItems = useQuery(api.vault.getUserVaultItems);

  // Prices from the time-series store: the quotes and the Prices tab
  const {
    data: prices,
    isLoading: pricesLoading,
    isError: pricesError,
    error,
  } = useMetalsPrices();
  const { currency, displayRate, unitsPerEur, ratesLoading } = useVaultRates(
    prices?.all?.exchangeRates,
  );

  const enrichedItems = useMemo(
    () =>
      metalItems?.map((item) =>
        enrichItemWithValuation(item, unitsPerEur, currency),
      ),
    [metalItems, unitsPerEur, currency],
  );

  // Native quote columns for EUR/USD/CHF, the EUR quote × rate otherwise
  const all = prices?.all;
  const spotPrices = useMemo((): SpotQuotes | undefined => {
    if (!all) return undefined;
    const quotes = {} as SpotQuotes;
    for (const metal of METALS) {
      quotes[metal] = spotQuoteIn(all[metal], currency, displayRate);
    }
    return quotes;
  }, [all, currency, displayRate]);

  // When the oldest spot price an item is valued at was observed
  const spotAsOf = useMemo(() => {
    const observed = (metalItems ?? []).flatMap((item) =>
      item.valuation.pricedAtSpot && item.valuation.spot
        ? [item.valuation.spot.sourceTimestamp]
        : [],
    );
    return observed.length > 0 ? Math.min(...observed) : null;
  }, [metalItems]);

  return {
    items: enrichedItems,
    currency,
    // Loading until the display rate arrives, so no view shows the
    // identity (EUR) figures first
    isLoading: metalItems === undefined || ratesLoading,
    isError: metalItems === undefined && !pricesLoading,
    pricesLoading,
    pricesError: pricesError ? (error as Error) : null,
    prices,
    spotPrices,
    ratesLoading,
    spotAsOf,
  };
}

/**
 * Metals summary hook: per-metal and total value, cost, unrealized and
 * realized P/L and allocation of the server-valued items, in the display
 * currency.
 */
export function useMetalsSummary(): UseMetalsSummaryReturn {
  const {
    items,
    currency,
    isLoading,
    isError,
    pricesLoading,
    ratesLoading,
    spotAsOf,
  } = useMetals();

  // Unrealized cost and P/L cover only items with a cost (see
  // summarizeMetalItems), total P/L adds realized sales. Gated on the
  // display rate: before it loads no value converts.
  const summary = useMemo(
    () => (items && !ratesLoading ? summarizeMetalItems(items) : undefined),
    [items, ratesLoading],
  );

  return {
    summary,
    currency,
    isLoading,
    isError,
    pricesLoading,
    pricesAsOf: spotAsOf,
  };
}

/**
 * Single metal item hook with full details and transactions, the item in
 * the display currency (transactions keep their own currency)
 */
export function useMetalItem(itemId: Id<"vaultItems">): UseMetalItemReturn {
  // Fetch item details from Convex
  const item = useQuery(api.vault.getVaultItem, { vaultItemId: itemId });

  // Fetch transactions for this item
  const transactions = useQuery(api.vault.getVaultItemTransactions, {
    vaultItemId: itemId,
  });

  // USD/CHF rates of a legacy item cost
  const { data: prices, isLoading: pricesLoading } = useMetalsPrices();
  const { currency, unitsPerEur, ratesLoading } = useVaultRates(
    prices?.all?.exchangeRates,
  );

  // Enrich item with valuation
  const enrichedItem = item
    ? enrichItemWithValuation(item, unitsPerEur, currency)
    : undefined;

  return {
    item: enrichedItem,
    currency,
    transactions,
    isLoading:
      item === undefined || transactions === undefined || ratesLoading,
    isError: false,
    pricesLoading,
  };
}

// ═══════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════

/** Add item from catalog */
export function useAddMetalItemFromCatalog() {
  return useMutation(api.vault.addVaultItemFromCatalog);
}

/** Add custom item */
export function useAddCustomMetalItem() {
  return useMutation(api.vault.addCustomVaultItem);
}

/** Update metal item */
export function useUpdateMetalItem() {
  return useMutation(api.vault.updateVaultItem);
}

/** Delete metal item */
export function useDeleteMetalItem() {
  return useMutation(api.vault.deleteVaultItem);
}

/** Add transaction */
export function useAddMetalTransaction() {
  return useMutation(api.vault.addTransaction);
}

/** Delete transaction */
export function useDeleteMetalTransaction() {
  return useMutation(api.vault.deleteTransaction);
}

// ═══════════════════════════════════════════════════════════════
// TRANSACTION HOOKS
// ═══════════════════════════════════════════════════════════════

/** Transaction from Convex with item enrichment */
export type VaultTransaction = NonNullable<
  typeof api.vault.getUserTransactions._returnType
>[number];

/** Return type for useVaultTransactions hook */
interface UseVaultTransactionsReturn {
  transactions: VaultTransaction[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Get all transactions for a user (for history page)
 */
export function useVaultTransactions(
  limit?: number,
): UseVaultTransactionsReturn {
  const transactions = useQuery(api.vault.getUserTransactions, { limit });

  return {
    transactions,
    isLoading: transactions === undefined,
    isError: false,
  };
}
