"use client";

/**
 * Crypto Hooks
 *
 * Crypto is an asset class aggregated across all providers (brokers + Bitpanda)
 * via the unified `categories.getCrypto` / `categories.getCryptoTransactions`
 * queries. (Vezgo has been removed.)
 *
 * The server values positions in EUR; these hooks return them in the
 * display currency at the latest rate (`currency`). A position's native
 * amounts (marketValue, prices) and transactions stay in their own currency.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { createElement } from "react";
import { api } from "@/convex/_generated/api";
import type { CategoryPosition } from "@/convex/categories";
import {
  CategorySummary,
  InvestmentCurrency,
  SubcategoryData,
} from "@/lib/types/investments";
import {
  cryptoSubcategoryUI,
  cryptoDisplayGroups,
  makeSubcategoryBase,
} from "@/lib/config/categoryUI";
import {
  groupSmallSlices,
  positionToHolding,
  positionValue,
  summarizeHoldings,
} from "@/../services/portfolio/categorySummary";
import {
  categorySummaryInCurrency,
  fromEur,
  scaleMoney,
} from "@/../services/finance/displayCurrency";
import { useDisplayCurrency } from "./displayCurrency";
import {
  summaryProfitLoss,
  toCategorySummary,
  toTopHoldings,
} from "./categorySummary";

// ═══════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════

type CryptoBucket = "btc-eth" | "altcoins" | "stablecoins" | "defi";

/** Map a position's investment subcategory to the crypto display bucket. */
function displayBucket(subcategory?: string): CryptoBucket {
  switch (subcategory) {
    case "bitcoin":
    case "ethereum":
      return "btc-eth";
    case "stablecoins":
      return "stablecoins";
    case "defi":
      return "defi";
    default:
      return "altcoins";
  }
}

// ═══════════════════════════════════════════════════════════════
// DATA HOOKS
// ═══════════════════════════════════════════════════════════════

/** Raw unified crypto data (positions + summary, EUR) for the current user. */
export function useCryptoData() {
  return useQuery(api.categories.getCrypto);
}

/**
 * EUR fields of a crypto position. A broker position may have all three; a
 * Bitpanda holding has valueInBaseCurrency and, when its trades give one,
 * costBasisInBaseCurrency (convex/lib/netWorth.ts). Absent fields stay absent.
 */
const BASE_FIELDS = [
  "valueInBaseCurrency",
  "costBasisInBaseCurrency",
  "unrealizedPLInBaseCurrency",
] as const;

/**
 * All crypto positions across providers, their base-currency fields
 * (valueInBaseCurrency, costBasisInBaseCurrency, …) in the display
 * currency; undefined while loading.
 */
export function useCryptoPositions(): CategoryPosition[] | undefined {
  const positions = useCryptoData()?.positions;
  const display = useDisplayCurrency();
  const { unitsPerEur } = display;
  return useMemo(() => {
    if (positions === undefined || display.isLoading) return undefined;
    if (unitsPerEur === 1) return positions;
    return positions.map(
      (p): CategoryPosition => scaleMoney(p, BASE_FIELDS, unitsPerEur),
    );
  }, [positions, display.isLoading, unitsPerEur]);
}

/**
 * A Bitpanda position whose price did not come from the latest sync: stale
 * (an earlier sync's price, as of `asOf`) or missing (never priced, so it
 * has no value). Null for a live price and for broker positions.
 */
export function positionPriceIssue(
  position: CategoryPosition,
): { status: "stale"; asOf?: number } | { status: "missing" } | null {
  if (position.provider !== "bitpanda") return null;
  if (position.priceStatus === "stale") {
    return { status: "stale", asOf: position.priceAsOf };
  }
  if (position.priceStatus === "missing") return { status: "missing" };
  return null;
}

/** Whether the user holds any crypto. */
export function useHasCryptoHoldings(): boolean {
  const data = useCryptoData();
  return (data?.positions?.length ?? 0) > 0;
}

