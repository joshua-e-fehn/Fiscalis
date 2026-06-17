"use client";

import { CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { useSetBirthDate, useUserSettings } from "@/hooks/convex/onboarding";
import { getAgeFromBirthDate } from "@/lib/utils/date";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

const TODAY_ISO = new Date().toISOString().split("T")[0];

export function PersonalStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
}: RetirementStepProps) {
	const settings = useUserSettings();
	const setBirthDate = useSetBirthDate();

	const [dob, setDob] = useState("");
	const [persisting, setPersisting] = useState(false);
	const seeded = settings !== undefined;

	// Seed the input from the saved profile date of birth (once, without
	// clobbering anything the user has already typed).
	useEffect(() => {
		if (settings?.birthDate && dob === "") {
			setDob(settings.birthDate);
		}
	}, [settings, dob]);

	const age = getAgeFromBirthDate(dob);

	// Keep the wizard's currentAge in sync with the derived age.
	useEffect(() => {
		if (age !== null && age !== data.currentAge) {
			update({ currentAge: age });
		}
	}, [age, data.currentAge, update]);

	const years = age !== null ? data.retirementAge - age : null;
	const valid =
		age !== null && data.retirementAge > age && data.retirementAge <= 120;

	const handleNext = async () => {
		// Persist the date of birth to the profile so it's stored canonically,
		// exactly as it would be from onboarding.
		if (dob && dob !== settings?.birthDate) {
			setPersisting(true);
			try {
				await setBirthDate({ birthDate: dob });
			} catch (err) {
				console.error("Failed to save date of birth:", err);
			} finally {
				setPersisting(false);
			}
		}
		onNext();
	};

	return (
		<RetirementStepShell
			icon={CalendarClock}
			title="Your timeline"
			description="When were you born, and when do you want to retire?"
			onNext={handleNext}
			onBack={onBack}
			nextDisabled={!valid}
			isSaving={isSaving || persisting}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="birthDate">Date of birth</Label>
					<Input
						id="birthDate"
						type="date"
						max={TODAY_ISO}
						value={dob}
						disabled={!seeded}
						onChange={(e) => setDob(e.target.value)}
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
						min={0}
						max={120}
						value={data.retirementAge || ""}
						onChange={(e) =>
							update({ retirementAge: Number(e.target.value) || 0 })
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
				) : age === null ? (
					<p className="text-muted-foreground">
						Enter your date of birth so we can work out your age.
					</p>
				) : (
					<p className="text-muted-foreground">
						Your retirement age needs to be later than your current age.
					</p>
				)}
			</div>
		</RetirementStepShell>
	);
}
