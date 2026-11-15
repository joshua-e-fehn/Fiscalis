"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/shadcn/collapsible";
import {
	DEFAULT_WITHDRAWAL_RATE,
	type RetirementAssumptions,
	type RetirementResults,
	roundYears,
} from "@/lib/types/retirement";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { formatCurrency, formatRate } from "@/lib/utils/currency";

interface Props {
	/** The currency `results` is in */
	currency: InvestmentCurrency;
	results?: RetirementResults;
	/** The plan's own rates; without them the copy stays generic. */
	assumptions?: RetirementAssumptions;
	className?: string;
}

/** 0.04 → "25", 0.03 → "33.3" */
function formatMultiple(withdrawalRate: number): string {
	return new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 }).format(
		1 / withdrawalRate,
	);
}

/** Emphasis inside the explainer copy (the <b> tag of its messages). */
function strong(chunks: ReactNode) {
	return <span className="font-medium text-foreground">{chunks}</span>;
}

/** The leading figure of each "where does 4% come from" line. */
function highlight(chunks: ReactNode) {
	return <span className="text-foreground">{chunks}</span>;
}

/** Why the realistic target exceeds the simple one (explainer.difference). */
function differenceReason(results: RetirementResults) {
	const mortgage = !!results.residenceMortgage?.balanceAtRetirement;
	if (results.hasFixedPensions) {
		return mortgage ? "fixedPensionsAndMortgage" : "fixedPensions";
	}
	return mortgage ? "mortgage" : "none";
}

/**
 * Plain-language explanation of the 4% rule and the inflation handling, aimed at
 * users without a finance background.
 */
export function FourPercentRuleExplainer({
	results,
	assumptions,
	currency,
	className,
}: Props) {
	// Only call out the plan's own withdrawal rate when it isn't the 4% default.
	const withdrawal =
		assumptions &&
		assumptions.withdrawalRate > 0 &&
		assumptions.withdrawalRate !== DEFAULT_WITHDRAWAL_RATE
			? assumptions.withdrawalRate
			: undefined;
	const inflation = assumptions ? formatRate(assumptions.inflationRate) : null;
	const t = useTranslations("retirement");

	return (
		<Card className={className}>
			<Collapsible defaultOpen>
				<CollapsibleTrigger className="flex w-full items-center gap-2 px-6 py-4 text-start text-sm font-medium hover:bg-muted/40">
					<Info className="h-4 w-4 text-primary" />
					{t("explainer.trigger")}
				</CollapsibleTrigger>
				<CollapsibleContent>
					<CardContent className="space-y-4 pt-0 text-sm text-muted-foreground">
						<p>
							{t.rich("explainer.rule", { b: strong })}
							{withdrawal !== undefined && (
								<>
									{" "}
									{t.rich("explainer.customRate", {
										b: strong,
										rate: formatRate(withdrawal),
										multiple: formatMultiple(withdrawal),
									})}
								</>
							)}
						</p>
						<p>{t("explainer.whereFrom")}</p>
						<ul className="ms-1 space-y-1.5">
							{(["marketReturn", "inflation", "buffer"] as const).map((key) => (
								<li key={key} className="flex gap-2">
									{t.rich(`explainer.${key}`, { b: highlight })}
								</li>
							))}
							<li className="flex gap-2 font-medium text-foreground">
								{t("explainer.result")}
							</li>
						</ul>
						<p>
							{inflation
								? t("explainer.inflationHandlingRate", { rate: inflation })
								: t("explainer.inflationHandling")}
						</p>
						{results && Number.isFinite(results.targetPortfolio) && (
							<TargetComparison
								results={results}
								currency={currency}
								inflation={inflation}
							/>
						)}
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}

/** Emphasis inside the target comparison (the <b> tag of its messages). */
function medium(chunks: ReactNode) {
	return <span className="font-medium">{chunks}</span>;
}

/** The plan's simple (today's money) target next to its inflation-adjusted one. */
function TargetComparison({
	results,
	currency,
	inflation,
}: {
	results: RetirementResults;
	currency: InvestmentCurrency;
	inflation: string | null;
}) {
	const t = useTranslations("retirement");
	const years = t("years", { count: roundYears(results.yearsToRetirement) });
	const target = formatCurrency(results.targetPortfolio, currency, {
		compact: true,
	});

	return (
		<div className="rounded-lg border border-border bg-muted/30 p-3 text-foreground">
			<p className="text-xs text-muted-foreground">
				{t.rich("explainer.simpleTarget", {
					b: medium,
					target: formatCurrency(results.simpleTargetPortfolio, currency, {
						compact: true,
					}),
				})}{" "}
				{inflation
					? t.rich("explainer.adjustedTargetRate", {
							b: medium,
							years,
							rate: inflation,
							target,
						})
					: t.rich("explainer.adjustedTarget", { b: medium, years, target })}{" "}
				{t("explainer.difference", { reason: differenceReason(results) })}{" "}
				{results.withdrawalTaxRate > 0
					? t("explainer.taxIncluded", {
							rate: formatRate(results.withdrawalTaxRate),
						})
					: t("explainer.taxExcluded")}
			</p>
		</div>
	);
}
