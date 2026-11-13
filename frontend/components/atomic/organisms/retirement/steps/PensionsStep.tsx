"use client";

import { Landmark, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Switch } from "@/components/ui/shadcn/switch";
import { useBaseCurrency } from "@/hooks/convex/portfolio";
import {
	DEFAULT_PENSION_DEDUCTION_RATE,
	netPensionMonthly,
	type PensionSource,
	validatePensionSources,
	validateRetirementDeductions,
} from "@/lib/types/retirement";
import { currencySymbols, formatCurrency } from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

export function PensionsStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
}: RetirementStepProps) {
	const currency = useBaseCurrency();
	const sources = data.pensionSources;
	const deductionRate =
		data.pensionDeductionRate ?? DEFAULT_PENSION_DEDUCTION_RATE;
	const total = sources.reduce((s, p) => s + (p.monthlyAmount || 0), 0);
	const netTotal = sources.reduce(
		(s, p) => s + netPensionMonthly(p, deductionRate),
		0,
	);
	const error = validatePensionSources(sources).pensionSources;
	const deductionError =
		validateRetirementDeductions(data).pensionDeductionRate;
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
			title="Pension income"
			description="Monthly income you'll receive in retirement, before touching your portfolio. Enter it in today's money, e.g. the gross amount on your Renteninformation. We take tax and health insurance off gross amounts and adjust indexed pensions for inflation like your expenses."
			onNext={onNext}
			onBack={onBack}
			nextDisabled={!!error || !!deductionError}
			isSaving={isSaving}
		>
			<div className="space-y-3">
				{sources.map((source, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: ordered editable list with no stable id; rows are fully controlled by `data.pensionSources`
					<div key={i} className="space-y-2">
						<div className="flex items-end gap-2">
							<div className="flex-1 space-y-1.5">
								{i === 0 && (
									<Label className="text-xs text-muted-foreground">Source</Label>
								)}
								<Input
									placeholder="e.g. State pension"
									value={source.label}
									onChange={(e) => setSource(i, { label: e.target.value })}
								/>
							</div>
							<div className="w-36 space-y-1.5">
								{i === 0 && (
									<Label className="text-xs text-muted-foreground">
										{currencySymbols[currency].trim()} / month (today)
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
								aria-label="Remove source"
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
						<div className="flex flex-wrap gap-x-5 gap-y-1 pl-1 text-xs text-muted-foreground">
							<label className="flex items-center gap-2">
								<Switch
									checked={source.gross !== false}
									onCheckedChange={(checked) => setSource(i, { gross: checked })}
								/>
								{source.gross !== false
									? "Gross (before tax & health insurance)"
									: "Net (already after deductions)"}
							</label>
							<label className="flex items-center gap-2">
								<Switch
									checked={source.indexed !== false}
									onCheckedChange={(checked) =>
										setSource(i, { indexed: checked })
									}
								/>
								{source.indexed !== false
									? "Rises with inflation"
									: "Fixed in euros (e.g. many company pensions)"}
							</label>
						</div>
					</div>
				))}
			</div>

			{error && <p className="text-xs text-destructive">{error}.</p>}

			<Button variant="outline" size="sm" onClick={addSource}>
				<Plus className="mr-1 h-4 w-4" />
				Add income source
			</Button>

			<div className="space-y-1.5">
				<Label htmlFor="pensionDeduction">
					Tax &amp; health insurance on gross pensions
				</Label>
				<div className="relative w-36">
					<Input
						id="pensionDeduction"
						type="number"
						min={0}
						max={60}
						step={1}
						className="pr-8"
						aria-invalid={!!deductionError}
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
						deductionError
							? "text-xs text-destructive"
							: "text-xs text-muted-foreground"
					}
				>
					{deductionError ??
						`A flat rate for health & care insurance (≈ 11–12% in the KVdR) plus income tax. The default ${Math.round(DEFAULT_PENSION_DEDUCTION_RATE * 100)}% turns €1,500 gross into about €1,245 net.`}
				</p>
			</div>

			<div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
				<span className="text-sm text-muted-foreground">
					Total pension income, net (today&apos;s money)
					{netTotal !== total && (
						<span className="block text-xs">
							{formatCurrency(total, currency)}/mo as entered
						</span>
					)}
				</span>
				<span className="text-lg font-semibold">
					{formatCurrency(netTotal, currency)}/mo
				</span>
			</div>
		</RetirementStepShell>
	);
}
