"use client";

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/shadcn/card";
import type { RetirementResults } from "@/lib/types/retirement";
import { formatCurrency } from "@/lib/utils/currency";

interface Props {
	results: RetirementResults;
	className?: string;
}

/**
 * Shows how the inflation-adjusted monthly expense at retirement splits into the
 * part covered by fixed pensions vs. the part the portfolio must fund.
 */
export function PensionCoverageBreakdown({ results, className }: Props) {
	const expense = results.expenseFutureMonthly;
	const pension = Math.min(results.pensionMonthly, expense);
	const portfolio = results.gapMonthly;

	const pensionPct = expense > 0 ? (pension / expense) * 100 : 0;
	const portfolioPct = expense > 0 ? (portfolio / expense) * 100 : 0;

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle className="text-base">
					Monthly expenses at retirement
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-sm text-muted-foreground">
					Your{" "}
					<span className="font-medium text-foreground">
						{formatCurrency(results.expenseTodayMonthly, "eur")}/mo
					</span>{" "}
					of expenses today grows to{" "}
					<span className="font-medium text-foreground">
						{formatCurrency(expense, "eur")}/mo
					</span>{" "}
					in {results.yearsToRetirement} years after inflation.
				</p>

				{/* Stacked bar */}
				<div className="flex h-7 w-full overflow-hidden rounded-lg">
					<div
						className="flex items-center justify-center bg-emerald-500 text-[11px] font-medium text-white"
						style={{ width: `${pensionPct}%` }}
					>
						{pensionPct >= 12 ? "Pensions" : ""}
					</div>
					<div
						className="flex items-center justify-center bg-primary text-[11px] font-medium text-primary-foreground"
						style={{ width: `${portfolioPct}%` }}
					>
						{portfolioPct >= 12 ? "Portfolio" : ""}
					</div>
				</div>

				<div className="grid grid-cols-2 gap-3 text-sm">
					<Legend
						color="bg-emerald-500"
						label="Covered by pensions"
						value={formatCurrency(pension, "eur")}
					/>
					<Legend
						color="bg-primary"
						label="Funded by portfolio"
						value={formatCurrency(portfolio, "eur")}
					/>
				</div>
			</CardContent>
		</Card>
	);
}

function Legend({
	color,
	label,
	value,
}: {
	color: string;
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-center gap-2">
			<span className={`h-3 w-3 rounded-sm ${color}`} />
			<div>
				<p className="text-muted-foreground">{label}</p>
				<p className="font-semibold">{value}/mo</p>
			</div>
		</div>
	);
}
