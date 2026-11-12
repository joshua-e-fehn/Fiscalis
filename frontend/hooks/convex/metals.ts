import { useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMetalsPrices } from "@/hooks/metals";
import {
  MetalsPrices,
  MetalItemWithValuation,
  MetalsType,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
import {
  convertAtSpotRates,
  resolvePremiums,
  summarizeMetalItems,
  valueMetalItem,
  type MetalsPortfolioSummary,
  type SpotExchangeRates,
} from "@/../services/finance/metals";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Return type for useMetals hook */
interface UseMetalsReturn {
  items: MetalItemWithValuation[] | undefined;
  isLoading: boolean;
  isError: boolean;
  pricesLoading: boolean;
  pricesError: Error | null;
  prices: MetalsPrices | undefined;
  /** The exchange rates a USD or CHF view needs are still loading */
  ratesLoading: boolean;
  /** When the oldest spot price an item is valued at was observed (ms) */
  spotAsOf: number | null;
}

/** Return type for useMetalsSummary hook */
interface UseMetalsSummaryReturn {
  /** Unrealized, realized and total P/L; undefined until prices load */
  summary: MetalsPortfolioSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  pricesLoading: boolean;
  /** When the oldest spot price used was observed (ms); null without one */
  pricesAsOf: number | null;
}

/** Return type for useMetalItem hook */
interface UseMetalItemReturn {
  item: MetalItemWithValuation | undefined;
  transactions:
    | typeof api.vault.getVaultItemTransactions._returnType
    | undefined;
  isLoading: boolean;
  isError: boolean;
  pricesLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * A vault item in the display currency, from its server valuation
 * (vault.getUserVaultItems: EUR at the Convex spot mirror, the valuation
 * net worth uses). Value, cost and realized P/L are converted at the rates
 * the spot prices are served with (convertAtSpotRates); nothing is revalued
 * from the client price feed.
 */
function enrichItemWithValuation(
  item: NonNullable<typeof api.vault.getUserVaultItems._returnType>[number],
  rates: SpotExchangeRates | undefined,
  currency: MetalsCurrency = "eur",
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
    amount === null ? null : convertAtSpotRates(amount, from, currency, rates);
  const unitCost = toDisplay(averageCost, costCurrency);

  const valuation = valueMetalItem(
    { fineWeightGrams: item.fineWeightGrams, quantity, buyPremium, sellPremium },
    item.valuation,
    currency,
    rates,
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
    averageCost,
    // An unreplayable ledger's sales have an unknown realized P/L
    realizedProfitLoss:
      ledger?.realizedComplete === true
        ? toDisplay(ledger.realizedProfitLoss, "EUR")
        : null,
    soldCost: toDisplay(ledger?.soldCost ?? 0, "EUR") ?? 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Main metals hook: the vault items with their server valuation (EUR at the
 * Convex spot mirror) in the display currency. The client price feed only
 * supplies the exchange rates for a USD or CHF view.
 */
export function useMetals(currency: MetalsCurrency = "eur"): UseMetalsReturn {
  const metalItems = useQuery(api.vault.getUserVaultItems);

  // Prices from the time-series store: their exchange rates convert the
  // EUR valuation (and the Prices tab shows them)
  const {
    data: prices,
    isLoading: pricesLoading,
    isError: pricesError,
    error,
  } = useMetalsPrices();
  const rates = prices?.all?.exchangeRates;

  const enrichedItems = useMemo(
    () =>
      metalItems?.map((item) => enrichItemWithValuation(item, rates, currency)),
    [metalItems, rates, currency],
  );

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
    isLoading: metalItems === undefined,
    isError: metalItems === undefined && !pricesLoading,
    pricesLoading,
    pricesError: pricesError ? (error as Error) : null,
    prices,
    // The EUR view needs no rates; another currency waits for them
    ratesLoading: currency !== "eur" && pricesLoading,
    spotAsOf,
  };
}

/**
 * Metals summary hook: per-metal and total value, cost, unrealized and
 * realized P/L and allocation of the server-valued items.
 */
export function useMetalsSummary(
  currency: MetalsCurrency = "eur",
): UseMetalsSummaryReturn {
  const { items, isLoading, isError, pricesLoading, ratesLoading, spotAsOf } =
    useMetals(currency);

  // Unrealized cost and P/L cover only items with a cost (see
  // summarizeMetalItems), total P/L adds realized sales. Gated on the
  // rates in a USD or CHF view: before they load no value converts.
  const summary = useMemo(
    () => (items && !ratesLoading ? summarizeMetalItems(items) : undefined),
    [items, ratesLoading],
  );

  return {
    summary,
    isLoading: isLoading || ratesLoading,
    isError,
    pricesLoading,
    pricesAsOf: spotAsOf,
  };
}

/**
 * Single metal item hook with full details and transactions
 */
export function useMetalItem(
  itemId: Id<"vaultItems">,
  currency: MetalsCurrency = "eur",
): UseMetalItemReturn {
  // Fetch item details from Convex
  const item = useQuery(api.vault.getVaultItem, { vaultItemId: itemId });

  // Fetch transactions for this item
  const transactions = useQuery(api.vault.getVaultItemTransactions, {
    vaultItemId: itemId,
  });

  // Exchange rates for a USD or CHF view
  const { data: prices, isLoading: pricesLoading } = useMetalsPrices();

  // Enrich item with valuation
  const enrichedItem = item
    ? enrichItemWithValuation(item, prices?.all?.exchangeRates, currency)
    : undefined;

  return {
    item: enrichedItem,
    transactions,
    isLoading: item === undefined || transactions === undefined,
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
