"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { useRetirementPlan } from "@/hooks/convex/retirement";
import { RetirementDashboard } from "./RetirementDashboard";
import { RetirementWizard } from "./RetirementWizard";

/**
 * Entry point for /retirement. Shows the saved-plan dashboard once a plan is
 * active, and the step-by-step wizard otherwise (new plan, draft, or editing).
 */
export function RetirementFlow() {
	const plan = useRetirementPlan();
	const [editing, setEditing] = useState(false);

	if (plan === undefined) {
		return (
			<div className="space-y-5 pb-12">
				<Skeleton className="h-10 w-64" />
				{[160, 140, 280].map((h) => (
					<Skeleton
						key={h}
						className="w-full rounded-xl"
						style={{ height: h }}
					/>
				))}
			</div>
		);
	}

	// A saved (active) plan shows the dashboard — unless the user is editing it.
	if (plan && plan.status === "active" && !editing) {
		return <RetirementDashboard onEdit={() => setEditing(true)} />;
	}

	return <RetirementWizard onSaved={() => setEditing(false)} />;
}
