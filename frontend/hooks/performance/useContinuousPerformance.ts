/**
 * Continuous (price-based) performance of the vault: the one history engine
 * for the vault. The metals page chart (useVaultPerformance) runs it alone;
 * every other measure that includes the vault, such as the commodities
 * category or the vault source alone (useMetalsYTD), gets it through
 * useCategoryPerformance.
 *
 * useVaultPerformanceInput loads what the continuous strategy values the
 * vault from: each item's ledger lots as holdings (quantity held at t, sales
 * as outflows, services/finance/metalsLedger.ts), each held metal's price
 * history and the live spot. useCategoryPerformance runs it within the
 * hybrid strategy; useVaultPerformance runs it for the vault alone.
 *
 * Everything is in the display currency (useDisplayCurrency): the price
 * store's own columns for EUR/USD/CHF, EUR closes at each day's rate for
 * another (useMetalPriceHistory), the ledger's EUR lots at the rate of
 * their dates (ledgerHoldings), so a return includes the exchange-rate
 * move, and the live spot at the latest rate.
 */

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import {
  getContinuousStrategy,
  type TimeRange,
  type HoldingData,
  type PriceData,
  type PricePoint,
  type ContinuousPerformanceInput,
  type PerformanceDataPoint,
  type PerformanceMetrics,
} from "@/lib/performance";
import { PRICE_LOOKBACK_MS } from "@/../services/finance/financeService";
import { resolvePremiums } from "@/../services/finance/metals";
import { ledgerHoldings } from "@/../services/finance/metalsLedger";

import { getDisplaySpotPrice, useMetalPriceHistory, useMetalsPrices } from "@/hooks/metals";
import {
  useDisplayCurrency,
  useDisplayRateHistory,
} from "@/hooks/convex/displayCurrency";
import type { InvestmentCurrency } from "@/lib/types/investments";
import type { MetalsType } from "@/lib/types/metals-extended";

const METALS: MetalsType[] = ["gold", "silver", "platinum", "palladium"];

export interface UseVaultPerformanceInputOptions {
  timeRange: TimeRange;
  enabled?: boolean;
}

export interface VaultPerformanceInput {
  /** Undefined while loading or when the vault is empty */
  input: ContinuousPerformanceInput | undefined;
  /** The display currency every amount of `input` is in */
  currency: InvestmentCurrency;
  /** Some rates were taken at the latest rate (no daily history) */
  partial: boolean;
  isLoading: boolean;
}

