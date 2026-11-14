import { useMemo, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { MetalChartData, MetalCurrency, MetalType } from "@/lib/types/metals";
import {
  AllMetalPrices,
  MetalsPrices,
  MetalsType,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
import {
  type TimeRange,
  getTimeRangeStartTimestamp,
  priceHistoryWindow,
  sliceFrom,
} from "@/../services/finance/financeService";
import {
  chartSeries,
  chartWindow,
  historyPoints,
  historyWindow,
} from "@/../services/finance/metalPriceFeed";
import type { PricePoint } from "@/lib/performance";
import type { InvestmentCurrency } from "@/lib/types/investments";
import {
  fromEur,
  quotesInCurrency,
} from "@/../services/finance/displayCurrency";
import {
  useDisplayCurrency,
  useDisplayRateHistory,
} from "@/hooks/convex/displayCurrency";

/**
 * Precious-metal prices from Convex (convex/metalPrices.ts): the latest
 * minutely gold.de snapshot and the stored hour/day closes. Subscriptions
 * push updates, so nothing here polls. EUR, USD and CHF are the feed's own
 * quote columns; another display currency (GBP) is derived from EUR.
 */

/** The latest snapshot, shared by every hook (Convex dedupes the subscription). */
function useLatestSnapshot() {
  return useQuery(api.metalPrices.latest);
}

type Closes = typeof api.metalPrices.closes._returnType;

/**
 * Stored closes, keeping the previous result while a moved window loads.
 * The window's `to` advances at each hour or day boundary; without this
 * every chart would drop to its loading state for that moment. A new
 * `key` (another range) does show loading.
 */
function useCloses(
  args: { resolution: "hour" | "day"; from: number; to: number } | "skip",
  key: string,
): Closes | undefined {
  const result = useQuery(api.metalPrices.closes, args);
  const [kept, setKept] = useState<{ key: string; value: Closes } | null>(
    null,
  );
  if (result !== undefined && (kept?.value !== result || kept.key !== key)) {
    setKept({ key, value: result });
  }
  if (args === "skip") return undefined;
  return result ?? (kept?.key === key ? kept.value : undefined);
}

// ═══════════════════════════════════════════════════════════════
// Historical Price Hooks
// ═══════════════════════════════════════════════════════════════

/**
 * Market quotes in `currency`: the feed's own column for EUR, USD and
 * CHF; another display currency (GBP) from the EUR quotes, at the daily
 * rates from `sinceMs` (rateOn) or the latest rate. Only the display
 * currency can be derived; another one has no data.
 */
function useQuoteConversion(
  currency: InvestmentCurrency,
  sinceMs: number | undefined,
) {
  const quoted = isQuoteCurrency(currency);
  const fetched: MetalCurrency = quoted ? currency : "eur";
  const display = useDisplayCurrency();
  const rates = useDisplayRateHistory(quoted ? undefined : sinceMs);
  const convertible = quoted || display.currency === currency;
  const ratesLoading = !quoted && (display.isLoading || rates.isLoading);
  return {
    quoted,
    fetched,
    convertible,
    ratesLoading,
    rateOn: rates.rateOn,
    unitsPerEur: display.unitsPerEur,
  };
}

/**
 * A metal's price chart for a predefined time range: sampled closes (gaps
 * kept as null; PriceChart breaks the line there) ending at the latest
 * price. A display currency without its own quote column (GBP) is derived
 * from the EUR closes at each day's rate.
 */
export function useMetalPrices(
  metal: MetalType,
  timeRange: TimeRange,
  currency: InvestmentCurrency,
): { data: MetalChartData[] | undefined; isLoading: boolean } {
  // Rate history from a start that is stable for the day
  const { quoted, fetched, convertible, ratesLoading, rateOn, unitsPerEur } =
    useQuoteConversion(currency, priceHistoryWindow(timeRange).from);

  const window = chartWindow(timeRange, Date.now());
  const closes = useCloses(
    { resolution: window.resolution, from: window.from, to: window.to },
    timeRange,
  );
  const latest = useLatestSnapshot();

  const raw = useMemo(
    () =>
      closes === undefined || latest === undefined
        ? undefined
        : chartSeries(window, closes, latest, metal, fetched).map((p) => ({
            date: new Date(p.timestamp),
            price: p.price,
          })),
    // The window is derived from (timeRange, from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closes, latest, metal, fetched, timeRange, window.from, window.to],
  );

  const data = useMemo(() => {
    if (raw === undefined || quoted) return raw;
    if (ratesLoading) return undefined;
    if (!convertible) return [];
    return quotesInCurrency(raw, rateOn, unitsPerEur);
  }, [raw, quoted, ratesLoading, convertible, rateOn, unitsPerEur]);

  return { data, isLoading: raw === undefined || ratesLoading };
}

/**
 * A metal's latest price in `currency`: the quote column, or (GBP) the EUR
 * quote at the latest display rate.
 */
export function useMetalPriceLatest(
  metal: MetalType,
  currency: InvestmentCurrency,
): { data: MetalChartData | undefined; isLoading: boolean } {
  const { quoted, fetched, convertible, ratesLoading, unitsPerEur } =
    useQuoteConversion(currency, undefined);
  const latest = useLatestSnapshot();

  const raw = useMemo(
    () =>
      latest
        ? {
            date: new Date(latest.timestamp),
            price: latest.prices[metal][fetched] ?? null,
          }
        : undefined,
    [latest, metal, fetched],
  );

  const data = useMemo(() => {
    if (raw === undefined || quoted) return raw;
    if (ratesLoading || !convertible) return undefined;
    return quotesInCurrency([raw], () => unitsPerEur, unitsPerEur)[0];
  }, [raw, quoted, ratesLoading, convertible, unitsPerEur]);

  return { data, isLoading: latest === undefined || ratesLoading };
}

/** Currencies the price feed quotes metals in (its EUR/USD/CHF columns) */
const QUOTE_CURRENCIES: readonly MetalCurrency[] = ["eur", "usd", "chf"];

/** A currency the price feed has its own column for. */
export function isQuoteCurrency(currency: string): currency is MetalCurrency {
  return (QUOTE_CURRENCIES as readonly string[]).includes(currency);
}

export interface MetalPriceHistory {
  /** Closes in the asked currency, ascending; undefined while loading */
  data: PricePoint[] | undefined;
  isLoading: boolean;
  /** Always false: a failing Convex query throws to the error boundary */
  isError: boolean;
  /**
   * Derived closes taken at the latest rate (no daily history), or none
   * at all (a currency other than the display currency): flag the result
   */
  partial: boolean;
}

/**
 * A metal's closes for a range, as price points (no gap filling: the
 * performance strategies bridge gaps themselves).
 *
 * Every range with the same interval shares one subscription per metal
 * (priceHistoryWindow: the widest of those ranges, stable for the day),
 * and each caller slices it to its own range start less `lookbackMs`.
 *
 * EUR, USD and CHF are the feed's own columns. Another display currency
 * (GBP) is derived from the EUR closes, each at its own day's rate
 * (useDisplayRateHistory), so it is only available as the display
 * currency.
 */
export function useMetalPriceHistory(
  metal: MetalType,
  timeRange: TimeRange,
  currency: InvestmentCurrency,
  options: { lookbackMs?: number; enabled?: boolean } = {},
): MetalPriceHistory {
  const { lookbackMs = 0, enabled = true } = options;
  const now = Date.now();
  const { interval, from } = priceHistoryWindow(timeRange, now);
  const window = historyWindow(interval, from, now);
  const quoted = isQuoteCurrency(currency);
  const fetched: MetalCurrency = quoted ? currency : "eur";

  const display = useDisplayCurrency();
  const rates = useDisplayRateHistory(quoted ? undefined : from);
  // Display rates convert into the display currency only
  const convertible = quoted || display.currency === currency;

  const closes = useCloses(
    enabled ? { resolution: window.resolution, from: window.from, to: window.to } : "skip",
    interval,
  );
  const latest = useLatestSnapshot();
  const sliceStart = getTimeRangeStartTimestamp(timeRange, now) - lookbackMs;
  // Stable within the day: the range start moves, the fetch window does not
  const dayKey = window.to;

  const raw = useMemo(
    () =>
      !enabled || closes === undefined || latest === undefined
        ? undefined
        : sliceFrom(
            historyPoints(interval, closes, latest, metal, fetched, from, Date.now()),
            sliceStart,
          ),
    // sliceStart drifts with the clock; recompute with the data, not per render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, closes, latest, interval, metal, fetched, from, dayKey, timeRange, lookbackMs],
  );

  const ratesLoading = !quoted && (display.isLoading || rates.isLoading);
  const rateOn = rates.rateOn;
  const data = useMemo(() => {
    if (raw === undefined || quoted) return raw;
    if (ratesLoading) return undefined;
    if (!convertible) return [];
    return raw.map((p) => ({
      timestamp: p.timestamp,
      price: fromEur(p.price, rateOn(p.timestamp)),
    }));
  }, [raw, quoted, ratesLoading, convertible, rateOn]);

  return {
    data,
    isLoading:
      enabled && (closes === undefined || latest === undefined || ratesLoading),
    isError: false,
    partial: !quoted && (rates.partial || !convertible),
  };
}

/**
 * Spot per troy ounce in a display currency: the feed's own column for
 * EUR, USD and CHF, else the EUR spot at `unitsPerEur` (the latest display
 * rate, useDisplayCurrency).
 */
export function getDisplaySpotPrice(
  prices: MetalsPrices | undefined,
  metalType: MetalsType,
  currency: InvestmentCurrency,
  unitsPerEur: number,
): number | null {
  if (isQuoteCurrency(currency)) return getSpotPrice(prices, metalType, currency);
  const eur = getSpotPrice(prices, metalType, "eur");
  return eur === null ? null : fromEur(eur, unitsPerEur);
}

// ═══════════════════════════════════════════════════════════════
// All Metals Price Hooks
// ═══════════════════════════════════════════════════════════════

/** All four metals in EUR/USD/CHF with the EUR rates, from the latest snapshot. */
export function useMetalsPrices(): {
  data: MetalsPrices | undefined;
  isLoading: boolean;
} {
  const latest = useLatestSnapshot();
  const data = useMemo((): MetalsPrices | undefined => {
    if (!latest) return undefined;
    const quote = (metal: MetalsType) => ({
      eur: latest.prices[metal].eur,
      usd: latest.prices[metal].usd,
      chf: latest.prices[metal].chf ?? null,
    });
    const all: AllMetalPrices = {
      gold: quote("gold"),
      silver: quote("silver"),
      platinum: quote("platinum"),
      palladium: quote("palladium"),
      exchangeRates: {
        eurToUsd: latest.eurToUsd,
        eurToChf: latest.eurToChf ?? null,
      },
      timestamp: new Date(latest.timestamp).toISOString(),
    };
    return { all };
  }, [latest]);
  return { data, isLoading: latest === undefined };
}

// ═══════════════════════════════════════════════════════════════
// Price Helper Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Get spot price per troy ounce for a metal in specified currency
 */
export function getSpotPrice(
  prices: MetalsPrices | undefined,
  metalType: MetalsType,
  currency: MetalsCurrency,
): number | null {
  if (!prices?.all) return null;

  const metalPrices = prices.all[metalType];
  const price = metalPrices[currency];

  return price ?? null;
}
