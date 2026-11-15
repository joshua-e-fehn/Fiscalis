"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ConvexError } from "convex/values";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useInlineSign } from "@/hooks/useInlineSign";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/shadcn/button";
import type { Id } from "@/convex/_generated/dataModel";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";
import { useSetBirthDate, useUserSettings } from "@/hooks/convex/onboarding";
import { planToInputs } from "@/../services/finance/retirementService";
import {
	useRetirementPlan,
	useSaveRetirementPlan,
} from "@/hooks/convex/retirement";
import {
	DEFAULT_RETIREMENT_INPUTS,
	firstRetirementInputIssue,
	type RetirementInputs,
	RetirementStep,
} from "@/lib/types/retirement";
import { useErrorMessage } from "@/i18n/errors";
import { getAgeFromBirthDate, validateBirthDate } from "@/lib/utils/date";
import { RetirementWizardProgress } from "./RetirementWizardProgress";
import { AssumptionsStep } from "./steps/AssumptionsStep";
import { ExpensesStep } from "./steps/ExpensesStep";
import { HousingStep } from "./steps/HousingStep";
import { IntroStep } from "./steps/IntroStep";
import { PensionsStep } from "./steps/PensionsStep";
import { PersonalStep } from "./steps/PersonalStep";
import { PortfolioStep } from "./steps/PortfolioStep";
import { ResultsStep } from "./steps/ResultsStep";
import { useRetirementIssueMessage } from "./shared/useRetirementIssueMessage";

interface RetirementWizardProps {
	/** Called after the plan is saved as active (e.g. to leave edit mode). */
	onSaved?: () => void;
	/** Leave edit mode of an active plan without saving (discards the edits). */
	onCancel?: () => void;
}

type PlanField = keyof RetirementInputs;

/** Plan fields collected by each step, in wizard order. */
const STEP_FIELDS: [RetirementStep, PlanField[]][] = [
	[RetirementStep.PERSONAL, ["currentAge", "retirementAge"]],
	[RetirementStep.EXPENSES, ["monthlyExpensesToday"]],
	[
		RetirementStep.HOUSING,
		[
			"ownsPrimaryResidence",
			"primaryResidenceLoanId",
			"primaryResidenceAccountId",
			"primaryResidenceMortgageRate",
			"primaryResidenceMortgagePayment",
			"fundableRealEstateEquity",
		],
	],
	[RetirementStep.PENSIONS, ["pensionSources", "pensionDeductionRate"]],
	[RetirementStep.PORTFOLIO, ["fundingTreatments"]],
	[
		RetirementStep.ASSUMPTIONS,
		[
			"inflationRate",
			"withdrawalRate",
			"optimisticReturn",
			"conservativeReturn",
			"withdrawalTaxRate",
			"indexContributions",
		],
	],
];

/** Fields the user has confirmed by advancing past `step` (all of them at RESULTS). */
function fieldsThrough(step: RetirementStep): PlanField[] {
	return STEP_FIELDS.filter(([s]) => s <= step).flatMap(([, fields]) => fields);
}

/**
 * The mutation args for `fields`. Unset optional fields are left out, except
 * the residence mortgage link and its terms: null unlinks or clears them.
 */
function pickFields(values: RetirementInputs, fields: PlanField[]) {
	const {
		primaryResidenceLoanId,
		primaryResidenceAccountId,
		primaryResidenceMortgageRate,
		primaryResidenceMortgagePayment,
		...rest
	} = Object.fromEntries(
		fields.map((f) => [f, values[f]]),
	) as Partial<RetirementInputs>;
	return {
		...rest,
		...(fields.includes("primaryResidenceLoanId")
			? {
					primaryResidenceLoanId:
						(primaryResidenceLoanId as Id<"loans"> | undefined) ?? null,
					primaryResidenceAccountId:
						(primaryResidenceAccountId as Id<"plaidAccounts"> | undefined) ??
						null,
					primaryResidenceMortgageRate: primaryResidenceMortgageRate ?? null,
					primaryResidenceMortgagePayment:
						primaryResidenceMortgagePayment ?? null,
				}
			: {}),
	};
}

/**
 * Horizontal slide in the direction of travel (1 = forward, -1 = back),
 * times useInlineSign() so it mirrors in RTL.
 */
const STEP_VARIANTS = {
	enter: (direction: number) => ({ opacity: 0, x: 50 * direction }),
	center: { opacity: 1, x: 0 },
	exit: (direction: number) => ({ opacity: 0, x: -50 * direction }),
};

