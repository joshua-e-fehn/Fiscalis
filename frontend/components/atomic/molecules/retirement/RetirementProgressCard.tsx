"use client";

import { AlertTriangle, Target, TrendingUp } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/shadcn/card";
import { formatYears, type RetirementResults } from "@/lib/types/retirement";
import { cn } from "@/lib/utils";
import { formatCurrency, formatRate } from "@/lib/utils/currency";

interface Props {
	results: RetirementResults;
	className?: string;
}

export function RetirementProgressCard({ results, className }: Props) {
	// Headline progress is the conservative scenario's (the one isOnTrack also
	// requires). Never negative but may exceed 1 (ahead of the target).
	const rawPct = results.progressPct;
	const expectedPctLabel = (results.optimistic.progressPct * 100).toFixed(0);
	const barPct = Math.max(0, Math.min(1, rawPct));
	const pctLabel = (rawPct * 100).toFixed(0);
	const hasTarget = Number.isFinite(results.targetPortfolio);

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Target className="h-4 w-4 text-primary" />
					Your retirement goal
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="flex items-end justify-between">
					<div>
						<p className="text-sm text-muted-foreground">
							Target portfolio needed
						</p>
						<p className="text-3xl font-bold">
							{hasTarget ? formatCurrency(results.targetPortfolio, "eur") : "—"}
						</p>
					</div>
					<div className="text-right">
						<p className="text-sm text-muted-foreground">In</p>
						<p className="text-xl font-semibold">
							{formatYears(results.yearsToRetirement)}
						</p>
					</div>
				</div>

				{/* Progress bar */}
				<div className="space-y-2">
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">
							Progress today (conservative)
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
							Your current{" "}
							<span className="font-medium text-foreground">
								{formatCurrency(results.investableNow, "eur")}
							</span>{" "}
							grows to{" "}
							<span className="font-medium text-foreground">
								{formatCurrency(results.conservative.projectedFromCurrent, "eur")}
							</span>{" "}
							by retirement at a cautious{" "}
							{formatRate(results.conservative.baseReturn)} per year — that&apos;s{" "}
							<span className="font-medium text-foreground">{pctLabel}%</span>{" "}
							of the target shown above (before adding any monthly savings). At
							the expected {formatRate(results.optimistic.baseReturn)} it would
							be {expectedPctLabel}%.
						</p>
					)}
				</div>

				{results.hasNetDebt && (
					<div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
						<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
						<span>
							Your liabilities exceed your assets by{" "}
							{formatCurrency(-results.fundableNow, "eur")}. Your plan starts
							from €0, so paying down that debt comes on top of the monthly
							savings we calculate.
						</span>
					</div>
				)}

				{results.pensionsCoverAll && (
					<div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
						<TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
						<span>
							Your pension income already covers your expected expenses — no
							portfolio drawdown required.
						</span>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
