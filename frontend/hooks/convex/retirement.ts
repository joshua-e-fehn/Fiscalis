import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import {
	computeRetirementResults,
	type RetirementInputs,
	type RetirementResults,
} from "@/../services/finance/retirementService";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLoans } from "./loans";

// ═══════════════════════════════════════════════════════════════
// RETIREMENT PLANNER ("Rentenplaner") HOOKS
// ═══════════════════════════════════════════════════════════════

/** The current user's stored retirement plan (undefined while loading, null if none). */
export function useRetirementPlan() {
	return useQuery(api.retirement.getRetirementPlan);
}

/** Upsert the plan (incremental, partial fields supported). */
export function useSaveRetirementPlan() {
	return useMutation(api.retirement.saveRetirementPlan);
}

/** Persist the current wizard step. */
export function useUpdateRetirementStep() {
	return useMutation(api.retirement.updateRetirementStep);
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
	return useQuery(api.retirement.getResidenceMortgageAccounts);
}

/**
 * Live retirement results of the stored plan, computed on the server
 * (retirement.getResults) from the plan, the profile date of birth and the
 * current net worth. Reactive: recomputes when any of them changes.
 *
 * Returns `undefined` while loading, `null` when no plan exists.
 */
export function useRetirementResults(): RetirementResults | null | undefined {
	return useQuery(api.retirement.getResults);
}

/**
 * Preview for the wizard: the in-progress (unsaved) inputs computed on the
 * client, on the server's funding base for the inputs' mortgage link
 * (retirement.getFundingBase, the same base getResults uses).
 */
export function useRetirementPreview(
	inputs: RetirementInputs | null,
): RetirementResults | null | undefined {
	const fundingBase = useQuery(api.retirement.getFundingBase, {
		primaryResidenceLoanId: inputs?.primaryResidenceLoanId as
			| Id<"loans">
			| undefined,
		primaryResidenceAccountId: inputs?.primaryResidenceAccountId as
			| Id<"plaidAccounts">
			| undefined,
		primaryResidenceMortgageRate: inputs?.primaryResidenceMortgageRate,
		primaryResidenceMortgagePayment: inputs?.primaryResidenceMortgagePayment,
	});

	return useMemo(() => {
		if (fundingBase === undefined) return undefined;
		if (!inputs || !fundingBase) return null;
		return computeRetirementResults(inputs, fundingBase);
	}, [inputs, fundingBase]);
}
