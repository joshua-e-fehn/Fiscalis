"use client";

import { AlertTriangle } from "lucide-react";
import {
	FourPercentRuleExplainer,
	PensionCoverageBreakdown,
	RequiredSavingsCard,
	RetirementProgressCard,
	RetirementProjectionChart,
} from "@/components/atomic/molecules/retirement";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import type { RetirementResults } from "@/lib/types/retirement";

interface Props {
	/** undefined = loading, null = no plan/data. */
	results: RetirementResults | null | undefined;
}

/**
 * The shared retirement results presentation — reused by both the final wizard
 * step (live preview) and the saved-plan dashboard.
 */
export function RetirementResultsView({ results }: Props) {
	if (results === undefined) return <ResultsLoading />;
	if (results === null) return null;

	if (results.invalidTimeline) {
		return (
			<Card>
				<CardContent className="flex items-start gap-3 py-6 text-sm">
					<AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
					<div>
						<p className="font-medium">Check your retirement age</p>
						<p className="text-muted-foreground">
							Your retirement age needs to be later than your current age to
							build a plan. Go back and adjust it.
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-5">
			<div className="grid gap-5 lg:grid-cols-2">
				<RetirementProgressCard results={results} />
				<RequiredSavingsCard results={results} />
			</div>
			<PensionCoverageBreakdown results={results} />
			<RetirementProjectionChart results={results} />
			<FourPercentRuleExplainer results={results} />
		</div>
	);
}

function ResultsLoading() {
	return (
		<div className="space-y-5">
			{[180, 160, 140, 280].map((h) => (
				<Skeleton key={h} className="w-full rounded-xl" style={{ height: h }} />
			))}
		</div>
	);
}
