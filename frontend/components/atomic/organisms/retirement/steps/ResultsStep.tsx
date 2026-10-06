"use client";

import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import { useRetirementPreview } from "@/hooks/convex/retirement";
import {
	firstRetirementInputError,
	type RetirementInputs,
} from "@/lib/types/retirement";
import { RetirementResultsView } from "../RetirementResultsView";

interface ResultsStepProps {
	data: RetirementInputs;
	onBack: () => void;
	onSave: () => void;
	isSaving?: boolean;
	saved?: boolean;
	/** Blocks saving for a reason outside the plan inputs (e.g. date of birth). */
	blockingError?: string;
}

export function ResultsStep({
	data,
	onBack,
	onSave,
	isSaving,
	saved,
	blockingError,
}: ResultsStepProps) {
	const results = useRetirementPreview(data);
	// Only a complete, valid plan (incl. retirement after today's age and a valid
	// date of birth) can be saved.
	const invalidReason = blockingError ?? firstRetirementInputError(data);

	return (
		<div className="w-full space-y-5">
			<RetirementResultsView results={results} assumptions={data} />

			<div className="flex items-center justify-between">
				<Button variant="ghost" onClick={onBack} disabled={isSaving}>
					<ArrowLeft className="mr-1 h-4 w-4" />
					Back
				</Button>
				<Button onClick={onSave} disabled={isSaving || !!invalidReason}>
					{saved ? (
						<>
							<Check className="mr-1 h-4 w-4" />
							Saved
						</>
					) : isSaving ? (
						"Saving..."
					) : (
						"Save my plan"
					)}
				</Button>
			</div>
			{invalidReason && (
				<p className="text-right text-sm text-muted-foreground">
					{invalidReason}. Fix it to save your plan.
				</p>
			)}
		</div>
	);
}
