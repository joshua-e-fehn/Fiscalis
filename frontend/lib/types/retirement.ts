// Retirement Planner ("Rentenplaner") — shared frontend types.
//
// The financial model types and default assumptions live in the pure service
// (services/finance/retirementService.ts) so the math has a single source of
// truth. This file re-exports them and adds UI-only concepts (wizard steps).

export type {
	FundingLine,
	FundingTreatment,
	FundingTreatments,
	PensionSource,
	ProjectionPoint,
	RetirementAssumptionField,
	RetirementAssumptions,
	RetirementFundingBase,
	RetirementInputErrors,
	RetirementInputIssue,
	RetirementInputIssues,
	RetirementInputs,
	RetirementPlanProblem,
	RetirementResults,
	ScenarioResult,
} from "@/../services/finance/retirementService";

export {
	computeRetirementResults,
	DEFAULT_CONSERVATIVE_RETURN,
	DEFAULT_INFLATION_RATE,
	DEFAULT_OPTIMISTIC_RETURN,
	DEFAULT_PENSION_DEDUCTION_RATE,
	DEFAULT_WITHDRAWAL_RATE,
	DEFAULT_WITHDRAWAL_TAX_RATE,
	FUNDING_CATEGORIES,
	FUNDING_TREATMENT_LABELS,
	firstRetirementInputError,
	firstRetirementInputIssue,
	fundingTreatmentFor,
	inflateToFuture,
	isOnTrack,
	MAX_RETIREMENT_DEDUCTION_RATE,
	MAX_RETIREMENT_PLAN_AGE,
	MAX_RETIREMENT_RATE,
	MIN_RETIREMENT_PLAN_AGE,
	netPensionMonthly,
	pensionSourceIssues,
	retirementAgeIssues,
	retirementAssumptionIssues,
	retirementDeductionIssues,
	retirementInputIssues,
	retirementPlanProblem,
	retirementTimeline,
	roundYears,
	validatePensionSources,
	validateRetirementAges,
	validateRetirementAssumptions,
	validateRetirementDeductions,
	validateRetirementInputs,
} from "@/../services/finance/retirementService";

import type { RetirementInputs } from "@/../services/finance/retirementService";
import {
	DEFAULT_CONSERVATIVE_RETURN,
	DEFAULT_INFLATION_RATE,
	DEFAULT_OPTIMISTIC_RETURN,
	DEFAULT_WITHDRAWAL_RATE,
} from "@/../services/finance/retirementService";

/** Starting values for a fresh wizard (also used as create defaults). */
export const DEFAULT_RETIREMENT_INPUTS: RetirementInputs = {
	currentAge: 40,
	retirementAge: 67,
	monthlyExpensesToday: 3000,
	ownsPrimaryResidence: false,
	fundableRealEstateEquity: 0,
	// The wizard adds a translated "State pension" row (retirement.wizard.defaultPensionLabel)
	pensionSources: [],
	inflationRate: DEFAULT_INFLATION_RATE,
	withdrawalRate: DEFAULT_WITHDRAWAL_RATE,
	optimisticReturn: DEFAULT_OPTIMISTIC_RETURN,
	conservativeReturn: DEFAULT_CONSERVATIVE_RETURN,
};

/** Wizard steps (UI concept). Persisted as `currentStep` on the plan. */
export enum RetirementStep {
	INTRO = 1,
	PERSONAL = 2,
	EXPENSES = 3,
	HOUSING = 4,
	PENSIONS = 5,
	PORTFOLIO = 6,
	ASSUMPTIONS = 7,
	RESULTS = 8,
}

export const RETIREMENT_STEP_COUNT = RetirementStep.RESULTS;

/** Message key of each step's name, under retirement.steps. */
export const RETIREMENT_STEP_KEYS = {
	[RetirementStep.INTRO]: "intro",
	[RetirementStep.PERSONAL]: "personal",
	[RetirementStep.EXPENSES]: "expenses",
	[RetirementStep.HOUSING]: "housing",
	[RetirementStep.PENSIONS]: "pensions",
	[RetirementStep.PORTFOLIO]: "portfolio",
	[RetirementStep.ASSUMPTIONS]: "assumptions",
	[RetirementStep.RESULTS]: "results",
} as const satisfies Record<RetirementStep, string>;

/** Status of a stored plan. */
export type RetirementPlanStatus = "draft" | "active";
