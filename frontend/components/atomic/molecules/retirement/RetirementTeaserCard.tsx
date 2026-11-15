"use client";

import { ArrowRight, PiggyBank } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import {
	useRetirementAmountsCurrency,
	useRetirementPlan,
	useRetirementResults,
} from "@/hooks/convex/retirement";
import type { InvestmentCurrency } from "@/lib/types/investments";
import {
	isOnTrack,
	type RetirementResults,
	retirementPlanProblem,
} from "@/lib/types/retirement";
import { formatCurrency, formatRate } from "@/lib/utils/currency";

/** One-line status of an active plan. */
function useActivePlanSummary() {
	const t = useTranslations("retirement.teaser");
	return (
		results: RetirementResults,
		needsReview: boolean,
		currency: InvestmentCurrency,
	): string => {
		if (needsReview) return t("needsReview");
		if (results.pensionsCoverAll) return t("pensionsCoverAll");
		if (results.hasNetDebt) return t("netDebt");
		const target = formatCurrency(results.targetPortfolio, currency, {
			compact: true,
		});
		// Same rule as the plan page: on track only if both scenarios are
		if (isOnTrack(results)) return t("onTrack", { target });
		if (results.optimistic.onTrack) {
			return t("onTrackExpected", {
				rate: formatRate(results.optimistic.baseReturn),
				amount: formatCurrency(results.conservative.monthlyContribution, currency),
			});
		}
		return t("progress", {
			pct: (results.progressPct * 100).toFixed(0),
			target,
		});
	};
}

/**
 * Compact dashboard promo for the Retirement Planner. Adapts to whether the user
 * has no plan, a draft in progress, or a saved (active) plan.
 */
export function RetirementTeaserCard() {
	const plan = useRetirementPlan();
	const results = useRetirementResults();
	// Labelled with the currency the server computed the results in
	const currency = useRetirementAmountsCurrency(results?.currency);
	const t = useTranslations("retirement.teaser");
	const tActions = useTranslations("common.actions");
	const activePlanSummary = useActivePlanSummary();

	const isActive = plan?.status === "active";
	const isDraft = !!plan && plan.status !== "active";

	// Avoid showing the wrong state while the plan (or an active plan's results) loads.
	if (plan === undefined || (isActive && results === undefined)) {
		return <Skeleton className="h-[88px] w-full rounded-xl" />;
	}

	const title = isActive
		? t("titleActive")
		: isDraft
			? t("titleDraft")
			: t("titleNew");

	// Same check as the plan page, so the teaser never shows progress for a plan
	// that opens on "Check your …" instead of results.
	const needsReview =
		!!results &&
		(!!retirementPlanProblem(results, plan ?? undefined) ||
			!Number.isFinite(results.targetPortfolio));

	const description =
		isActive && results
			? activePlanSummary(results, needsReview, currency)
			: isDraft
				? t("draft")
				: t("new");

	const showProgress = isActive && !!results && !needsReview;
	const pct = showProgress ? Math.min(1, results.progressPct) : 0;

	const cta = isActive
		? t("viewPlan")
		: isDraft
			? tActions("continue")
			: t("getStarted");

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
						<ArrowRight className="ms-1 h-4 w-4 rtl:-scale-x-100" />
					</Link>
				</Button>
			</CardContent>
		</Card>
	);
}
