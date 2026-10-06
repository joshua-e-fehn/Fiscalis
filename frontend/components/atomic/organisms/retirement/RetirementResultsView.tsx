"use client";

import { AlertTriangle, Pencil } from "lucide-react";
import {
	FourPercentRuleExplainer,
	PensionCoverageBreakdown,
	RequiredSavingsCard,
	RetirementProgressCard,
	RetirementProjectionChart,
} from "@/components/atomic/molecules/retirement";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import {
	type RetirementAssumptions,
	type RetirementResults,
	retirementPlanProblem,
} from "@/lib/types/retirement";

interface Props {
	/** undefined = loading, null = no plan/data. */
	results: RetirementResults | null | undefined;
	/** The rates behind `results`; personalises the explainer copy. */
	assumptions?: RetirementAssumptions;
	/** Saved-plan dashboard: problems point to "Edit plan" instead of "Go back". */
	onEdit?: () => void;
}

/**
 * The shared retirement results presentation — reused by both the final wizard
 * step (live preview) and the saved-plan dashboard.
 */
export function RetirementResultsView({ results, assumptions, onEdit }: Props) {
	if (results === undefined) return <ResultsLoading />;
	if (results === null) return null;

	const problem = retirementPlanProblem(results, assumptions);

	if (problem) {
		return (
			<Card>
				<CardContent className="flex items-start gap-3 py-6 text-sm">
					<AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
					<div className="space-y-3">
						<div>
							<p className="font-medium">{problem.title}</p>
							<p className="text-muted-foreground">
								{problem.body}{" "}
								{onEdit ? "Edit your plan to adjust it." : "Go back and adjust it."}
							</p>
						</div>
						{onEdit && (
							<Button variant="outline" size="sm" onClick={onEdit}>
								<Pencil className="h-4 w-4" />
								Edit plan
							</Button>
						)}
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
			<FourPercentRuleExplainer results={results} assumptions={assumptions} />
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
