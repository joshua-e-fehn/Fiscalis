"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { RetirementInputIssue } from "@/lib/types/retirement";

/**
 * Renders a retirement input issue (services/finance/retirementService.ts) in
 * the user's language, under retirement.validation. Like the English
 * messages, the result has no trailing full stop.
 */
export function useRetirementIssueMessage() {
	const t = useTranslations("retirement.validation");
	return useCallback(
		(issue: RetirementInputIssue): string => {
			switch (issue.code) {
				case "ageRange":
					return t("ageRange", {
						field: issue.field,
						min: issue.min,
						max: issue.max,
					});
				case "rateRange":
					return t("rateRange", { field: issue.field, max: issue.max });
				case "withdrawalRateRange":
					return t("withdrawalRateRange", { max: issue.max });
				case "amountNegative":
					return t("amountNegative", { field: issue.field });
				case "retirementNotAfterCurrent":
				case "conservativeAboveExpected":
				case "expensesNotPositive":
					return t(issue.code);
			}
		},
		[t],
	);
}
