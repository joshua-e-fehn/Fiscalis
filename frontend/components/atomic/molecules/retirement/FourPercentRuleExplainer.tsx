"use client";

import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/shadcn/collapsible";
import type { RetirementResults } from "@/lib/types/retirement";
import { formatCurrency } from "@/lib/utils/currency";

interface Props {
	results?: RetirementResults;
	className?: string;
}

/**
 * Plain-language explanation of the 4% rule and the inflation handling, aimed at
 * users without a finance background.
 */
export function FourPercentRuleExplainer({ results, className }: Props) {
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
							Because the 4% already accounts for inflation during retirement,
							we don&apos;t add inflation twice. Before retirement we grow your
							expense target by ~2% a year and grow your investments at the
							expected return — keeping everything consistent.
						</p>
						{results && Number.isFinite(results.targetPortfolio) && (
							<div className="rounded-lg border border-border bg-muted/30 p-3 text-foreground">
								<p className="text-xs text-muted-foreground">
									For your plan, using today&apos;s expenses (no inflation) the
									target would be{" "}
									<span className="font-medium">
										{formatCurrency(results.simpleTargetPortfolio, "eur", {
											compact: true,
										})}
									</span>
									. Adjusted for {results.yearsToRetirement} years of inflation,
									the realistic target is{" "}
									<span className="font-medium">
										{formatCurrency(results.targetPortfolio, "eur", {
											compact: true,
										})}
									</span>
									.
								</p>
							</div>
						)}
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}
