"use client";

import { Target, TrendingUp } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/shadcn/card";
import type { RetirementResults } from "@/lib/types/retirement";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";

interface Props {
	results: RetirementResults;
	className?: string;
}

export function RetirementProgressCard({ results, className }: Props) {
	const rawPct = results.progressPct;
	const barPct = Math.max(0, Math.min(1, rawPct));
	const pctLabel = (rawPct * 100).toFixed(0);
	const expectedReturnPct = (results.optimistic.annualReturn * 100).toFixed(1);

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
							{Number.isFinite(results.targetPortfolio)
								? formatCurrency(results.targetPortfolio, "eur")
								: "—"}
						</p>
					</div>
					<div className="text-right">
						<p className="text-sm text-muted-foreground">In</p>
						<p className="text-xl font-semibold">
							{results.yearsToRetirement} yrs
						</p>
					</div>
				</div>

				{/* Progress bar */}
				<div className="space-y-2">
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">Progress today</span>
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
					<p className="text-xs text-muted-foreground">
						If you invest your current{" "}
						<span className="font-medium text-foreground">
							{formatCurrency(results.fundableNow, "eur")}
						</span>{" "}
						at the expected {expectedReturnPct}% per year, it grows to{" "}
						<span className="font-medium text-foreground">
							{formatCurrency(results.optimistic.projectedFromCurrent, "eur")}
						</span>{" "}
						by retirement — that&apos;s the{" "}
						<span className="font-medium text-foreground">{pctLabel}%</span> of
						your {formatCurrency(results.targetPortfolio, "eur")} target shown
						above (before adding any monthly savings).
					</p>
				</div>

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
