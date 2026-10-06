"use client";

import { Info } from "lucide-react";
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
} from "@/lib/types/retirement";
import { formatCurrency, formatRate } from "@/lib/utils/currency";

interface Props {
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

/**
 * Plain-language explanation of the 4% rule and the inflation handling, aimed at
 * users without a finance background.
 */
export function FourPercentRuleExplainer({
	results,
	assumptions,
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

	return (
		<Card className={className}>
			<Collapsible defaultOpen>
				<CollapsibleTrigger className="flex w-full items-center gap-2 px-6 py-4 text-left text-sm font-medium hover:bg-muted/40">
					<Info className="h-4 w-4 text-primary" />
					Why these numbers? The 4% rule, explained
				</CollapsibleTrigger>
				<CollapsibleContent>
					<CardContent className="space-y-4 pt-0 text-sm text-muted-foreground">
						<p>
							The <span className="font-medium text-foreground">4% rule</span>{" "}
							is a simple guideline: each year you can withdraw about 4% of your
							portfolio without running it down over a long retirement. Flip
							that around and your portfolio needs to be{" "}
							<span className="font-medium text-foreground">25×</span> the
							yearly amount it has to cover.
							{withdrawal !== undefined && (
								<>
									{" "}
									Your plan uses{" "}
									<span className="font-medium text-foreground">
										{formatRate(withdrawal)}
									</span>{" "}
									instead, so your portfolio needs to be{" "}
									<span className="font-medium text-foreground">
										{formatMultiple(withdrawal)}×
									</span>{" "}
									that amount.
								</>
							)}
						</p>
						<p>Where does 4% come from?</p>
						<ul className="ml-1 space-y-1.5">
							<li className="flex gap-2">
								<span className="text-foreground">≈ 7–8%</span> long-run
								expected market return per year
							</li>
							<li className="flex gap-2">
								<span className="text-foreground">− ~2%</span> inflation, so
								your money keeps its purchasing power
							</li>
							<li className="flex gap-2">
								<span className="text-foreground">− a buffer</span> to stay safe
								in bad market years
							</li>
							<li className="flex gap-2 font-medium text-foreground">
								= about 4% you can spend each year
							</li>
						</ul>
						<p>
							Because the withdrawal rate already accounts for inflation during
							retirement, we don&apos;t add inflation twice. Before retirement
							we grow your expenses and pensions by{" "}
							{inflation ? `${inflation} a year` : "the inflation rate"} and
							grow your investments at the expected return — keeping
							everything consistent.
						</p>
						{results && Number.isFinite(results.targetPortfolio) && (
							<div className="rounded-lg border border-border bg-muted/30 p-3 text-foreground">
								<p className="text-xs text-muted-foreground">
									For your plan, using today&apos;s expenses and today&apos;s
									pensions (no inflation) the target would be{" "}
									<span className="font-medium">
										{formatCurrency(results.simpleTargetPortfolio, "eur", {
											compact: true,
										})}
									</span>
									. Adjusted for {results.yearsToRetirement} years of
									{inflation ? ` ${inflation}` : ""} inflation, the realistic
									target is{" "}
									<span className="font-medium">
										{formatCurrency(results.targetPortfolio, "eur", {
											compact: true,
										})}
									</span>
									. Both use the same basis, so the difference is inflation
									alone.
								</p>
							</div>
						)}
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}