/** Unified crypto transactions across providers. */
export function useCryptoTransactions(limit?: number) {
  return useQuery(api.categories.getCryptoTransactions, { limit });
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY SUMMARY (for the crypto dashboard)
// ═══════════════════════════════════════════════════════════════

const btcEthGroup = cryptoDisplayGroups[0]; // merged BTC + ETH card

/** Display buckets in card order, with their (empty) card. */
const BUCKETS: { id: CryptoBucket; base: SubcategoryData }[] = [
  {
    id: "btc-eth",
    base: {
      ...makeSubcategoryBase("btc-eth", cryptoSubcategoryUI.bitcoin),
      name: btcEthGroup.title,
      href: btcEthGroup.href,
      icon: createElement(btcEthGroup.icon, { className: "h-4 w-4" }),
      color: btcEthGroup.color,
    },
  },
  {
    id: "altcoins",
    base: makeSubcategoryBase("altcoins", cryptoSubcategoryUI.altcoins),
  },
  {
    id: "stablecoins",
    base: makeSubcategoryBase("stablecoins", cryptoSubcategoryUI.stablecoins),
  },
  { id: "defi", base: makeSubcategoryBase("defi", cryptoSubcategoryUI.defi) },
];

/**
 * Crypto category summary aggregated across providers, grouped into the
 * display buckets BTC & ETH / Altcoins / Stablecoins / DeFi. Cost basis and
 * P/L cover only positions that report a cost basis (broker crypto).
 */
export function useCryptoSummary(): {
  summary: CategorySummary | null;
  currency: InvestmentCurrency;
  isLoading: boolean;
} {
  const data = useCryptoData();
  const display = useDisplayCurrency();
  const { unitsPerEur } = display;

  const summary = useMemo<CategorySummary | null>(() => {
    // No figures until the rate is known
    if (data == null || display.isLoading) return null;
    const { positions, summary: total } = data;

    const subcategories = BUCKETS.map(({ id, base }): SubcategoryData => {
      const inBucket = positions.filter(
        (p) => displayBucket(p.investmentSubcategory) === id,
      );
      const bucket = summarizeHoldings(inBucket.map(positionToHolding));
      return {
        ...base,
        totalValue: bucket.value,
        ...summaryProfitLoss(bucket),
        topHoldings: toTopHoldings(
          inBucket,
          id,
          bucket.value,
          5,
          (p) => p.name || p.symbol,
        ),
        holdingsCount: bucket.count,
        implemented: true,
      };
    });

    return categorySummaryInCurrency(
      toCategorySummary(total, subcategories),
      unitsPerEur,
    );
  }, [data, display.isLoading, unitsPerEur]);

  return {
    summary,
    currency: display.currency,
    isLoading: data === undefined || display.isLoading,
  };
}

// ═══════════════════════════════════════════════════════════════
// POSITION ALLOCATION (for the allocation chart)
// ═══════════════════════════════════════════════════════════════

const positionColors = [
  "#F7931A",
  "#627EEA",
  "#14F195",
  "#E84142",
  "#8247E5",
  "#00D1FF",
  "#FF007A",
  "#2775CA",
  "#26A17B",
  "#FF9500",
];

export interface PositionAllocation {
  symbol: string;
  name: string;
  value: number;
  percentage: number;
  color: string;
}

/**
 * Crypto positions aggregated by symbol for allocation charts, values in
 * the display currency (`currency`).
 */
export function useCryptoPositionAllocations(maxPositions: number = 8): {
  allocations: PositionAllocation[];
  totalValue: number;
  currency: InvestmentCurrency;
  isLoading: boolean;
} {
  const data = useCryptoData();
  const display = useDisplayCurrency();
  const { unitsPerEur } = display;

  const result = useMemo(() => {
    // No figures until the rate is known
    const positions = display.isLoading ? [] : (data?.positions ?? []);
    if (positions.length === 0) {
      return { allocations: [] as PositionAllocation[], totalValue: 0 };
    }

    const symbolMap = new Map<string, { name: string; value: number }>();
    for (const position of positions) {
      const symbol = position.symbol.toUpperCase();
      const existing = symbolMap.get(symbol);
      const value = positionValue(position);
      if (existing) {
        existing.value += value;
      } else {
        symbolMap.set(symbol, { name: position.name || symbol, value });
      }
    }

    const sorted = Array.from(symbolMap.entries())
      .map(([symbol, d]) => ({ symbol, ...d }))
      .sort((a, b) => b.value - a.value);

    const THRESHOLD_PERCENT = 2;
    const { shown, otherValue, total } = groupSmallSlices(sorted, {
      thresholdPercent: THRESHOLD_PERCENT,
      maxSlices: maxPositions,
    });
    const top =
      otherValue > 0
        ? [...shown, { symbol: "OTHER", name: "Other (<2%)", value: otherValue }]
        : shown;

    // Shares are scale-invariant: computed on EUR, amounts converted
    const allocations: PositionAllocation[] = top.map((p, index) => ({
      symbol: p.symbol,
      name: p.name,
      value: fromEur(p.value, unitsPerEur),
      percentage: total > 0 ? (p.value / total) * 100 : 0,
      color: positionColors[index % positionColors.length],
    }));

    return { allocations, totalValue: fromEur(total, unitsPerEur) };
  }, [data, display.isLoading, maxPositions, unitsPerEur]);

  return {
    allocations: result.allocations,
    totalValue: result.totalValue,
    currency: display.currency,
    isLoading: data === undefined || display.isLoading,
  };
}
