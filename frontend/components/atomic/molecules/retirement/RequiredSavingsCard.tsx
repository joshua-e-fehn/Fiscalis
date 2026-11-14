"use client";

import { Gauge, PiggyBank } from "lucide-react";
import { useTranslations } from "next-intl";
import { calculateCapitalGainDurationWithCompoundInterest } from "@/../services/finance/financeService";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/shadcn/card";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { isOnTrack, type RetirementResults } from "@/lib/types/retirement";
import { cn } from "@/lib/utils";
import { formatCurrency, formatRate } from "@/lib/utils/currency";

interface Props {
	/** The currency `results` is in */
	currency: InvestmentCurrency;
	results: RetirementResults;
	className?: string;
}

function monthly(value: number, currency: InvestmentCurrency): string {
	if (!Number.isFinite(value)) return "—";
	return formatCurrency(value, currency);
}

/** Years for a portfolio growing at `annualReturn` to double, or null without growth. */
function doublingYears(annualReturn: number): number | null {
	if (annualReturn <= 0) return null;
	return Math.round(
		calculateCapitalGainDurationWithCompoundInterest(1, 2, annualReturn),
	);
}

export function RequiredSavingsCard({ results, currency, className }: Props) {
	const onTrack = isOnTrack(results);
	const t = useTranslations("retirement");
	const expectedRate = formatRate(results.optimistic.annualReturn);
	const doubling = doublingYears(results.optimistic.annualReturn);
	const mortgage = results.residenceMortgage;

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<PiggyBank className="h-4 w-4 text-primary" />
					{t("savingsCard.title")}
				</CardTitle>
			</CardHeader>
			<CardContent>
				{onTrack ? (
					<p className="text-sm text-muted-foreground">
						{results.pensionsCoverAll
							? t("savingsCard.pensionsCoverAll")
							: t("savingsCard.onTrack")}
					</p>
				) : (
					<div className="space-y-3">
						<div className="grid gap-4 sm:grid-cols-2">
							<ScenarioBox
								label={t("savingsCard.expectedCase")}
								hint={
									doubling === null
										? t("savingsCard.expectedHintNoGrowth", {
												rate: expectedRate,
											})
										: t("savingsCard.expectedHint", {
												rate: expectedRate,
												years: doubling,
											})
								}
								value={monthly(results.optimistic.monthlyContribution, currency)}
								accent="primary"
							/>
							<ScenarioBox
								label={t("savingsCard.conservativeCase")}
								hint={t("savingsCard.conservativeHint", {
									rate: formatRate(results.conservative.annualReturn),
								})}
								value={monthly(results.conservative.monthlyContribution, currency)}
								accent="muted"
							/>
						</div>
						<p className="text-xs text-muted-foreground">
							{results.contributionsIndexed
								? t("savingsCard.indexed", {
										amount: monthly(
											results.optimistic.finalMonthlyContribution,
											currency,
										),
									})
								: t("savingsCard.flat")}
						</p>
						{results.hasNetDebt && (
							<p className="text-xs text-muted-foreground">
								{t("savingsCard.netDebt", {
									zero: formatCurrency(0, currency, { compact: true }),
								})}
							</p>
						)}
					</div>
				)}
				{mortgage && !mortgage.balanceProjected && (
					<p className="mt-3 text-xs text-muted-foreground">
						{t("savingsCard.mortgageNotProjected", {
							balance: formatCurrency(mortgage.balanceAtRetirement, currency),
						})}
					</p>
				)}
				{mortgage &&
					mortgage.balanceProjected &&
					mortgage.monthlyPayment > 0 && (
						<p className="mt-3 text-xs text-muted-foreground">
							{mortgage.balanceAtRetirement > 0
								? t("savingsCard.mortgageOwedAtRetirement", {
										payment: formatCurrency(mortgage.monthlyPayment, currency),
										balance: formatCurrency(
											mortgage.balanceAtRetirement,
											currency,
										),
									})
								: t("savingsCard.mortgageRepaidBefore", {
										payment: formatCurrency(mortgage.monthlyPayment, currency),
									})}
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
	const t = useTranslations("retirement");
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
					{t("perMonthUnit")}
				</span>
			</p>
			<p className="mt-1 text-xs text-muted-foreground">{hint}</p>
		</div>
	);
}
