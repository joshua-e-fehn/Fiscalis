"use client";

import { ArrowLeft, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/shadcn/button";
import { useRetirementPreview } from "@/hooks/convex/retirement";
import {
	firstRetirementInputIssue,
	type RetirementInputs,
} from "@/lib/types/retirement";
import { RetirementResultsView } from "../RetirementResultsView";
import { useRetirementIssueMessage } from "../shared/useRetirementIssueMessage";

interface ResultsStepProps {
	data: RetirementInputs;
	onBack: () => void;
	onSave: () => void;
	isSaving?: boolean;
	saved?: boolean;
	/** Blocks saving for a reason outside the plan inputs (e.g. date of birth). */
	blockingError?: string;
	/** The currency `data`'s amounts are in (the one the wizard was filled in) */
	currency?: string;
}

export function ResultsStep({
	data,
	onBack,
	onSave,
	isSaving,
	saved,
	blockingError,
	currency,
}: ResultsStepProps) {
	const t = useTranslations("retirement");
	const tActions = useTranslations("common.actions");
	const issueMessage = useRetirementIssueMessage();
	const results = useRetirementPreview(data, currency);
	// Only a complete, valid plan (incl. retirement after today's age and a valid
	// date of birth) can be saved.
	const issue = firstRetirementInputIssue(data);
	const invalidReason = blockingError ?? (issue && issueMessage(issue));

	return (
		<div className="w-full space-y-5">
			<RetirementResultsView
				results={results}
				assumptions={data}
				currency={currency}
			/>

			<div className="flex items-center justify-between">
				<Button variant="ghost" onClick={onBack} disabled={isSaving}>
					<ArrowLeft className="me-1 h-4 w-4 rtl:-scale-x-100" />
					{tActions("back")}
				</Button>
				<Button onClick={onSave} disabled={isSaving || !!invalidReason}>
					{saved ? (
						<>
							<Check className="me-1 h-4 w-4" />
							{tActions("saved")}
						</>
					) : isSaving ? (
						t("stepShell.saving")
					) : (
						t("resultsStep.save")
					)}
				</Button>
			</div>
			{invalidReason && (
				<p className="text-end text-sm text-muted-foreground">
					{t("resultsStep.fixToSave", { reason: invalidReason })}
				</p>
			)}
		</div>
	);
}
