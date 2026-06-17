"use client";

import { Wallet } from "lucide-react";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { inflateToFuture } from "@/lib/types/retirement";
import { formatCurrency } from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

export function ExpensesStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
}: RetirementStepProps) {
	const years = Math.max(0, data.retirementAge - data.currentAge);
	const future = inflateToFuture(
		data.monthlyExpensesToday,
		data.inflationRate,
		years,
	);
	const valid = data.monthlyExpensesToday > 0;

	return (
		<RetirementStepShell
			icon={Wallet}
			title="Desired lifestyle"
			description="The minimum monthly income you'd want in retirement, in today's money."
			onNext={onNext}
			onBack={onBack}
			nextDisabled={!valid}
			isSaving={isSaving}
		>
			<div className="space-y-2">
				<Label htmlFor="expenses">Monthly living expenses (today)</Label>
				<div className="relative">
					<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
						€
					</span>
					<Input
						id="expenses"
						type="number"
						min={0}
						step={100}
						className="pl-7"
						value={data.monthlyExpensesToday || ""}
						onChange={(e) =>
							update({ monthlyExpensesToday: Number(e.target.value) || 0 })
						}
					/>
				</div>
				<p className="text-xs text-muted-foreground">
					If you own your home, exclude rent — owning it already lowers this
					number.
				</p>
			</div>

			{valid && years > 0 && (
				<div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
					<p>
						After {years} years of ~{(data.inflationRate * 100).toFixed(0)}%
						inflation, that&apos;s about{" "}
						<span className="font-semibold text-foreground">
							{formatCurrency(future, "eur")}/mo
						</span>{" "}
						when you retire — the same lifestyle just costs more.
					</p>
				</div>
			)}
		</RetirementStepShell>
	);
}
