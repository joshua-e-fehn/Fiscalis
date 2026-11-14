/**
 * Display currency hooks
 *
 * Stored values and server aggregates are EUR. The data hooks convert their
 * outputs into the user's display currency once, with these hooks, and tag
 * every result with `currency`; components only format (formatCurrency)
 * and never multiply by a rate. Point-in-time figures use the latest rate
 * (useDisplayCurrency), series each day's rate (useDisplayRateHistory).
 */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { InvestmentCurrency } from "@/lib/types/investments";
import {
  fromEur as convertFromEur,
  rateOn as rateOnHistory,
  toDisplayCurrency,
  type DisplayCurrency,
} from "@/../services/finance/displayCurrency";
import { useUserSettings } from "./onboarding";

/**
 * Display currencies the data hooks convert into today. Widened to
 * DISPLAY_CURRENCIES once every consumer converts, so a preference never
 * labels an EUR figure with another currency.
 */
const SUPPORTED: readonly DisplayCurrency[] = ["EUR"];

/** How the rate in use was obtained; "identity" for EUR */
export type DisplayRateSource = "identity" | "market" | "stale" | "fallback";

export interface DisplayCurrencyState {
  /** For formatCurrency and the currency maps (lib/utils/currency.ts) */
  currency: InvestmentCurrency;
  /** ISO code, e.g. "EUR" */
  code: DisplayCurrency;
  /** Units of the display currency per 1 EUR, latest rate */
  unitsPerEur: number;
  /** Day of the rate (YYYY-MM-DD); null for EUR and fallback rates */
  rateDate: string | null;
  source: DisplayRateSource;
  /** The preference or its rate is still loading */
  isLoading: boolean;
  /** An EUR amount in the display currency, at the latest rate */
  fromEur: (amountEur: number) => number;
  fromEurNullable: (amountEur: number | null | undefined) => number | null;
}

/** The user's display currency, as far as the data hooks can convert into it. */
function useEffectiveCode(): { code: DisplayCurrency; settingsLoading: boolean } {
  const settings = useUserSettings();
  const preferred = toDisplayCurrency(settings?.defaultCurrency);
  const code =
    preferred && SUPPORTED.includes(preferred) ? preferred : SUPPORTED[0];
  return { code, settingsLoading: settings === undefined };
}

/**
 * The display currency and its latest rate. While the rate loads, the
 * state is EUR at the identity with isLoading set, so an EUR figure is
 * never shown under another currency's suffix.
 */
export function useDisplayCurrency(): DisplayCurrencyState {
  const { code, settingsLoading } = useEffectiveCode();
  const rates = useQuery(
    api.fxRates.getDisplayRates,
    code === "EUR" ? "skip" : { currency: code },
  );

  const resolved =
    code === "EUR" || rates === undefined
      ? null
      : { code, ...rates.latest };
  const unitsPerEur = resolved?.unitsPerEur ?? 1;

  // Memoized by the React Compiler
  const fromEur = (amountEur: number) => convertFromEur(amountEur, unitsPerEur);
  const fromEurNullable = (amountEur: number | null | undefined) =>
    amountEur == null ? null : convertFromEur(amountEur, unitsPerEur);

  const effective = resolved?.code ?? "EUR";
  return {
    currency: effective.toLowerCase() as InvestmentCurrency,
    code: effective,
    unitsPerEur,
    rateDate: resolved?.date ?? null,
    source: resolved?.source ?? "identity",
    isLoading: settingsLoading || (code !== "EUR" && rates === undefined),
    fromEur,
    fromEurNullable,
  };
}

export interface DisplayRateHistory {
  /** Units of the display currency per 1 EUR on a timestamp's day */
  rateOn: (timestamp: number) => number;
  /**
   * A non-EUR rate has not arrived yet; rateOn then returns the identity,
   * so callers gate the converted series on it (as on
   * useDisplayCurrency().isLoading)
   */
  isLoading: boolean;
}

/**
 * Daily rates of the display currency from `sinceMs` (the first point of
 * a series) on, for converting a series per date: a day without a row
 * carries the previous rate, a day before the history takes the earliest,
 * and without any history (or without `sinceMs`) the latest rate is used.
 */
export function useDisplayRateHistory(sinceMs: number | undefined): DisplayRateHistory {
  const { code, settingsLoading } = useEffectiveCode();
  // Without `sinceMs` it still subscribes, for the latest rate
  const rates = useQuery(
    api.fxRates.getDisplayRates,
    code === "EUR"
      ? "skip"
      : sinceMs === undefined
        ? { currency: code }
        : { currency: code, since: sinceMs },
  );

  const history = rates?.history ?? [];
  // The identity only for EUR or while loading (isLoading is set then)
  const latest = rates?.latest.unitsPerEur ?? 1;

  // Memoized by the React Compiler
  return {
    rateOn: (timestamp: number) => rateOnHistory(history, timestamp) ?? latest,
    isLoading: settingsLoading || (code !== "EUR" && rates === undefined),
  };
}
