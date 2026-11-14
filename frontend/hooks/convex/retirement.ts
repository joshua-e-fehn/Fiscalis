import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useMemo } from "react";
import {
	computeRetirementResults,
	type RetirementInputs,
	type RetirementResults,
	retirementValuationDay,
} from "@/../services/finance/retirementService";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocalToday } from "@/hooks/useLocalToday";
import { useDisplayCurrency } from "./displayCurrency";
import { useLoans } from "./loans";

// ═══════════════════════════════════════════════════════════════
// RETIREMENT PLANNER ("Rentenplaner") HOOKS
// ═══════════════════════════════════════════════════════════════
//
// Every amount these hooks read or write is in the display currency
// (useDisplayCurrency): the server converts the plan's stored amounts and
// the EUR net worth into it, and a save in it rebases the stored plan once
// (convex/retirement.ts). Components only format, in the display currency.

/** The display currency code to ask the server for; undefined while loading. */
function useRetirementCurrency(): string | undefined {
	const display = useDisplayCurrency();
	return display.isLoading ? undefined : display.code;
}

/**
 * The current user's stored retirement plan with its amounts in the display
 * currency (undefined while loading, null if none). `storedCurrency` differs
 * from `currency` until the plan is saved in the display currency.
 */
export function useRetirementPlan() {
	const currency = useRetirementCurrency();
	return useQuery(
		api.retirement.getRetirementPlan,
		currency === undefined ? "skip" : { currency },
	);
}

type SavePlanArgs = Omit<
	FunctionArgs<typeof api.retirement.saveRetirementPlan>,
	"currency"
>;

/**
 * Upsert the plan (incremental, partial fields supported), with amounts in
 * the display currency, or in `currency` when the caller holds amounts
 * filled in another one (the wizard keeps the currency it was filled in).
 */
export function useSaveRetirementPlan() {
	const save = useMutation(api.retirement.saveRetirementPlan);
	const displayCurrency = useRetirementCurrency();
	// Without a known currency the amounts count as the plan's own
	return (args: SavePlanArgs, currency: string | undefined = displayCurrency) =>
		save({ ...args, currency });
}

/** Persist the current wizard step (rebasing the plan into the display currency). */
export function useUpdateRetirementStep() {
	const update = useMutation(api.retirement.updateRetirementStep);
	const currency = useRetirementCurrency();
	return (args: { step: number }) => update({ ...args, currency });
}

/** Delete the plan and start over. */
export function useResetRetirementPlan() {
	return useMutation(api.retirement.resetRetirementPlan);
}

/** Loans that count as liabilities (D1): active or defaulted. */
export function useRetirementMortgageCandidates() {
	const loans = useLoans();
	return useMemo(
		() =>
			loans?.filter((l) => l.status === "active" || l.status === "defaulted"),
		[loans],
	);
}

/** Bank (Plaid) mortgage accounts the home can be linked to instead. */
export function useRetirementMortgageAccounts() {
	const currency = useRetirementCurrency();
	return useQuery(
		api.retirement.getResidenceMortgageAccounts,
		currency === undefined ? "skip" : { currency },
	);
}

/**
 * Live retirement results of the stored plan, computed on the server
 * (retirement.getResults) from the plan, the profile date of birth and the
 * current net worth, on the viewer's local day. Reactive: recomputes when any
 * of them changes, and at local midnight (the day is a query argument).
 *
 * In the display currency, which the result carries. Returns `undefined`
 * while loading, `null` when no plan exists.
 */
export function useRetirementResults():
	| (RetirementResults & { currency: string })
	| null
	| undefined {
	const today = useLocalToday();
	const currency = useRetirementCurrency();
	return useQuery(
		api.retirement.getResults,
		currency === undefined ? "skip" : { today, currency },
	);
}

/**
 * Preview for the wizard: the in-progress (unsaved) inputs computed on the
 * client, on the server's funding base for the inputs' mortgage link
 * (retirement.getFundingBase, the same base getResults uses), both in the
 * display currency, or in `inputsCurrency` (the currency the inputs were
 * filled in) when given.
 */
export function useRetirementPreview(
	inputs: RetirementInputs | null,
	inputsCurrency?: string,
): RetirementResults | null | undefined {
	const today = useLocalToday();
	const displayCurrency = useRetirementCurrency();
	const currency = inputsCurrency ?? displayCurrency;
	const fundingBase = useQuery(
		api.retirement.getFundingBase,
		currency === undefined
			? "skip"
			: {
					today,
					currency,
					primaryResidenceLoanId: inputs?.primaryResidenceLoanId as
						| Id<"loans">
						| undefined,
					primaryResidenceAccountId: inputs?.primaryResidenceAccountId as
						| Id<"plaidAccounts">
						| undefined,
					primaryResidenceMortgageRate: inputs?.primaryResidenceMortgageRate,
					primaryResidenceMortgagePayment:
						inputs?.primaryResidenceMortgagePayment,
				},
	);

	return useMemo(() => {
		if (fundingBase === undefined) return undefined;
		if (!inputs || !fundingBase) return null;
		return computeRetirementResults(
			inputs,
			fundingBase,
			retirementValuationDay(today).date,
		);
	}, [inputs, fundingBase, today]);
}
