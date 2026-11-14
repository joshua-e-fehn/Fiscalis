"use client";

import { Landmark, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Switch } from "@/components/ui/shadcn/switch";
import { useRetirementAmountsCurrency } from "@/hooks/convex/retirement";
import {
	DEFAULT_PENSION_DEDUCTION_RATE,
	netPensionMonthly,
	type PensionSource,
	pensionSourceIssues,
	retirementDeductionIssues,
} from "@/lib/types/retirement";
import {
	currencySymbols,
	formatCurrency,
	formatRate,
} from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import { useRetirementIssueMessage } from "../shared/useRetirementIssueMessage";
import type { RetirementStepProps } from "./types";

/** The monthly gross pension the deduction hint works through */
const EXAMPLE_GROSS_PENSION = 1_500;

export function PensionsStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
	currency: inputsCurrency,
}: RetirementStepProps) {
	const t = useTranslations("retirement");
	const issueMessage = useRetirementIssueMessage();
	const currency = useRetirementAmountsCurrency(inputsCurrency);
	const sources = data.pensionSources;
	const deductionRate =
		data.pensionDeductionRate ?? DEFAULT_PENSION_DEDUCTION_RATE;
	const total = sources.reduce((s, p) => s + (p.monthlyAmount || 0), 0);
	const netTotal = sources.reduce(
		(s, p) => s + netPensionMonthly(p, deductionRate),
		0,
	);
	const issue = pensionSourceIssues(sources).pensionSources;
	const deductionIssue = retirementDeductionIssues(data).pensionDeductionRate;
	const symbol = currencySymbols[currency].trim();
	const perMonth = (amount: number) =>
		t("perMonth", { amount: formatCurrency(amount, currency) });
	// Raw text while typing, so a cleared field shows empty (and invalid).
	const [deductionDraft, setDeductionDraft] = useState<string | null>(null);

	const setSource = (index: number, patch: Partial<PensionSource>) => {
		update({
			pensionSources: sources.map((s, i) =>
				i === index ? { ...s, ...patch } : s,
			),
		});
	};

	const addSource = () =>
		update({
			pensionSources: [...sources, { label: "", monthlyAmount: 0 }],
		});

	const removeSource = (index: number) =>
		update({ pensionSources: sources.filter((_, i) => i !== index) });

	return (
		<RetirementStepShell
			icon={Landmark}
			title={t("pensionsStep.title")}
			description={t("pensionsStep.description")}
			onNext={onNext}
			onBack={onBack}
			nextDisabled={!!issue || !!deductionIssue}
			isSaving={isSaving}
		>
			<div className="space-y-3">
				{sources.map((source, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: ordered editable list with no stable id; rows are fully controlled by `data.pensionSources`
					<div key={i} className="space-y-2">
						<div className="flex items-end gap-2">
							<div className="flex-1 space-y-1.5">
								{i === 0 && (
									<Label className="text-xs text-muted-foreground">
										{t("pensionsStep.source")}
									</Label>
								)}
								<Input
									placeholder={t("pensionsStep.sourcePlaceholder")}
									value={source.label}
									onChange={(e) => setSource(i, { label: e.target.value })}
								/>
							</div>
							<div className="w-36 space-y-1.5">
								{i === 0 && (
									<Label className="text-xs text-muted-foreground">
										{t("pensionsStep.amountLabel", { symbol })}
									</Label>
								)}
								<Input
									type="number"
									min={0}
									step={50}
									value={source.monthlyAmount || ""}
									onChange={(e) =>
										setSource(i, { monthlyAmount: Number(e.target.value) || 0 })
									}
								/>
							</div>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => removeSource(i)}
								disabled={sources.length === 1}
								aria-label={t("pensionsStep.removeSource")}
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
						<div className="flex flex-wrap gap-x-5 gap-y-1 pl-1 text-xs text-muted-foreground">
							<label className="flex items-center gap-2">
								<Switch
									checked={source.gross !== false}
									onCheckedChange={(checked) =>
										setSource(i, { gross: checked })
									}
								/>
								{source.gross !== false
									? t("pensionsStep.gross")
									: t("pensionsStep.net")}
							</label>
							<label className="flex items-center gap-2">
								<Switch
									checked={source.indexed !== false}
									onCheckedChange={(checked) =>
										setSource(i, { indexed: checked })
									}
								/>
								{source.indexed !== false
									? t("pensionsStep.indexed")
									: t("pensionsStep.fixed")}
							</label>
						</div>
					</div>
				))}
			</div>

			{issue && (
				<p className="text-xs text-destructive">{issueMessage(issue)}.</p>
			)}

			<Button variant="outline" size="sm" onClick={addSource}>
				<Plus className="mr-1 h-4 w-4" />
				{t("pensionsStep.addSource")}
			</Button>

			<div className="space-y-1.5">
				<Label htmlFor="pensionDeduction">
					{t("pensionsStep.deductionLabel")}
				</Label>
				<div className="relative w-36">
					<Input
						id="pensionDeduction"
						type="number"
						min={0}
						max={60}
						step={1}
						className="pr-8"
						aria-invalid={!!deductionIssue}
						value={deductionDraft ?? +(deductionRate * 100).toFixed(2)}
						onChange={(e) => {
							setDeductionDraft(e.target.value);
							update({
								pensionDeductionRate:
									e.target.value.trim() === ""
										? Number.NaN
										: Number(e.target.value) / 100,
							});
						}}
					/>
					<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
						%
					</span>
				</div>
				<p
					className={
						deductionIssue
							? "text-xs text-destructive"
							: "text-xs text-muted-foreground"
					}
				>
					{deductionIssue
						? issueMessage(deductionIssue)
						: t("pensionsStep.deductionHint", {
								rate: formatRate(DEFAULT_PENSION_DEDUCTION_RATE),
								gross: formatCurrency(EXAMPLE_GROSS_PENSION, currency, {
									fractionDigits: 0,
								}),
								net: formatCurrency(
									EXAMPLE_GROSS_PENSION * (1 - DEFAULT_PENSION_DEDUCTION_RATE),
									currency,
									{ fractionDigits: 0 },
								),
							})}
				</p>
			</div>

			<div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
				<span className="text-sm text-muted-foreground">
					{t("pensionsStep.totalNet")}
					{netTotal !== total && (
						<span className="block text-xs">
							{t("pensionsStep.asEntered", { amount: perMonth(total) })}
						</span>
					)}
				</span>
				<span className="text-lg font-semibold">{perMonth(netTotal)}</span>
			</div>
		</RetirementStepShell>
	);
}
