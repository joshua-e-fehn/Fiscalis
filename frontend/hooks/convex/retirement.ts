import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import {
	computeRetirementResults,
	type RetirementInputs,
	type RetirementResults,
} from "@/../services/finance/retirementService";
import { api } from "@/convex/_generated/api";
import { getAgeFromBirthDate } from "@/lib/utils/date";
import { useUserSettings } from "./onboarding";
import { usePortfolioOverview } from "./portfolio";

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

/**
 * The plan holder's age today, always derived fresh: from the profile date of
 * birth (canonical), else the plan's snapshot of it, else the age stored at the
 * last save.
 */
function currentAgeForPlan(
	plan: RetirementPlanDoc,
	profileBirthDate: string | undefined,
): number {
	return (
		getAgeFromBirthDate(profileBirthDate) ??
		getAgeFromBirthDate(plan.birthDate) ??
		plan.currentAge
	);
}

/** Map a stored plan document to the pure-service input shape (fresh age). */
export function planToInputs(
	plan: RetirementPlanDoc,
	profileBirthDate: string | undefined,
): RetirementInputs {
	return {
		currentAge: currentAgeForPlan(plan, profileBirthDate),
		retirementAge: plan.retirementAge,
		monthlyExpensesToday: plan.monthlyExpensesToday,
		ownsPrimaryResidence: plan.ownsPrimaryResidence,
		fundableRealEstateEquity: plan.fundableRealEstateEquity ?? 0,
		pensionSources: plan.pensionSources,
		inflationRate: plan.inflationRate,
		withdrawalRate: plan.withdrawalRate,
		optimisticReturn: plan.optimisticReturn,
		conservativeReturn: plan.conservativeReturn,
	};
}

/** The planner's funding basis: the same figures as the dashboard's net worth. */
export interface RetirementNetWorth {
	/** Dashboard net worth: totalAssets − totalLiabilities (EUR). */
	netWorth: number;
	totalAssets: number;
	/**
	 * Every loan tracked in Fiscalis (linked and manual), incl. a mortgage on the
	 * primary residence: it stays subtracted although the home itself is
	 * excluded, so the planner matches the dashboard.
	 */
	totalLiabilities: number;
}

/**
 * Net worth used as the retirement funding basis. Reuses the dashboard's
 * usePortfolioOverview so both always agree (incl. vault metals and manual
 * loans). Returns `undefined` while loading.
 */
export function useRetirementNetWorth(): RetirementNetWorth | undefined {
	const { summary, isLoading } = usePortfolioOverview("eur");

	return useMemo(() => {
		if (isLoading || !summary) return undefined;
		return {
			netWorth: summary.netWorth,
			totalAssets: summary.totalAssets,
			totalLiabilities: summary.totalLiabilities,
		};
	}, [isLoading, summary]);
}

/**
 * Live retirement results: composes the stored plan with the user's current net
 * worth through the tested pure service. Reactive — recomputes whenever the
 * plan, the date of birth or the portfolio value changes.
 *
 * Returns `undefined` while loading, `null` when no plan exists.
 */
export function useRetirementResults(): RetirementResults | null | undefined {
	const plan = useRetirementPlan();
	const settings = useUserSettings();
	const netWorth = useRetirementNetWorth();

	return useMemo(() => {
		if (plan === undefined || settings === undefined || netWorth === undefined)
			return undefined;
		if (!plan) return null;
		return computeRetirementResults(
			planToInputs(plan, settings?.birthDate),
			netWorth.netWorth,
		);
	}, [plan, settings, netWorth]);
}

/**
 * Client-only preview for the wizard: compute results from in-progress form
 * inputs without a round-trip, using the live net worth.
 */
export function useRetirementPreview(
	inputs: RetirementInputs | null,
): RetirementResults | null | undefined {
	const netWorth = useRetirementNetWorth();

	return useMemo(() => {
		if (netWorth === undefined) return undefined;
		if (!inputs) return null;
		return computeRetirementResults(inputs, netWorth.netWorth);
	}, [inputs, netWorth]);
}
