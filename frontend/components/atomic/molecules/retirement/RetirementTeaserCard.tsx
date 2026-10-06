"use client";

import { ArrowRight, PiggyBank } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import {
	useRetirementPlan,
	useRetirementResults,
} from "@/hooks/convex/retirement";
import {
	isOnTrack,
	type RetirementResults,
	retirementPlanProblem,
} from "@/lib/types/retirement";
import { formatCurrency, formatRate } from "@/lib/utils/currency";

/** One-line status of an active plan. */
function activePlanSummary(
	results: RetirementResults,
	needsReview: boolean,
): string {
	if (needsReview) {
		return "Your plan needs a quick review — open it to adjust your retirement age or assumptions.";
	}
	if (results.pensionsCoverAll) {
		return "Your pensions already cover your expected expenses.";
	}
	if (results.hasNetDebt) {
		return "Your liabilities currently exceed your assets — paying them down is the first step.";
	}
	const target = formatCurrency(results.targetPortfolio, "eur", {
		compact: true,
	});
	// Same rule as the plan page: on track only if both scenarios are
	if (isOnTrack(results)) {
		return `You're on track for your ${target} target.`;
	}
	if (results.optimistic.onTrack) {
		return `On track at the expected ${formatRate(results.optimistic.annualReturn)} return; saving ${formatCurrency(results.conservative.monthlyContribution, "eur")}/mo covers the conservative case.`;
	}
	return `You're ${(results.progressPct * 100).toFixed(0)}% of the way to your ${target} target.`;
}

/**
 * Compact dashboard promo for the Retirement Planner. Adapts to whether the user
 * has no plan, a draft in progress, or a saved (active) plan.
 */
export function RetirementTeaserCard() {
	const plan = useRetirementPlan();
	const results = useRetirementResults();

	const isActive = plan?.status === "active";
	const isDraft = !!plan && plan.status !== "active";

	// Avoid showing the wrong state while the plan (or an active plan's results) loads.
	if (plan === undefined || (isActive && results === undefined)) {
		return <Skeleton className="h-[88px] w-full rounded-xl" />;
	}

	const title = isActive
		? "Your retirement plan"
		: isDraft
			? "Finish your retirement plan"
			: "Plan your retirement";

	// Same check as the plan page, so the teaser never shows progress for a plan
	// that opens on "Check your …" instead of results.
	const needsReview =
		!!results &&
		(!!retirementPlanProblem(results, plan ?? undefined) ||
			!Number.isFinite(results.targetPortfolio));

	const description =
		isActive && results
			? activePlanSummary(results, needsReview)
			: isDraft
				? "Pick up where you left off and see your number."
				: "Turn your retirement goal into a monthly savings plan in a couple of minutes.";

	const showProgress = isActive && !!results && !needsReview;
	const pct = showProgress ? Math.min(1, results.progressPct) : 0;

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
						{showProgress && (
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
