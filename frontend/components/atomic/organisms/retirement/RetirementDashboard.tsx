"use client";

import { CheckCircle2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/atomic/molecules/investments";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import {
	useRetirementPlan,
	useRetirementResults,
} from "@/hooks/convex/retirement";
import { RetirementResultsView } from "./RetirementResultsView";

interface RetirementDashboardProps {
	onEdit: () => void;
}

/**
 * The saved-plan view shown when the user has an active plan. No wizard stepper
 * and no "save" button — just the live results plus an "Edit plan" action.
 */
export function RetirementDashboard({ onEdit }: RetirementDashboardProps) {
	const plan = useRetirementPlan();
	const results = useRetirementResults();
	const t = useTranslations("retirement.dashboard");
	const tActions = useTranslations("common.actions");

	const subtitle = plan
		? t("subtitle", { age: plan.retirementAge })
		: t("subtitleFallback");

	return (
		<div className="space-y-6 pb-12">
			<PageHeader
				title={t("title")}
				subtitle={subtitle}
				customActions={
					<div className="flex items-center gap-2">
						<Badge
							variant="outline"
							className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
						>
							<CheckCircle2 className="h-3.5 w-3.5" />
							{tActions("saved")}
						</Badge>
						<Button variant="outline" onClick={onEdit}>
							<Pencil className="h-4 w-4" />
							{t("editPlan")}
						</Button>
					</div>
				}
			/>

			<RetirementResultsView
				results={results}
				assumptions={plan ?? undefined}
				onEdit={onEdit}
				currency={results?.currency}
			/>
		</div>
	);
}
