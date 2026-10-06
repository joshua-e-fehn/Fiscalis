"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
	DEFAULT_CONSERVATIVE_RETURN,
	DEFAULT_INFLATION_RATE,
	DEFAULT_OPTIMISTIC_RETURN,
	DEFAULT_WITHDRAWAL_RATE,
	MAX_RETIREMENT_RATE,
	type RetirementAssumptionField,
	type RetirementInputs,
	validateRetirementAssumptions,
} from "@/lib/types/retirement";
import { formatRate } from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

interface RateFieldDef {
	key: RetirementAssumptionField;
	label: string;
	hint: string;
}

const FIELDS: RateFieldDef[] = [
	{
		key: "optimisticReturn",
		label: "Expected annual return",
		hint: `Long-run market growth. The default ${formatRate(DEFAULT_OPTIMISTIC_RETURN)} doubles a portfolio every 10 years.`,
	},
	{
		key: "conservativeReturn",
		label: "Conservative annual return",
		hint: "A cautious growth assumption for the safer estimate.",
	},
	{
		key: "inflationRate",
		label: "Inflation rate",
		hint: "How fast prices rise; raises your future expense target.",
	},
	{
		key: "withdrawalRate",
		label: "Safe withdrawal rate",
		hint: "The 4% rule. Lower = safer but needs a bigger portfolio.",
	},
];

/** 0.0718 → 7.18; an unset (NaN) rate shows as an empty field. */
function toPercentInput(rate: number): number | "" {
	return Number.isFinite(rate) ? +(rate * 100).toFixed(2) : "";
}

export function AssumptionsStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
}: RetirementStepProps) {
	// Raw text per field while typing, so clearing a field shows it empty (and
	// invalid) instead of silently turning it into 0%.
	const [drafts, setDrafts] = useState<
		Partial<Record<RetirementAssumptionField, string>>
	>({});
	const errors = validateRetirementAssumptions(data);
	const valid = Object.keys(errors).length === 0;

	const setRate = (key: RetirementAssumptionField, raw: string) => {
		setDrafts((prev) => ({ ...prev, [key]: raw }));
		update({
			[key]: raw.trim() === "" ? Number.NaN : Number(raw) / 100,
		} as Partial<RetirementInputs>);
	};

	const resetDefaults = () => {
		setDrafts({});
		update({
			optimisticReturn: DEFAULT_OPTIMISTIC_RETURN,
			conservativeReturn: DEFAULT_CONSERVATIVE_RETURN,
			inflationRate: DEFAULT_INFLATION_RATE,
			withdrawalRate: DEFAULT_WITHDRAWAL_RATE,
		});
	};

	return (
		<RetirementStepShell
			icon={SlidersHorizontal}
			title="Assumptions"
			description="Sensible defaults are filled in — adjust only if you know what you're doing."
			onNext={onNext}
			onBack={onBack}
			nextLabel="See my plan"
			nextDisabled={!valid}
			isSaving={isSaving}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				{FIELDS.map((field) => {
					const error = errors[field.key];
					return (
						<div key={field.key} className="space-y-1.5">
							<Label htmlFor={field.key}>{field.label}</Label>
							<div className="relative">
								<Input
									id={field.key}
									type="number"
									min={0}
									max={MAX_RETIREMENT_RATE * 100}
									step={0.1}
									value={drafts[field.key] ?? toPercentInput(data[field.key])}
									onChange={(e) => setRate(field.key, e.target.value)}
									aria-invalid={!!error}
									className="pr-8"
								/>
								<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
									%
								</span>
							</div>
							<p
								className={
									error
										? "text-xs text-destructive"
										: "text-xs text-muted-foreground"
								}
							>
								{error ?? field.hint}
							</p>
						</div>
					);
				})}
			</div>

			<Button variant="ghost" size="sm" onClick={resetDefaults}>
				<RotateCcw className="mr-1 h-3.5 w-3.5" />
				Reset to recommended defaults
			</Button>
		</RetirementStepShell>
	);
}
