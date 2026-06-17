"use client";

import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUserSettings } from "@/hooks/convex/onboarding";
import {
	useRetirementPlan,
	useSaveRetirementPlan,
} from "@/hooks/convex/retirement";
import {
	DEFAULT_RETIREMENT_INPUTS,
	type RetirementInputs,
	RetirementStep,
} from "@/lib/types/retirement";
import { getAgeFromBirthDate } from "@/lib/utils/date";
import { RetirementWizardProgress } from "./RetirementWizardProgress";
import { AssumptionsStep } from "./steps/AssumptionsStep";
import { ExpensesStep } from "./steps/ExpensesStep";
import { HousingStep } from "./steps/HousingStep";
import { IntroStep } from "./steps/IntroStep";
import { PensionsStep } from "./steps/PensionsStep";
import { PersonalStep } from "./steps/PersonalStep";
import { PortfolioStep } from "./steps/PortfolioStep";
import { ResultsStep } from "./steps/ResultsStep";

interface RetirementWizardProps {
	/** Called after the plan is saved as active (e.g. to leave edit mode). */
	onSaved?: () => void;
}

/** Convert a stored plan document into the editable input shape. */
function planToInputs(
	plan: NonNullable<ReturnType<typeof useRetirementPlan>>,
): RetirementInputs {
	return {
		currentAge: plan.currentAge,
		retirementAge: plan.retirementAge,
		monthlyExpensesToday: plan.monthlyExpensesToday,
		ownsPrimaryResidence: plan.ownsPrimaryResidence,
		fundableRealEstateEquity: plan.fundableRealEstateEquity ?? 0,
		pensionSources:
			plan.pensionSources.length > 0
				? plan.pensionSources
				: DEFAULT_RETIREMENT_INPUTS.pensionSources,
		inflationRate: plan.inflationRate,
		withdrawalRate: plan.withdrawalRate,
		optimisticReturn: plan.optimisticReturn,
		conservativeReturn: plan.conservativeReturn,
	};
}

export function RetirementWizard({ onSaved }: RetirementWizardProps) {
	const plan = useRetirementPlan();
	const savePlan = useSaveRetirementPlan();
	const settings = useUserSettings();

	const [step, setStep] = useState<RetirementStep>(RetirementStep.INTRO);
	const [data, setData] = useState<RetirementInputs>(DEFAULT_RETIREMENT_INPUTS);
	const [isSaving, setIsSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const hydrated = useRef(false);

	// Hydrate once from the stored plan (if any).
	useEffect(() => {
		if (hydrated.current || plan === undefined) return;
		if (plan) {
			setData(planToInputs(plan));
			// Editing an existing (active) plan starts at the first input step so the
			// user can review/change every answer; a draft resumes where they left off.
			const resume =
				plan.status === "active"
					? RetirementStep.PERSONAL
					: ((plan.currentStep as RetirementStep) ?? RetirementStep.INTRO);
			setStep(resume);
		}
		hydrated.current = true;
	}, [plan]);

	const update = useCallback((patch: Partial<RetirementInputs>) => {
		setSaved(false);
		setData((prev) => ({ ...prev, ...patch }));
	}, []);

	// Derive the current age from the canonical profile date of birth.
	const profileBirthDate = settings?.birthDate;
	useEffect(() => {
		const derived = getAgeFromBirthDate(profileBirthDate);
		if (derived !== null) {
			setData((prev) =>
				prev.currentAge === derived ? prev : { ...prev, currentAge: derived },
			);
		}
	}, [profileBirthDate]);

	// Persist the working draft and advance.
	const persist = useCallback(
		async (nextStep: RetirementStep, status?: "draft" | "active") => {
			setIsSaving(true);
			try {
				await savePlan({
					currentStep: nextStep,
					...(status ? { status } : {}),
					...(profileBirthDate ? { birthDate: profileBirthDate } : {}),
					currentAge: data.currentAge,
					retirementAge: data.retirementAge,
					monthlyExpensesToday: data.monthlyExpensesToday,
					ownsPrimaryResidence: data.ownsPrimaryResidence,
					fundableRealEstateEquity: data.fundableRealEstateEquity,
					pensionSources: data.pensionSources.filter(
						(s) => s.label.trim() !== "" || s.monthlyAmount > 0,
					),
					inflationRate: data.inflationRate,
					withdrawalRate: data.withdrawalRate,
					optimisticReturn: data.optimisticReturn,
					conservativeReturn: data.conservativeReturn,
				});
			} catch (err) {
				console.error("Failed to save retirement plan:", err);
			} finally {
				setIsSaving(false);
			}
		},
		[data, savePlan, profileBirthDate],
	);

	const goNext = useCallback(() => {
		const next = Math.min(step + 1, RetirementStep.RESULTS) as RetirementStep;
		setStep(next);
		// Persist progress from the first data step onward (skip the intro).
		if (step >= RetirementStep.PERSONAL) void persist(next);
	}, [step, persist]);

	const goBack = useCallback(() => {
		setStep((s) => Math.max(s - 1, RetirementStep.INTRO) as RetirementStep);
	}, []);

	const goToStep = useCallback((target: RetirementStep) => {
		setStep(target);
	}, []);

	const handleSave = useCallback(async () => {
		await persist(RetirementStep.RESULTS, "active");
		setSaved(true);
		onSaved?.();
	}, [persist, onSaved]);

	return (
		<div className="space-y-8 pb-12">
			{step !== RetirementStep.INTRO && (
				<RetirementWizardProgress currentStep={step} onStepClick={goToStep} />
			)}

			<AnimatePresence mode="wait">
				<div key={step}>
					{step === RetirementStep.INTRO && (
						<IntroStep onNext={goNext} hasExistingPlan={!!plan} />
					)}
					{step === RetirementStep.PERSONAL && (
						<PersonalStep
							data={data}
							update={update}
							onNext={goNext}
							onBack={goBack}
							isSaving={isSaving}
						/>
					)}
					{step === RetirementStep.EXPENSES && (
						<ExpensesStep
							data={data}
							update={update}
							onNext={goNext}
							onBack={goBack}
							isSaving={isSaving}
						/>
					)}
					{step === RetirementStep.HOUSING && (
						<HousingStep
							data={data}
							update={update}
							onNext={goNext}
							onBack={goBack}
							isSaving={isSaving}
						/>
					)}
					{step === RetirementStep.PENSIONS && (
						<PensionsStep
							data={data}
							update={update}
							onNext={goNext}
							onBack={goBack}
							isSaving={isSaving}
						/>
					)}
					{step === RetirementStep.PORTFOLIO && (
						<PortfolioStep
							data={data}
							update={update}
							onNext={goNext}
							onBack={goBack}
							isSaving={isSaving}
						/>
					)}
					{step === RetirementStep.ASSUMPTIONS && (
						<AssumptionsStep
							data={data}
							update={update}
							onNext={goNext}
							onBack={goBack}
							isSaving={isSaving}
						/>
					)}
					{step === RetirementStep.RESULTS && (
						<ResultsStep
							data={data}
							onBack={goBack}
							onSave={handleSave}
							isSaving={isSaving}
							saved={saved}
						/>
					)}
				</div>
			</AnimatePresence>
		</div>
	);
}
