"use client";

import { Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { useRetirementAmountsCurrency } from "@/hooks/convex/retirement";
import {
	inflateToFuture,
	retirementTimeline,
	roundYears,
	validateRetirementInputs,
} from "@/lib/types/retirement";
import {
	currencySymbols,
	formatCurrency,
	formatRate,
} from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

function semibold(chunks: ReactNode) {
	return <span className="font-semibold text-foreground">{chunks}</span>;
}

export function ExpensesStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
	currency: inputsCurrency,
}: RetirementStepProps) {
	const t = useTranslations("retirement");
	const currency = useRetirementAmountsCurrency(inputsCurrency);
	const years = Math.max(0, retirementTimeline(data).yearsToRetirement);
	const future = inflateToFuture(
		data.monthlyExpensesToday,
		data.inflationRate,
		years,
	);
	const valid = !validateRetirementInputs(data).monthlyExpensesToday;

	return (
		<RetirementStepShell
			icon={Wallet}
			title={t("expensesStep.title")}
			description={t("expensesStep.description")}
			onNext={onNext}
			onBack={onBack}
			nextDisabled={!valid}
			isSaving={isSaving}
		>
			<div className="space-y-2">
				<Label htmlFor="expenses">{t("expensesStep.label")}</Label>
				<div className="relative">
					<span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground">
						{currencySymbols[currency].trim()}
					</span>
					<Input
						id="expenses"
						type="number"
						min={0}
						step={100}
						className="ps-7"
						value={data.monthlyExpensesToday || ""}
						onChange={(e) =>
							update({ monthlyExpensesToday: Number(e.target.value) || 0 })
						}
					/>
				</div>
				<p className="text-xs text-muted-foreground">
					{t("expensesStep.hint")}
				</p>
			</div>

			{valid && years > 0 && Number.isFinite(future) && (
				<div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
					<p>
						{t.rich("expensesStep.future", {
							years: t("yearsDative", { count: roundYears(years) }),
							rate: formatRate(data.inflationRate),
							amount: t("perMonth", {
								amount: formatCurrency(future, currency),
							}),
							b: semibold,
						})}
					</p>
				</div>
			)}
		</RetirementStepShell>
	);
}
