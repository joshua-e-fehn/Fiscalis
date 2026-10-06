"use client";

import { CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
	MAX_RETIREMENT_PLAN_AGE,
	MIN_RETIREMENT_PLAN_AGE,
	validateRetirementAges,
} from "@/lib/types/retirement";
import { todayLocalISO, validateBirthDate } from "@/lib/utils/date";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

const TODAY_ISO = todayLocalISO();

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
	// The wizard derives data.currentAge from the date of birth and saves the
	// date to the profile together with the plan.
	const dob = birthDate ? validateBirthDate(birthDate) : null;
	const age = dob?.ok ? dob.age : null;
	const ageError =
		age !== null
			? validateRetirementAges({
					currentAge: age,
					retirementAge: data.retirementAge,
				}).retirementAge
			: undefined;
	const valid = age !== null && !ageError;
	const years = valid ? data.retirementAge - age : null;

	return (
		<RetirementStepShell
			icon={CalendarClock}
			title="Your timeline"
			description="When were you born, and when do you want to retire?"
			onNext={onNext}
			onBack={onBack}
			nextDisabled={!valid}
			isSaving={isSaving}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="birthDate">Date of birth</Label>
					<Input
						id="birthDate"
						type="date"
						max={TODAY_ISO}
						value={birthDate}
						onChange={(e) => onBirthDateChange(e.target.value)}
					/>
					{age !== null && (
						<p className="text-xs text-muted-foreground">
							You are <span className="font-medium text-foreground">{age}</span>{" "}
							years old.
						</p>
					)}
				</div>
				<div className="space-y-2">
					<Label htmlFor="retirementAge">Retirement age</Label>
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
						You have{" "}
						<span className="font-semibold text-foreground">{years} years</span>{" "}
						to build your retirement portfolio.
					</p>
				) : dob === null ? (
					<p className="text-muted-foreground">
						Enter your date of birth so we can work out your age.
					</p>
				) : !dob.ok ? (
					<p className="text-destructive">{dob.error}.</p>
				) : (
					<p className="text-destructive">{ageError}.</p>
				)}
			</div>
		</RetirementStepShell>
	);
}
