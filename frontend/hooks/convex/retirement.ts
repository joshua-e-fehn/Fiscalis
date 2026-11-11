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
import { getAgeFromBirthDate, todayLocalISO } from "@/lib/utils/date";
import { useLoanPayments, useLoans } from "./loans";
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
 * The funding base for a plan: the dashboard's per-category assets and
 * liabilities (usePortfolioOverview, so both always agree, incl. vault metals
 * and manual loans), plus the linked primary-residence mortgage projected by
 * its own schedule (recorded payments + loan type). Whether that mortgage is
 * part of the liabilities is decided by residenceMortgageFromLoan, so a loan
 * the liabilities don't count never removes other debts. Returns `undefined`
 * while loading.
 */
export function useRetirementFundingBase(
	primaryResidenceLoanId: string | undefined,
): RetirementFundingBase | undefined {
	const { summary, isLoading } = usePortfolioOverview();
	const loans = useRetirementMortgageCandidates();
	const loan = primaryResidenceLoanId
		? loans?.find((l) => l._id === primaryResidenceLoanId)
		: undefined;
	const payments = useLoanPayments(loan?._id);

	return useMemo(() => {
		if (isLoading || !summary || loans === undefined) return undefined;
		if (loan && payments === undefined) return undefined;
		return {
			assetsByCategory: Object.fromEntries(
				summary.assetCategories.map((c) => [c.id, c.totalValue]),
			),
			totalLiabilities: summary.totalLiabilities,
			primaryResidenceMortgage: loan
				? residenceMortgageFromLoan(loan, payments ?? [], todayLocalISO())
				: null,
		};
	}, [isLoading, summary, loans, loan, payments]);
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