export function useVaultPerformanceInput(
  options: UseVaultPerformanceInputOptions,
): VaultPerformanceInput {
  const { timeRange, enabled = true } = options;
  const { userId } = useAuth();
  const display = useDisplayCurrency();
  const currency = display.currency;

  const vaultItems = useQuery(
    api.vault.getUserVaultItems,
    enabled && userId ? {} : "skip",
  );
  const held = useMemo(
    () => new Set((vaultItems ?? []).map((i) => i.metalType as MetalsType)),
    [vaultItems],
  );

  // Daily rates back to the first dated lot, for the lots' own dates
  const firstLotAt = useMemo(() => {
    const dated = (vaultItems ?? []).flatMap((i) =>
      (i.ledger?.lots ?? []).flatMap((l) => (l.timestamp === null ? [] : [l.timestamp])),
    );
    return dated.length > 0 ? Math.min(...dated) : undefined;
  }, [vaultItems]);
  const lotRates = useDisplayRateHistory(enabled ? firstLotAt : undefined);

  // One shared history per metal (fixed hook order); disabled for metals
  // not held
  const history = (metal: MetalsType) =>
    [
      metal,
      timeRange,
      currency,
      { lookbackMs: PRICE_LOOKBACK_MS, enabled: enabled && held.has(metal) },
    ] as const;
  const series: Record<MetalsType, ReturnType<typeof useMetalPriceHistory>> = {
    gold: useMetalPriceHistory(...history("gold")),
    silver: useMetalPriceHistory(...history("silver")),
    platinum: useMetalPriceHistory(...history("platinum")),
    palladium: useMetalPriceHistory(...history("palladium")),
  };
  const live = useMetalsPrices();

  // A disabled (or signed-out) input is not loading: it is absent
  const isLoading =
    enabled &&
    !!userId &&
    (vaultItems === undefined ||
      display.isLoading ||
      lotRates.isLoading ||
      live.isLoading ||
      METALS.some((m) => held.has(m) && series[m].isLoading));
  const partial =
    lotRates.partial || METALS.some((m) => held.has(m) && series[m].partial);

  const goldData = series.gold.data;
  const silverData = series.silver.data;
  const platinumData = series.platinum.data;
  const palladiumData = series.palladium.data;

  const unitsPerEur = display.unitsPerEur;
  const lotRateOn = lotRates.rateOn;
  const input = useMemo<ContinuousPerformanceInput | undefined>(() => {
    if (!vaultItems || vaultItems.length === 0) return undefined;
    // An undated opening balance: the latest rate
    const unitsPerEurOn = (timestamp: number | null) =>
      timestamp === null ? unitsPerEur : lotRateOn(timestamp);

    const holdings: HoldingData[] = vaultItems.flatMap((item): HoldingData[] => {
      const sellPremium = resolvePremiums({ sell: [item.sellPremium] }).sellPremium;
      if (item.ledger) {
        return ledgerHoldings(
          {
            id: item._id,
            metalType: item.metalType,
            fineWeightGrams: item.fineWeightGrams,
            sellPremium,
          },
          item.ledger.lots,
          // EUR lots in the display currency, each at its date's rate
          { currency, unitsPerEurOn },
        );
      }
      // A ledger that cannot be replayed: the cached quantity, held since
      // its purchase date or before the range (never the record's creation)
      return [
        {
          id: item._id,
          assetType: item.metalType,
          quantity: item.quantity,
          fineWeightGrams: item.fineWeightGrams,
          sellPremium,
          purchaseDate: item.purchaseDate
            ? new Date(item.purchaseDate).getTime()
            : undefined,
          purchasePricePerUnit: item.purchasePricePerUnit ?? undefined,
          purchaseCurrency: item.purchaseCurrency ?? "EUR",
        },
      ];
    });

    // Per-ounce closes, gaps left for the strategy's own lookup to bridge.
    // A metal whose fetch failed has no series, and the strategy flags the
    // result partial.
    const data = { gold: goldData, silver: silverData, platinum: platinumData, palladium: palladiumData };
    const prices: PriceData = {};
    const livePrices: Partial<Record<string, PricePoint>> = {};
    const liveTs = live.data?.all?.timestamp ? Date.parse(live.data.all.timestamp) : null;
    for (const metal of METALS) {
      if (!held.has(metal)) continue;
      const points = data[metal];
      if (points && points.length > 0) prices[metal] = points;
      const spot = getDisplaySpotPrice(live.data, metal, currency, unitsPerEur);
      if (spot !== null && liveTs !== null) {
        livePrices[metal] = { timestamp: liveTs, price: spot };
      }
    }

    return { holdings, prices, livePrices, currency };
  }, [
    vaultItems,
    held,
    goldData,
    silverData,
    platinumData,
    palladiumData,
    live.data,
    currency,
    unitsPerEur,
    lotRateOn,
  ]);

  return { input, currency, partial, isLoading };
}

export interface VaultPerformanceResult {
  metrics: PerformanceMetrics | null;
  /** Value and cost line over the range, ending at live spot */
  dataPoints: PerformanceDataPoint[];
  /** The display currency the values are in */
  currency: InvestmentCurrency;
  isLoading: boolean;
}

/** The vault's continuous performance over a range (vault items only). */
export function useVaultPerformance(
  timeRange: TimeRange,
  options?: { enabled?: boolean; includeDataPoints?: boolean },
): VaultPerformanceResult {
  const { input, currency, partial, isLoading } = useVaultPerformanceInput({
    timeRange,
    enabled: options?.enabled ?? true,
  });
  const includeDataPoints = options?.includeDataPoints ?? false;

  return useMemo<VaultPerformanceResult>(() => {
    const result = input
      ? getContinuousStrategy().calculate(input, { timeRange, includeDataPoints })
      : null;
    const metrics =
      result && result.metrics.dataPointCount > 0
        ? withPartial(result.metrics, partial)
        : null;
    return {
      metrics,
      dataPoints: result?.dataPoints ?? [],
      currency,
      isLoading,
    };
  }, [input, timeRange, includeDataPoints, partial, currency, isLoading]);
}

/** Metrics flagged partial also when a rate came without its daily history. */
export function withPartial(
  metrics: PerformanceMetrics,
  partial: boolean,
): PerformanceMetrics {
  return partial && !metrics.partial ? { ...metrics, partial: true } : metrics;
}
