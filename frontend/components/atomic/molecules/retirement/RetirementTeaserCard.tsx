"use client";

import { ArrowRight, PiggyBank } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import {
	useRetirementPlan,
	useRetirementResults,
} from "@/hooks/convex/retirement";
import { formatCurrency } from "@/lib/utils/currency";

/**
 * Compact dashboard promo for the Retirement Planner. Adapts to whether the user
 * has no plan, a draft in progress, or a saved (active) plan.
 */
export function RetirementTeaserCard() {
	const plan = useRetirementPlan();
	const results = useRetirementResults();

	// Avoid a flash before we know the plan state.
	if (plan === undefined) return null;

	const isActive = plan?.status === "active";
	const isDraft = !!plan && plan.status !== "active";
	const hasResults = !!results && !results.invalidTimeline;
	const pct = hasResults ? Math.max(0, Math.min(1, results.progressPct)) : null;

	const title = isActive
		? "Your retirement plan"
		: isDraft
			? "Finish your retirement plan"
			: "Plan your retirement";

	const description =
		isActive && hasResults
			? `You're ${(results.progressPct * 100).toFixed(0)}% of the way to your ${formatCurrency(
					results.targetPortfolio,
					"eur",
					{ compact: true },
				)} target.`
			: isDraft
				? "Pick up where you left off and see your number."
				: "Turn your retirement goal into a monthly savings plan in a couple of minutes.";

	const cta = isActive ? "View plan" : isDraft ? "Continue" : "Get started";

	return (
		<Card>
			<CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-start gap-3">
					<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
						<PiggyBank className="h-5 w-5" />
					</div>
					<div className="space-y-1">
						<p className="font-semibold">{title}</p>
						<p className="text-sm text-muted-foreground">{description}</p>
						{isActive && pct !== null && (
							<div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
								<div
									className="h-full rounded-full bg-primary"
									style={{ width: `${pct * 100}%` }}
								/>
							</div>
						)}
					</div>
				</div>
				<Button asChild className="shrink-0">
					<Link href="/retirement">
						{cta}
						<ArrowRight className="ml-1 h-4 w-4" />
					</Link>
				</Button>
			</CardContent>
		</Card>
	);
}
