import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import {
	computeRetirementResults,
	type RetirementFundingBase,
	type RetirementInputs,
	type RetirementResults,
	residenceMortgageFromLoan,
} from "@/../services/finance/retirementService";
import { api } from "@/convex/_generated/api";
import { getAgeFromBirthDate } from "@/lib/utils/date";
import { useLoans } from "./loans";
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
		birthDate: profileBirthDate ?? plan.birthDate,
		monthlyExpensesToday: plan.monthlyExpensesToday,
		ownsPrimaryResidence: plan.ownsPrimaryResidence,
		primaryResidenceLoanId: plan.primaryResidenceLoanId,
		fundableRealEstateEquity: plan.fundableRealEstateEquity ?? 0,
		fundingTreatments: plan.fundingTreatments,
		pensionSources: plan.pensionSources,
		pensionDeductionRate: plan.pensionDeductionRate,
		withdrawalTaxRate: plan.withdrawalTaxRate,
		indexContributions: plan.indexContributions,
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
	 * primary residence. The planner takes a linked residence mortgage back out
	 * (computeRetirementResults), as its repayments are a pre-retirement expense.
	 */
	totalLiabilities: number;
	/** Asset value per category id — the dashboard's category breakdown. */
	assetsByCategory: Record<string, number>;
}

/**
 * Net worth used as the retirement funding basis: the dashboard's overview,
 * which is the server-side net worth (portfolio.getOverview, the same
 * aggregator as the snapshots), so the planner, the dashboard and the
 * history always agree: liabilities in EUR, loans by the D1 status rule.
 * Returns `undefined` while loading.
 */
export function useRetirementNetWorth(): RetirementNetWorth | undefined {
	const { summary, isLoading } = usePortfolioOverview();

	return useMemo(() => {
		if (isLoading || !summary) return undefined;
		return {
			netWorth: summary.netWorth,
			totalAssets: summary.totalAssets,
			totalLiabilities: summary.totalLiabilities,
			assetsByCategory: Object.fromEntries(
				summary.assetCategories.map((c) => [c.id, c.totalValue]),
			),
		};
	}, [isLoading, summary]);
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

/**
 * The funding base for `inputs`: the dashboard's per-category assets and
 * liabilities, plus the linked primary-residence mortgage (resolved from the
 * tracked loans). Returns `undefined` while loading.
 */
export function useRetirementFundingBase(
	primaryResidenceLoanId: string | undefined,
): RetirementFundingBase | undefined {
	const netWorth = useRetirementNetWorth();
	const loans = useRetirementMortgageCandidates();

	return useMemo(() => {
		if (netWorth === undefined || loans === undefined) return undefined;
		const loan = primaryResidenceLoanId
			? loans.find((l) => l._id === primaryResidenceLoanId)
			: undefined;
		return {
			assetsByCategory: netWorth.assetsByCategory,
			totalLiabilities: netWorth.totalLiabilities,
			primaryResidenceMortgage: loan ? residenceMortgageFromLoan(loan) : null,
		};
	}, [netWorth, loans, primaryResidenceLoanId]);
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
	const fundingBase = useRetirementFundingBase(plan?.primaryResidenceLoanId);

	return useMemo(() => {
		if (
			plan === undefined ||
			settings === undefined ||
			fundingBase === undefined
		)
			return undefined;
		if (!plan) return null;
		return computeRetirementResults(
			planToInputs(plan, settings?.birthDate),
			fundingBase,
		);
	}, [plan, settings, fundingBase]);
}

/**
 * Client-only preview for the wizard: compute results from in-progress form
 * inputs without a round-trip, using the live funding base.
 */
export function useRetirementPreview(
	inputs: RetirementInputs | null,
): RetirementResults | null | undefined {
	const fundingBase = useRetirementFundingBase(inputs?.primaryResidenceLoanId);

	return useMemo(() => {
		if (fundingBase === undefined) return undefined;
		if (!inputs) return null;
		return computeRetirementResults(inputs, fundingBase);
	}, [inputs, fundingBase]);
}
