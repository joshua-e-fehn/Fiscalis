/**
 * The currency of a retirement plan's typed amounts.
 *
 * A plan stores what the user typed (expenses, pensions, property equity,
 * a mortgage repayment) in the currency they typed it in, its `currency`
 * (absent = EUR, plans saved before display currencies existed). The
 * funding base is the EUR net worth, converted into that currency when
 * the plan is computed (retirementService.ts retirementFundingBase).
 *
 * Reading a plan in another display currency converts its amounts in
 * memory (retirementAmountsIn); saving it in that currency rebases the
 * stored amounts once at the day's rate and switches `currency`, so typed
 * amounts never drift with the daily rate afterwards.
 *
 * Framework-free so the Convex bundle, Next.js and vitest can all import it.
 */

import { roundMoney } from "./financeService";
import {
  fromEur,
  toDisplayCurrency,
  type DisplayCurrency,
} from "./displayCurrency";
import type {
  PensionSource,
  RetirementFundingBase,
} from "./retirementService";

/** The currency of a plan saved without one. */
export const LEGACY_PLAN_CURRENCY: DisplayCurrency = "EUR";

/** A stored plan's currency: its `currency`, EUR when absent or unknown. */
export function planCurrencyOf(plan: {
  currency?: string | null;
}): DisplayCurrency {
  return toDisplayCurrency(plan.currency) ?? LEGACY_PLAN_CURRENCY;
}

/** The money fields of a plan: everything the user typed as an amount. */
export interface RetirementPlanAmounts {
  monthlyExpensesToday: number;
  primaryResidenceMortgagePayment?: number;
  fundableRealEstateEquity?: number;
  pensionSources: PensionSource[];
}

/**
 * A plan's money fields multiplied by `factor` (units of the target
 * currency per unit of the plan's), rounded to cents; an absent optional
 * field stays absent. Rates, ages and treatments are not amounts and are
 * left out. A factor of 1 returns the amounts unchanged (no rounding), so
 * a plan read or saved in its own currency is never rewritten.
 */
export function retirementAmountsIn(
  plan: RetirementPlanAmounts,
  factor: number,
): RetirementPlanAmounts {
  if (!(Number.isFinite(factor) && factor > 0)) {
    throw new Error("A currency factor must be a positive number");
  }
  const scale = (amount: number) =>
    factor === 1 ? amount : roundMoney(amount * factor);
  const amounts: RetirementPlanAmounts = {
    monthlyExpensesToday: scale(plan.monthlyExpensesToday),
    pensionSources: plan.pensionSources.map((source) => ({
      ...source,
      monthlyAmount: scale(source.monthlyAmount),
    })),
  };
  if (plan.primaryResidenceMortgagePayment !== undefined) {
    amounts.primaryResidenceMortgagePayment = scale(
      plan.primaryResidenceMortgagePayment,
    );
  }
  if (plan.fundableRealEstateEquity !== undefined) {
    amounts.fundableRealEstateEquity = scale(plan.fundableRealEstateEquity);
  }
  return amounts;
}

/**
 * A funding base built from the EUR net-worth aggregate
 * (retirementService.ts retirementFundingBase) in the plan's currency:
 * each category's assets and the liabilities times `unitsPerEur` (units of
 * the plan's currency per 1 EUR). The residence mortgage is kept as it is:
 * the caller builds it in the plan's currency, since its projection may
 * use the plan's own repayment amount.
 */
export function fundingBaseIn(
  base: RetirementFundingBase,
  unitsPerEur: number,
): RetirementFundingBase {
  if (unitsPerEur === 1) return base;
  return {
    ...base,
    assetsByCategory: Object.fromEntries(
      Object.entries(base.assetsByCategory).map(([category, value]) => [
        category,
        fromEur(value, unitsPerEur),
      ]),
    ),
    totalLiabilities: fromEur(base.totalLiabilities, unitsPerEur),
  };
}
