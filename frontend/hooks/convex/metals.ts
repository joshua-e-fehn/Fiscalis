import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMetalsPrices, getSpotPrice } from "@/hooks/metals";
import {
  MetalsPrices,
  MetalItemWithValuation,
  MetalsSummary,
  MetalsType,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
import {
  resolvePremiums,
  summarizeMetalItems,
  valueMetalItem,
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
}

/** Return type for useMetalsSummary hook */
interface UseMetalsSummaryReturn {
  summary: MetalsSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  pricesLoading: boolean;
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
 * Enrich a metal item with current valuations
 */
function enrichItemWithValuation(
  item: NonNullable<typeof api.vault.getUserVaultItems._returnType>[number],
  prices: MetalsPrices | undefined,
  currency: MetalsCurrency = "eur",
): MetalItemWithValuation {
  // Spot price per ounce from /api/metals/prices/all/latest, valued with
  // the same staleness policy and formula as the server (services/finance/metals).
  const spotPrice = prices
    ? getSpotPrice(prices, item.metalType as MetalsType, currency)
    : null;
  const spotTimestamp = prices?.all?.timestamp
    ? Date.parse(prices.all.timestamp)
    : null;

  const { buyPremium, sellPremium } = resolvePremiums({
    // `premium` is the legacy single-premium field on old documents
    buy: [item.buyPremium, (item as { premium?: number }).premium],
    sell: [item.sellPremium],
  });

  const valuation = valueMetalItem(
    {
      fineWeightGrams: item.fineWeightGrams,
      quantity: item.quantity,
      buyPremium,
      sellPremium,
      purchasePricePerUnit: item.purchasePricePerUnit ?? undefined,
    },
    { pricePerOunce: spotPrice, sourceTimestamp: spotTimestamp },
    Date.now(),
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
    quantity: item.quantity,
    buyPremium,
    sellPremium,
    purchasePricePerUnit: item.purchasePricePerUnit ?? undefined,
    purchaseDate: item.purchaseDate ?? undefined,
    purchaseCurrency: item.purchaseCurrency ?? undefined,
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
  };
}

// ═══════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Main metals hook - combines Convex data with Supabase prices
 *
 * Returns metal items enriched with current market valuations
 * calculated using live spot prices from Supabase.
 */
export function useMetals(currency: MetalsCurrency = "eur"): UseMetalsReturn {
  // Fetch metal items from Convex
  const metalItems = useQuery(api.vault.getUserVaultItems);

  // Fetch prices from Supabase
  const {
    data: prices,
    isLoading: pricesLoading,
    isError: pricesError,
    error,
  } = useMetalsPrices();

  // Enrich items with valuations
  const enrichedItems = metalItems?.map((item) =>
    enrichItemWithValuation(item, prices, currency),
  );

  return {
    items: enrichedItems,
    isLoading: metalItems === undefined,
    isError: metalItems === undefined && !pricesLoading,
    pricesLoading,
    pricesError: pricesError ? (error as Error) : null,
    prices,
  };
}

/**
 * Metals summary hook - aggregated portfolio statistics
 *
 * Calculates total portfolio value, per-metal breakdowns,
 * and allocation percentages using live Supabase prices.
 */
export function useMetalsSummary(
  currency: MetalsCurrency = "eur",
): UseMetalsSummaryReturn {
  // Get all items with valuations
  const { items, isLoading, isError, pricesLoading } = useMetals(currency);

  // Per-metal and total summary; cost and P/L cover only items with a
  // purchase price (see summarizeMetalItems).
  const summary: MetalsSummary | undefined = items
    ? summarizeMetalItems(items)
    : undefined;

  return {
    summary,
    isLoading,
    isError,
    pricesLoading,
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

  // Fetch prices from Supabase
  const { data: prices, isLoading: pricesLoading } = useMetalsPrices();

  // Enrich item with valuation
  const enrichedItem = item
    ? enrichItemWithValuation(
        item as NonNullable<
          typeof api.vault.getUserVaultItems._returnType
        >[number],
        prices,
        currency,
      )
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
