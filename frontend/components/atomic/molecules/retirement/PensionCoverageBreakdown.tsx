"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/shadcn/card";
import { type RetirementResults, roundYears } from "@/lib/types/retirement";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { formatCurrency } from "@/lib/utils/currency";

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

/**
 * Shows how the inflation-adjusted monthly expense at retirement splits into the
 * part covered by fixed pensions vs. the part the portfolio must fund. Both are
 * entered in today's money and inflated to the retirement date.
 */
export function PensionCoverageBreakdown({ results, currency, className }: Props) {
	const expense = results.expenseFutureMonthly;
	const pension = Math.min(results.pensionFutureMonthly, expense);
	const portfolio = results.gapMonthly;

	const pensionPct = expense > 0 ? (pension / expense) * 100 : 0;
	const portfolioPct = expense > 0 ? (portfolio / expense) * 100 : 0;
	const t = useTranslations("retirement");
	const tFinance = useTranslations("common.finance");
	const pensionArgs = {
		b: strong,
		today: formatCurrency(results.pensionTodayMonthly, currency),
		future: formatCurrency(results.pensionFutureMonthly, currency),
	};

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle className="text-base">{t("coverage.title")}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-sm text-muted-foreground">
					{t.rich("coverage.expensesGrow", {
						b: strong,
						today: formatCurrency(results.expenseTodayMonthly, currency),
						future: formatCurrency(expense, currency),
						years: t("yearsDative", { count: roundYears(results.yearsToRetirement) }),
					})}
					{results.pensionTodayMonthly > 0 && (
						<>
							{" "}
							{results.pensionDeductionsMonthly > 0
								? t.rich("coverage.pensionsAfterDeductions", {
										...pensionArgs,
										deductions: formatCurrency(
											results.pensionDeductionsMonthly,
											currency,
										),
									})
								: t.rich("coverage.pensions", pensionArgs)}
						</>
					)}
				</p>

				{/* Stacked bar */}
				<div className="flex h-7 w-full overflow-hidden rounded-lg">
					<div
						className="flex items-center justify-center bg-emerald-500 text-[11px] font-medium text-white"
						style={{ width: `${pensionPct}%` }}
					>
						{pensionPct >= 12 ? t("pensions") : ""}
					</div>
					<div
						className="flex items-center justify-center bg-primary text-[11px] font-medium text-primary-foreground"
						style={{ width: `${portfolioPct}%` }}
					>
						{portfolioPct >= 12 ? tFinance("portfolio") : ""}
					</div>
				</div>

				<div className="grid grid-cols-2 gap-3 text-sm">
					<Legend
						color="bg-emerald-500"
						label={t("coverage.coveredByPensions")}
						value={t("perMonth", { amount: formatCurrency(pension, currency) })}
					/>
					<Legend
						color="bg-primary"
						label={t("coverage.fundedByPortfolio")}
						value={t("perMonth", { amount: formatCurrency(portfolio, currency) })}
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
				<p className="font-semibold">{value}</p>
			</div>
		</div>
	);
}
