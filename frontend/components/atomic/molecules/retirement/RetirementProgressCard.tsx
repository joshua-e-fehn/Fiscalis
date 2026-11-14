"use client";

import { AlertTriangle, Target, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/shadcn/card";
import { type RetirementResults, roundYears } from "@/lib/types/retirement";
import { cn } from "@/lib/utils";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { formatCurrency, formatRate } from "@/lib/utils/currency";

interface Props {
	/** The currency `results` is in */
	currency: InvestmentCurrency;
	results: RetirementResults;
	className?: string;
}

/** An amount called out in the copy (the <b> tag of its messages). */
function strong(chunks: ReactNode) {
	return <span className="font-medium text-foreground">{chunks}</span>;
}

export function RetirementProgressCard({ results, currency, className }: Props) {
	// Headline progress is the conservative scenario's (the one isOnTrack also
	// requires). Never negative but may exceed 1 (ahead of the target).
	const rawPct = results.progressPct;
	const expectedPctLabel = (results.optimistic.progressPct * 100).toFixed(0);
	const barPct = Math.max(0, Math.min(1, rawPct));
	const pctLabel = (rawPct * 100).toFixed(0);
	const hasTarget = Number.isFinite(results.targetPortfolio);
	const t = useTranslations("retirement");

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Target className="h-4 w-4 text-primary" />
					{t("progressCard.title")}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="flex items-end justify-between">
					<div>
						<p className="text-sm text-muted-foreground">
							{t("progressCard.target")}
						</p>
						<p className="text-3xl font-bold">
							{hasTarget ? formatCurrency(results.targetPortfolio, currency) : "—"}
						</p>
					</div>
					<div className="text-right">
						<p className="text-sm text-muted-foreground">
							{t("progressCard.in")}
						</p>
						<p className="text-xl font-semibold">
							{t("years", { count: roundYears(results.yearsToRetirement) })}
						</p>
					</div>
				</div>

				{/* Progress bar */}
				<div className="space-y-2">
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">
							{t("progressCard.progressToday")}
						</span>
						<span className="font-medium">{pctLabel}%</span>
					</div>
					<div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
						<div
							className={cn(
								"h-full rounded-full transition-all duration-500",
								barPct >= 1 ? "bg-emerald-500" : "bg-primary",
							)}
							style={{ width: `${barPct * 100}%` }}
						/>
					</div>
					{hasTarget && !results.pensionsCoverAll && !results.hasNetDebt && (
						<p className="text-xs text-muted-foreground">
							{t.rich("progressCard.growth", {
								b: strong,
								current: formatCurrency(results.investableNow, currency),
								projected: formatCurrency(
									results.conservative.projectedFromCurrent,
									currency,
								),
								rate: formatRate(results.conservative.baseReturn),
								pct: pctLabel,
								expectedRate: formatRate(results.optimistic.baseReturn),
								expectedPct: expectedPctLabel,
							})}
						</p>
					)}
				</div>

				{results.hasNetDebt && (
					<div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
						<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
						<span>
							{t("progressCard.netDebt", {
								debt: formatCurrency(-results.fundableNow, currency),
								zero: formatCurrency(0, currency, { compact: true }),
							})}
						</span>
					</div>
				)}

				{results.pensionsCoverAll && (
					<div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
						<TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
						<span>{t("progressCard.pensionsCoverAll")}</span>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