export function RetirementWizard({ onSaved, onCancel }: RetirementWizardProps) {
	const plan = useRetirementPlan();
	const savePlan = useSaveRetirementPlan();
	const saveProfileBirthDate = useSetBirthDate();
	const settings = useUserSettings();
	const display = useDisplayCurrency();
	const t = useTranslations("retirement.wizard");
	const sign = useInlineSign();
	const tErrors = useTranslations("common.errors");
	const toErrorMessage = useErrorMessage();
	const issueMessage = useRetirementIssueMessage();
	// A fresh plan starts with one (editable) state pension row, named in the
	// user's language.
	const defaultPensionLabel = t("defaultPensionLabel");
	const defaultInputs = useMemo<RetirementInputs>(
		() => ({
			...DEFAULT_RETIREMENT_INPUTS,
			pensionSources: [{ label: defaultPensionLabel, monthlyAmount: 0 }],
		}),
		[defaultPensionLabel],
	);

	const [step, setStep] = useState<RetirementStep>(RetirementStep.INTRO);
	const [furthestStep, setFurthestStep] = useState<RetirementStep>(
		RetirementStep.INTRO,
	);
	const [direction, setDirection] = useState<1 | -1>(1);
	const [data, setData] = useState<RetirementInputs>(defaultInputs);
	const [birthDate, setBirthDate] = useState("");
	// Editing an ACTIVE plan: nothing is written until "Save my plan".
	const [editingActive, setEditingActive] = useState(false);
	const [hydrated, setHydrated] = useState(false);
	// The currency the form's amounts are in: the one it was filled in. Saves
	// and the preview use it, so a display currency that changes mid-session
	// never relabels the amounts (the user reloads the form in the new one).
	const [formCurrency, setFormCurrency] = useState<string | undefined>();
	const [isSaving, setIsSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	// Hydrate once from the stored plan (if any) and the profile date of birth,
	// again after "reload" when the display currency changed. The plan only
	// loads once the display currency has.
	useEffect(() => {
		if (hydrated || plan === undefined || settings === undefined) return;
		setFormCurrency(plan?.currency ?? display.code);
		if (!plan) {
			// Nothing stored to read in the new currency: start the amounts over
			setData((prev) => ({
				...defaultInputs,
				birthDate: prev.birthDate,
				currentAge: prev.currentAge,
			}));
		} else {
			const inputs = planToInputs(plan, settings?.birthDate);
			setData({
				...inputs,
				pensionSources:
					inputs.pensionSources.length > 0
						? inputs.pensionSources
						: defaultInputs.pensionSources,
			});
			// Editing an existing (active) plan starts at the first input step so the
			// user can review/change every answer; a draft resumes where they left off.
			const active = plan.status === "active";
			const resume = active
				? RetirementStep.PERSONAL
				: (plan.currentStep as RetirementStep);
			setEditingActive(active);
			setStep(resume);
			setFurthestStep(active ? RetirementStep.RESULTS : resume);
		}
		setBirthDate(settings?.birthDate ?? plan?.birthDate ?? "");
		setHydrated(true);
	}, [hydrated, plan, settings, display.code, defaultInputs]);

	const currencyChanged =
		hydrated && !display.isLoading && formCurrency !== display.code;

	const reloadInDisplayCurrency = useCallback(() => {
		setSaved(false);
		setSaveError(null);
		setHydrated(false);
	}, []);

	// The current age (and the exact horizon) follow the date of birth being edited.
	useEffect(() => {
		const age = getAgeFromBirthDate(birthDate);
		setData((prev) => {
			const next = {
				...prev,
				birthDate: age !== null ? birthDate : undefined,
				currentAge: age ?? prev.currentAge,
			};
			return next.currentAge === prev.currentAge &&
				next.birthDate === prev.birthDate
				? prev
				: next;
		});
	}, [birthDate]);

	const update = useCallback((patch: Partial<RetirementInputs>) => {
		setSaved(false);
		setSaveError(null);
		setData((prev) => ({ ...prev, ...patch }));
	}, []);

	const changeBirthDate = useCallback((value: string) => {
		setSaved(false);
		setSaveError(null);
		setBirthDate(value);
	}, []);

	// The date of birth isn't a plan input, so the shared validator can't check
	// it: saving a complete plan needs a valid one, as the Personal step does.
	const dob = useMemo(
		() => (birthDate ? validateBirthDate(birthDate) : null),
		[birthDate],
	);
	const dobError = !dob
		? t("birthDateRequired")
		: dob.ok
			? undefined
			: tErrors(`birthDate.${dob.code}`);

	/**
	 * Validate and save `fields` (plus the date of birth to the profile, if it
	 * changed). Resolves to whether the save succeeded; on failure the reason is
	 * shown inline via `saveError`.
	 */
	const persist = useCallback(
		async (
			nextStep: RetirementStep,
			fields: PlanField[],
			status?: "active",
		): Promise<boolean> => {
			setSaveError(null);
			const issue = firstRetirementInputIssue(data, {
				fields,
				requireValidTimeline: status === "active",
			});
			const firstError =
				(status === "active" ? dobError : undefined) ??
				(issue && issueMessage(issue));
			if (firstError) {
				setSaveError(firstError);
				return false;
			}

			const values: RetirementInputs = {
				...data,
				pensionSources: data.pensionSources.filter(
					(s) => s.label.trim() !== "" || s.monthlyAmount > 0,
				),
			};
			setIsSaving(true);
			try {
				// The profile holds the canonical date of birth (as in onboarding).
				if (dob?.ok && dob.value !== settings?.birthDate) {
					await saveProfileBirthDate({ birthDate: dob.value });
				}
				await savePlan(
					{
						currentStep: nextStep,
						...(status ? { status } : {}),
						...(dob?.ok ? { birthDate: dob.value } : {}),
						...pickFields(values, fields),
					},
					formCurrency,
				);
				return true;
			} catch (err) {
				console.error("Failed to save retirement plan:", err);
				// A coded server error in the user's language; anything else
				// (Convex hides its message in production) gets a generic one.
				setSaveError(
					err instanceof ConvexError ? toErrorMessage(err) : t("saveFailed"),
				);
				return false;
			} finally {
				setIsSaving(false);
			}
		},
		[
			data,
			dob,
			dobError,
			settings?.birthDate,
			savePlan,
			saveProfileBirthDate,
			formCurrency,
			t,
			issueMessage,
			toErrorMessage,
		],
	);

	const goToStep = useCallback(
		(target: RetirementStep) => {
			setSaveError(null);
			setDirection(target >= step ? 1 : -1);
			setStep(target);
			setFurthestStep((f) => Math.max(f, target) as RetirementStep);
		},
		[step],
	);

	const goNext = useCallback(async () => {
		const next = Math.min(step + 1, RetirementStep.RESULTS) as RetirementStep;
		// A draft persists progress from the first data step onward (skip the
		// intro); edits to an active plan stay local until Save.
		if (step >= RetirementStep.PERSONAL && !editingActive) {
			const ok = await persist(next, fieldsThrough(step));
			if (!ok) return;
		}
		goToStep(next);
	}, [step, editingActive, persist, goToStep]);

	const goBack = useCallback(() => {
		goToStep(Math.max(step - 1, RetirementStep.INTRO) as RetirementStep);
	}, [step, goToStep]);

	const handleSave = useCallback(async () => {
		const ok = await persist(
			RetirementStep.RESULTS,
			fieldsThrough(RetirementStep.RESULTS),
			"active",
		);
		if (!ok) return;
		setSaved(true);
		onSaved?.();
	}, [persist, onSaved]);

	if (!hydrated) return null;

	const stepProps = {
		data,
		update,
		onNext: goNext,
		onBack: goBack,
		isSaving,
		currency: formCurrency,
	};

	return (
		<div className="space-y-8 pb-12">
			{editingActive && onCancel && (
				<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm">
					<span className="text-muted-foreground">{t("editingBanner")}</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={onCancel}
						disabled={isSaving}
					>
						<X className="me-1 h-4 w-4" />
						{t("discardChanges")}
					</Button>
				</div>
			)}

			{currencyChanged && (
				<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm">
					<span className="text-muted-foreground">
						{t("currencyChanged", {
							display: display.code,
							form: formCurrency ?? display.code,
						})}
					</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={reloadInDisplayCurrency}
						disabled={isSaving}
					>
						{t("reloadInCurrency", { currency: display.code })}
					</Button>
				</div>
			)}

			{!currencyChanged && plan && plan.storedCurrency !== plan.currency && (
				<p className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
					{t("storedCurrency", {
						stored: plan.storedCurrency,
						shown: plan.currency,
					})}
				</p>
			)}

			{step !== RetirementStep.INTRO && (
				<RetirementWizardProgress
					currentStep={step}
					furthestStep={furthestStep}
					onStepClick={isSaving ? undefined : goToStep}
				/>
			)}

			<div>
				<AnimatePresence mode="wait" custom={direction * sign}>
					<motion.div
						key={step}
						custom={direction * sign}
						variants={STEP_VARIANTS}
						initial="enter"
						animate="center"
						exit="exit"
						transition={{ type: "spring", stiffness: 300, damping: 28 }}
					>
						{step === RetirementStep.INTRO && (
							<IntroStep onNext={goNext} hasExistingPlan={!!plan} />
						)}
						{step === RetirementStep.PERSONAL && (
							<PersonalStep
								{...stepProps}
								birthDate={birthDate}
								onBirthDateChange={changeBirthDate}
							/>
						)}
						{step === RetirementStep.EXPENSES && <ExpensesStep {...stepProps} />}
						{step === RetirementStep.HOUSING && <HousingStep {...stepProps} />}
						{step === RetirementStep.PENSIONS && <PensionsStep {...stepProps} />}
						{step === RetirementStep.PORTFOLIO && (
							<PortfolioStep {...stepProps} />
						)}
						{step === RetirementStep.ASSUMPTIONS && (
							<AssumptionsStep {...stepProps} />
						)}
						{step === RetirementStep.RESULTS && (
							<ResultsStep
								data={data}
								onBack={goBack}
								onSave={handleSave}
								isSaving={isSaving}
								saved={saved}
								blockingError={dobError}
								currency={formCurrency}
							/>
						)}
					</motion.div>
				</AnimatePresence>

				{saveError && (
					<p role="alert" className="mt-3 text-end text-sm text-destructive">
						{saveError}
					</p>
				)}
			</div>
		</div>
	);
}
