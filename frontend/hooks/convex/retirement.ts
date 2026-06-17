import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import {
	computeRetirementResults,
	type RetirementInputs,
	type RetirementResults,
} from "@/../services/finance/retirementService";
import { api } from "@/convex/_generated/api";

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

type RetirementPlanDoc = NonNullable<ReturnType<typeof useRetirementPlan>>;

/** Map a stored plan document to the pure-service input shape. */
function planToInputs(plan: RetirementPlanDoc): RetirementInputs {
	return {
		currentAge: plan.currentAge,
		retirementAge: plan.retirementAge,
		monthlyExpensesToday: plan.monthlyExpensesToday,
		ownsPrimaryResidence: plan.ownsPrimaryResidence,
		fundableRealEstateEquity: plan.fundableRealEstateEquity,
		pensionSources: plan.pensionSources,
		inflationRate: plan.inflationRate,
		withdrawalRate: plan.withdrawalRate,
		optimisticReturn: plan.optimisticReturn,
		conservativeReturn: plan.conservativeReturn,
	};
}

/**
 * Live retirement results: composes the stored plan with the user's current net
 * worth through the tested pure service. Reactive — recomputes whenever either
 * the plan or the portfolio value changes.
 *
 * Returns `undefined` while loading, `null` when no plan exists.
 */
export function useRetirementResults(): RetirementResults | null | undefined {
	const plan = useRetirementPlan();
	const netWorth = useQuery(api.portfolio.getTotalNetWorth);

	return useMemo(() => {
		if (plan === undefined || netWorth === undefined) return undefined;
		if (!plan) return null;
		return computeRetirementResults(planToInputs(plan), netWorth?.total ?? 0);
	}, [plan, netWorth]);
}

/**
 * Client-only preview for the wizard: compute results from in-progress form
 * inputs without a round-trip, using the live net worth.
 */
export function useRetirementPreview(
	inputs: RetirementInputs | null,
): RetirementResults | null | undefined {
	const netWorth = useQuery(api.portfolio.getTotalNetWorth);

	return useMemo(() => {
		if (netWorth === undefined) return undefined;
		if (!inputs) return null;
		return computeRetirementResults(inputs, netWorth?.total ?? 0);
	}, [inputs, netWorth]);
}
