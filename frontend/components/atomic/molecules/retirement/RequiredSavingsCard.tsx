"use client";

import { Gauge, PiggyBank } from "lucide-react";
import { calculateCapitalGainDurationWithCompoundInterest } from "@/../services/finance/financeService";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/shadcn/card";
import { useBaseCurrency } from "@/hooks/convex/portfolio";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { isOnTrack, type RetirementResults } from "@/lib/types/retirement";
import { cn } from "@/lib/utils";
import { formatCurrency, formatRate } from "@/lib/utils/currency";

interface Props {
	results: RetirementResults;
	className?: string;
}

function monthly(value: number, currency: InvestmentCurrency): string {
	if (!Number.isFinite(value)) return "—";
	return formatCurrency(value, currency);
}

/** "assumes 7.18% / yr — a portfolio that doubles roughly every 10 years" */
function expectedHint(annualReturn: number): string {
	if (annualReturn <= 0) return `assumes ${formatRate(annualReturn)} / yr`;
	const doublingYears = calculateCapitalGainDurationWithCompoundInterest(
		1,
		2,
		annualReturn,
	);
	return `assumes ${formatRate(annualReturn)} / yr — a portfolio that doubles roughly every ${Math.round(doublingYears)} years`;
}

export function RequiredSavingsCard({ results, className }: Props) {
	const currency = useBaseCurrency();
	const onTrack = isOnTrack(results);

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<PiggyBank className="h-4 w-4 text-primary" />
					How much to save each month
				</CardTitle>
			</CardHeader>
			<CardContent>
				{onTrack ? (
					<p className="text-sm text-muted-foreground">
						{results.pensionsCoverAll
							? "Your pensions cover your expected expenses, so you don't need to save toward a retirement portfolio."
							: "Based on your current assets and expected growth, you're on track to reach your goal without saving anything extra. Keep it up!"}
					</p>
				) : (
					<div className="space-y-3">
						<div className="grid gap-4 sm:grid-cols-2">
							<ScenarioBox
								label="Expected case"
								hint={expectedHint(results.optimistic.annualReturn)}
								value={monthly(results.optimistic.monthlyContribution, currency)}
								accent="primary"
							/>
							<ScenarioBox
								label="Conservative case"
								hint={`assumes a cautious ${formatRate(results.conservative.annualReturn)} / yr`}
								value={monthly(results.conservative.monthlyContribution, currency)}
								accent="muted"
							/>
						</div>
						<p className="text-xs text-muted-foreground">
							{results.contributionsIndexed
								? `First month's amount, rising with inflation — to ${monthly(results.optimistic.finalMonthlyContribution, currency)} (expected) by retirement.`
								: "A flat nominal amount each month until retirement; inflation makes the later payments worth less."}
						</p>
						{results.hasNetDebt && (
							<p className="text-xs text-muted-foreground">
								These amounts start from{" "}
								{formatCurrency(0, currency, { compact: true })} and don&apos;t include paying down
								your current debt.
							</p>
						)}
					</div>
				)}
				{results.residenceMortgage &&
					results.residenceMortgage.monthlyPayment > 0 && (
						<p className="mt-3 text-xs text-muted-foreground">
							On top of this, your home mortgage repayments of{" "}
							{formatCurrency(results.residenceMortgage.monthlyPayment, currency)}
							/mo continue from your income
							{results.residenceMortgage.balanceAtRetirement > 0
								? `; the ${formatCurrency(results.residenceMortgage.balanceAtRetirement, currency)} still owed at retirement is part of your target.`
								: " until the loan is repaid."}
						</p>
					)}
			</CardContent>
		</Card>
	);
}

function ScenarioBox({
	label,
	hint,
	value,
	accent,
}: {
	label: string;
	hint: string;
	value: string;
	accent: "primary" | "muted";
}) {
	return (
		<div
			className={cn(
				"rounded-xl border p-4",
				accent === "primary"
					? "border-primary/30 bg-primary/5"
					: "border-border bg-muted/30",
			)}
		>
			<div className="flex items-center gap-1.5 text-sm font-medium">
				<Gauge className="h-3.5 w-3.5 text-muted-foreground" />
				{label}
			</div>
			<p className="mt-2 text-2xl font-bold">
				{value}
				<span className="ml-1 text-sm font-normal text-muted-foreground">
					/ mo
				</span>
			</p>
			<p className="mt-1 text-xs text-muted-foreground">{hint}</p>
		</div>
	);
}
