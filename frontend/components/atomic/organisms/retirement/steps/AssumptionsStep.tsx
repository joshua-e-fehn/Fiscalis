"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Switch } from "@/components/ui/shadcn/switch";
import {
	DEFAULT_CONSERVATIVE_RETURN,
	DEFAULT_INFLATION_RATE,
	DEFAULT_OPTIMISTIC_RETURN,
	DEFAULT_WITHDRAWAL_RATE,
	DEFAULT_WITHDRAWAL_TAX_RATE,
	MAX_RETIREMENT_DEDUCTION_RATE,
	MAX_RETIREMENT_RATE,
	type RetirementAssumptionField,
	type RetirementInputs,
	retirementAssumptionIssues,
	retirementDeductionIssues,
} from "@/lib/types/retirement";
import { formatRate } from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import { useRetirementIssueMessage } from "../shared/useRetirementIssueMessage";
import type { RetirementStepProps } from "./types";

/** The rate fields in display order; label and hint under assumptionsStep.fields. */
const FIELDS = [
	"optimisticReturn",
	"conservativeReturn",
	"inflationRate",
	"withdrawalRate",
] as const satisfies readonly RetirementAssumptionField[];

/** 0.0718 → 7.18; an unset (NaN) rate shows as an empty field. */
function toPercentInput(rate: number): number | "" {
	return Number.isFinite(rate) ? +(rate * 100).toFixed(2) : "";
}

export function AssumptionsStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
}: RetirementStepProps) {
	const t = useTranslations("retirement.assumptionsStep");
	const issueMessage = useRetirementIssueMessage();
	// Raw text per field while typing, so clearing a field shows it empty (and
	// invalid) instead of silently turning it into 0%.
	const [drafts, setDrafts] = useState<
		Partial<Record<RetirementAssumptionField | "withdrawalTaxRate", string>>
	>({});
	const issues = retirementAssumptionIssues(data);
	const taxIssue = retirementDeductionIssues(data).withdrawalTaxRate;
	const valid = Object.keys(issues).length === 0 && !taxIssue;
	const hint = (field: (typeof FIELDS)[number]) =>
		field === "optimisticReturn"
			? t("fields.optimisticReturn.hint", {
					rate: formatRate(DEFAULT_OPTIMISTIC_RETURN),
				})
			: t(`fields.${field}.hint`);
	const withdrawalTaxRate =
		data.withdrawalTaxRate ?? DEFAULT_WITHDRAWAL_TAX_RATE;

	const setRate = (
		key: RetirementAssumptionField | "withdrawalTaxRate",
		raw: string,
	) => {
		setDrafts((prev) => ({ ...prev, [key]: raw }));
		update({
			[key]: raw.trim() === "" ? Number.NaN : Number(raw) / 100,
		} as Partial<RetirementInputs>);
	};

	const resetDefaults = () => {
		setDrafts({});
		update({
			optimisticReturn: DEFAULT_OPTIMISTIC_RETURN,
			conservativeReturn: DEFAULT_CONSERVATIVE_RETURN,
			inflationRate: DEFAULT_INFLATION_RATE,
			withdrawalRate: DEFAULT_WITHDRAWAL_RATE,
			withdrawalTaxRate: DEFAULT_WITHDRAWAL_TAX_RATE,
			indexContributions: false,
		});
	};

	return (
		<RetirementStepShell
			icon={SlidersHorizontal}
			title={t("title")}
			description={t("description")}
			onNext={onNext}
			onBack={onBack}
			nextLabel={t("seePlan")}
			nextDisabled={!valid}
			isSaving={isSaving}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				{FIELDS.map((field) => {
					const issue = issues[field];
					return (
						<div key={field} className="space-y-1.5">
							<Label htmlFor={field}>{t(`fields.${field}.label`)}</Label>
							<div className="relative">
								<Input
									id={field}
									type="number"
									min={0}
									max={MAX_RETIREMENT_RATE * 100}
									step={0.1}
									value={drafts[field] ?? toPercentInput(data[field])}
									onChange={(e) => setRate(field, e.target.value)}
									aria-invalid={!!issue}
									className="pe-8"
								/>
								<span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground">
									%
								</span>
							</div>
							<p
								className={
									issue
										? "text-xs text-destructive"
										: "text-xs text-muted-foreground"
								}
							>
								{issue ? issueMessage(issue) : hint(field)}
							</p>
						</div>
					);
				})}
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor="withdrawalTaxRate">{t("withdrawalTax")}</Label>
					<div className="relative">
						<Input
							id="withdrawalTaxRate"
							type="number"
							min={0}
							max={MAX_RETIREMENT_DEDUCTION_RATE * 100}
							step={0.5}
							value={
								drafts.withdrawalTaxRate ?? toPercentInput(withdrawalTaxRate)
							}
							onChange={(e) => setRate("withdrawalTaxRate", e.target.value)}
							aria-invalid={!!taxIssue}
							className="pe-8"
						/>
						<span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground">
							%
						</span>
					</div>
					<p
						className={
							taxIssue
								? "text-xs text-destructive"
								: "text-xs text-muted-foreground"
						}
					>
						{taxIssue ? issueMessage(taxIssue) : t("withdrawalTaxHint")}
					</p>
				</div>
				<div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
					<div className="space-y-0.5">
						<Label htmlFor="indexContributions">
							{t("indexContributions")}
						</Label>
						<p className="text-xs text-muted-foreground">
							{t("indexContributionsHint")}
						</p>
					</div>
					<Switch
						id="indexContributions"
						checked={data.indexContributions === true}
						onCheckedChange={(checked) =>
							update({ indexContributions: checked })
						}
					/>
				</div>
			</div>

			<Button variant="ghost" size="sm" onClick={resetDefaults}>
				<RotateCcw className="me-1 h-3.5 w-3.5" />
				{t("reset")}
			</Button>
		</RetirementStepShell>
	);
}
