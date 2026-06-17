"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import type { RetirementInputs } from "@/lib/types/retirement";
import {
	DEFAULT_CONSERVATIVE_RETURN,
	DEFAULT_INFLATION_RATE,
	DEFAULT_OPTIMISTIC_RETURN,
	DEFAULT_WITHDRAWAL_RATE,
} from "@/lib/types/retirement";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

interface RateFieldDef {
	key: keyof Pick<
		RetirementInputs,
		| "optimisticReturn"
		| "conservativeReturn"
		| "inflationRate"
		| "withdrawalRate"
	>;
	label: string;
	hint: string;
}

const FIELDS: RateFieldDef[] = [
	{
		key: "optimisticReturn",
		label: "Expected annual return",
		hint: "Long-run market growth. ~7.2% doubles a portfolio every 10 years.",
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

export function AssumptionsStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
}: RetirementStepProps) {
	const resetDefaults = () =>
		update({
			optimisticReturn: DEFAULT_OPTIMISTIC_RETURN,
			conservativeReturn: DEFAULT_CONSERVATIVE_RETURN,
			inflationRate: DEFAULT_INFLATION_RATE,
			withdrawalRate: DEFAULT_WITHDRAWAL_RATE,
		});

	return (
		<RetirementStepShell
			icon={SlidersHorizontal}
			title="Assumptions"
			description="Sensible defaults are filled in — adjust only if you know what you're doing."
			onNext={onNext}
			onBack={onBack}
			nextLabel="See my plan"
			isSaving={isSaving}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				{FIELDS.map((field) => (
					<div key={field.key} className="space-y-1.5">
						<Label htmlFor={field.key}>{field.label}</Label>
						<div className="relative">
							<Input
								id={field.key}
								type="number"
								min={0}
								max={100}
								step={0.1}
								value={+(data[field.key] * 100).toFixed(2)}
								onChange={(e) =>
									update({
										[field.key]: (Number(e.target.value) || 0) / 100,
									} as Partial<RetirementInputs>)
								}
								className="pr-8"
							/>
							<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
								%
							</span>
						</div>
						<p className="text-xs text-muted-foreground">{field.hint}</p>
					</div>
				))}
			</div>

			<Button variant="ghost" size="sm" onClick={resetDefaults}>
				<RotateCcw className="mr-1 h-3.5 w-3.5" />
				Reset to recommended defaults
			</Button>
		</RetirementStepShell>
	);
}
