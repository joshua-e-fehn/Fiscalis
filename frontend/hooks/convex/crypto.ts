"use client";

/**
 * Crypto Hooks
 *
 * Crypto is an asset class aggregated across all providers (brokers + Bitpanda)
 * via the unified `categories.getCrypto` / `categories.getCryptoTransactions`
 * queries. (Vezgo has been removed.)
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { createElement } from "react";
import { api } from "@/convex/_generated/api";
import {
  CategorySummary,
  SubcategoryData,
  PortfolioDataPoint,
  Holding,
} from "@/lib/types/investments";
import {
  cryptoSubcategoryUI,
  cryptoDisplayGroups,
  makeSubcategoryBase,
} from "@/lib/config/categoryUI";

// ═══════════════════════════════════════════════════════════════
// SHARED TYPES / HELPERS
// ═══════════════════════════════════════════════════════════════

/** A unified crypto position as returned by `categories.getCrypto`. */
interface CryptoPosition {
  _id: string;
  symbol: string;
  name?: string;
  quantity: number;
  marketValue?: number;
  valueInBaseCurrency?: number;
  investmentSubcategory?: string;
  totalCostBasis?: number;
  unrealizedPL?: number;
}

function positionValue(p: CryptoPosition): number {
  return p.valueInBaseCurrency ?? p.marketValue ?? 0;
}

/** Map a position's investment subcategory to the crypto display bucket. */
function displayBucket(
  subcategory?: string,
): "btc-eth" | "altcoins" | "stablecoins" | "defi" {
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

/** Raw unified crypto data (positions + summary) for the current user. */
export function useCryptoData() {
  return useQuery(api.categories.getCrypto);
}

/** All crypto positions across providers. */
export function useCryptoPositions(): CryptoPosition[] {
  const data = useCryptoData();
  return (data?.positions as CryptoPosition[] | undefined) ?? [];
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

function mapPositionsToHoldings(
  positions: CryptoPosition[],
  subcategoryId: string,
  totalValue: number,
): Holding[] {
  return positions
    .slice()
    .sort((a, b) => positionValue(b) - positionValue(a))
    .slice(0, 5)
    .map((p, idx) => {
      const value = positionValue(p);
      return {
        id: p._id || `${subcategoryId}-${idx}`,
        name: p.name || p.symbol,
        subcategoryId,
        value,
        costBasis: p.totalCostBasis ?? null,
        profitLoss: p.unrealizedPL ?? null,
        profitLossPercent:
          p.totalCostBasis && p.unrealizedPL
            ? (p.unrealizedPL / p.totalCostBasis) * 100
            : null,
        allocationPercent: totalValue > 0 ? (value / totalValue) * 100 : 0,
      };
    });
}

/**
 * Crypto category summary aggregated across providers, grouped into the
 * display buckets BTC & ETH / Altcoins / Stablecoins / DeFi.
 */
export function useCryptoSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  const data = useCryptoData();

  const summary = useMemo<CategorySummary | null>(() => {
    if (data === undefined || data === null) return null;

    const positions = (data.positions as CryptoPosition[]) ?? [];

    const buckets: Record<string, CryptoPosition[]> = {
      "btc-eth": [],
      altcoins: [],
      stablecoins: [],
      defi: [],
    };
    for (const position of positions) {
      buckets[displayBucket(position.investmentSubcategory)].push(position);
    }

    const bucketTotal = (key: string) =>
      buckets[key].reduce((sum, p) => sum + positionValue(p), 0);

    const btcEthTotal = bucketTotal("btc-eth");
    const altcoinTotal = bucketTotal("altcoins");
    const stablecoinTotal = bucketTotal("stablecoins");
    const defiTotal = bucketTotal("defi");
    const cryptoTotal =
      btcEthTotal + altcoinTotal + stablecoinTotal + defiTotal;

    const btcEthGroup = cryptoDisplayGroups[0]; // merged BTC + ETH card

    const subcategories: SubcategoryData[] = [
      {
        id: "btc-eth",
        name: btcEthGroup.title,
        href: btcEthGroup.href,
        icon: createElement(btcEthGroup.icon, { className: "h-4 w-4" }),
        color: btcEthGroup.color,
        totalValue: btcEthTotal,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: mapPositionsToHoldings(
          buckets["btc-eth"],
          "btc-eth",
          btcEthTotal,
        ),
        holdingsCount: buckets["btc-eth"].length,
        implemented: true,
      },
      {
        ...makeSubcategoryBase("altcoins", cryptoSubcategoryUI.altcoins),
        totalValue: altcoinTotal,
        topHoldings: mapPositionsToHoldings(
          buckets.altcoins,
          "altcoins",
          altcoinTotal,
        ),
        holdingsCount: buckets.altcoins.length,
        implemented: true,
      },
      {
        ...makeSubcategoryBase("stablecoins", cryptoSubcategoryUI.stablecoins),
        totalValue: stablecoinTotal,
        topHoldings: mapPositionsToHoldings(
          buckets.stablecoins,
          "stablecoins",
          stablecoinTotal,
        ),
        holdingsCount: buckets.stablecoins.length,
        implemented: true,
      },
      {
        ...makeSubcategoryBase("defi", cryptoSubcategoryUI.defi),
        totalValue: defiTotal,
        topHoldings: mapPositionsToHoldings(buckets.defi, "defi", defiTotal),
        holdingsCount: buckets.defi.length,
        implemented: true,
      },
    ];

    const historyDataPoints: PortfolioDataPoint[] = [];

    return {
      totalValue: cryptoTotal,
      totalCost: null,
      profitLoss: null,
      profitLossPercent: null,
      ytdProfitLoss: null,
      ytdProfitLossPercent: null,
      valueAtYearStart: null,
      subcategories,
      historyDataPoints,
    };
  }, [data]);

  return { summary, isLoading: data === undefined };
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
 * Crypto positions aggregated by symbol for allocation charts.
 */
export function useCryptoPositionAllocations(maxPositions: number = 8): {
  allocations: PositionAllocation[];
  totalValue: number;
  isLoading: boolean;
} {
  const data = useCryptoData();

  const result = useMemo(() => {
    const positions = (data?.positions as CryptoPosition[]) ?? [];
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

    const totalValue = sorted.reduce((sum, p) => sum + p.value, 0);

    const THRESHOLD_PERCENT = 2;
    const significant: typeof sorted = [];
    let otherValue = 0;
    for (const position of sorted) {
      const percentage =
        totalValue > 0 ? (position.value / totalValue) * 100 : 0;
      if (
        percentage >= THRESHOLD_PERCENT &&
        significant.length < maxPositions - 1
      ) {
        significant.push(position);
      } else {
        otherValue += position.value;
      }
    }

    const top = significant;
    if (otherValue > 0) {
      top.push({ symbol: "OTHER", name: "Other (<2%)", value: otherValue });
    }

    const allocations: PositionAllocation[] = top.map((p, index) => ({
      symbol: p.symbol,
      name: p.name,
      value: p.value,
      percentage: totalValue > 0 ? (p.value / totalValue) * 100 : 0,
      color: positionColors[index % positionColors.length],
    }));

    return { allocations, totalValue };
  }, [data, maxPositions]);

  return {
    allocations: result.allocations,
    totalValue: result.totalValue,
    isLoading: data === undefined,
  };
}
