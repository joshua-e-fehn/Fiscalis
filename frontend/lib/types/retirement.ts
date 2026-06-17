// Retirement Planner ("Rentenplaner") — shared frontend types.
//
// The financial model types and default assumptions live in the pure service
// (services/finance/retirementService.ts) so the math has a single source of
// truth. This file re-exports them and adds UI-only concepts (wizard steps).

export type {
	PensionSource,
	ProjectionPoint,
	RetirementInputs,
	RetirementResults,
	ScenarioResult,
} from "@/../services/finance/retirementService";

export {
	computeRetirementResults,
	DEFAULT_CONSERVATIVE_RETURN,
	DEFAULT_INFLATION_RATE,
	DEFAULT_OPTIMISTIC_RETURN,
	DEFAULT_WITHDRAWAL_RATE,
	inflateToFuture,
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
	pensionSources: [{ label: "State pension", monthlyAmount: 0 }],
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

export const RETIREMENT_STEP_LABELS: Record<RetirementStep, string> = {
	[RetirementStep.INTRO]: "Start",
	[RetirementStep.PERSONAL]: "Age",
	[RetirementStep.EXPENSES]: "Expenses",
	[RetirementStep.HOUSING]: "Housing",
	[RetirementStep.PENSIONS]: "Pensions",
	[RetirementStep.PORTFOLIO]: "Portfolio",
	[RetirementStep.ASSUMPTIONS]: "Assumptions",
	[RetirementStep.RESULTS]: "Results",
};

/** Status of a stored plan. */
export type RetirementPlanStatus = "draft" | "active";
