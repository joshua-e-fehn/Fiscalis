"use client";

import { CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
	MAX_RETIREMENT_PLAN_AGE,
	MIN_RETIREMENT_PLAN_AGE,
	retirementAgeIssues,
} from "@/lib/types/retirement";
import { todayLocalISO, validateBirthDate } from "@/lib/utils/date";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import { useRetirementIssueMessage } from "../shared/useRetirementIssueMessage";
import type { RetirementStepProps } from "./types";

const TODAY_ISO = todayLocalISO();

/** Emphasis in the timeline copy (the <b> tag of its messages). */
function strong(chunks: ReactNode) {
	return <span className="font-medium text-foreground">{chunks}</span>;
}

function semibold(chunks: ReactNode) {
	return <span className="font-semibold text-foreground">{chunks}</span>;
}

interface PersonalStepProps extends RetirementStepProps {
	/** Date of birth being edited (seeded from the profile by the wizard). */
	birthDate: string;
	onBirthDateChange: (value: string) => void;
}

export function PersonalStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
	birthDate,
	onBirthDateChange,
}: PersonalStepProps) {
	const t = useTranslations("retirement");
	const tErrors = useTranslations("common.errors");
	const issueMessage = useRetirementIssueMessage();
	// The wizard derives data.currentAge from the date of birth and saves the
	// date to the profile together with the plan.
	const dob = birthDate ? validateBirthDate(birthDate) : null;
	const age = dob?.ok ? dob.age : null;
	const ageIssue =
		age !== null
			? retirementAgeIssues({
					currentAge: age,
					retirementAge: data.retirementAge,
				}).retirementAge
			: undefined;
	const valid = age !== null && !ageIssue;
	const years = valid ? data.retirementAge - age : null;

	return (
		<RetirementStepShell
			icon={CalendarClock}
			title={t("personalStep.title")}
			description={t("personalStep.description")}
			onNext={onNext}
			onBack={onBack}
			nextDisabled={!valid}
			isSaving={isSaving}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="birthDate">{t("personalStep.birthDate")}</Label>
					<Input
						id="birthDate"
						type="date"
						max={TODAY_ISO}
						value={birthDate}
						onChange={(e) => onBirthDateChange(e.target.value)}
					/>
					{age !== null && (
						<p className="text-xs text-muted-foreground">
							{t.rich("personalStep.currentAge", { age, b: strong })}
						</p>
					)}
				</div>
				<div className="space-y-2">
					<Label htmlFor="retirementAge">
						{t("personalStep.retirementAge")}
					</Label>
					<Input
						id="retirementAge"
						type="number"
						min={MIN_RETIREMENT_PLAN_AGE}
						max={MAX_RETIREMENT_PLAN_AGE}
						step={1}
						value={data.retirementAge || ""}
						onChange={(e) =>
							update({
								retirementAge: Math.round(Number(e.target.value)) || 0,
							})
						}
					/>
				</div>
			</div>

			<div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
				{valid && years !== null ? (
					<p>
						{t.rich("personalStep.yearsLeft", {
							years: t("years", { count: years }),
							b: semibold,
						})}
					</p>
				) : dob === null ? (
					<p className="text-muted-foreground">
						{t("personalStep.enterBirthDate")}
					</p>
				) : !dob.ok ? (
					<p className="text-destructive">
						{tErrors(`birthDate.${dob.code}`)}
					</p>
				) : (
					<p className="text-destructive">
						{ageIssue && issueMessage(ageIssue)}.
					</p>
				)}
			</div>
		</RetirementStepShell>
	);
}
