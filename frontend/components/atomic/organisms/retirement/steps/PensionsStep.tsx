"use client";

import { Landmark, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import type { PensionSource } from "@/lib/types/retirement";
import { formatCurrency } from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

export function PensionsStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
}: RetirementStepProps) {
	const sources = data.pensionSources;
	const total = sources.reduce((s, p) => s + (p.monthlyAmount || 0), 0);

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
			description="Fixed monthly income you'll receive in retirement, before touching your portfolio."
			onNext={onNext}
			onBack={onBack}
			isSaving={isSaving}
		>
			<div className="space-y-3">
				{sources.map((source, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: ordered editable list with no stable id; rows are fully controlled by `data.pensionSources`
					<div key={i} className="flex items-end gap-2">
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
									€ / month
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
				))}
			</div>

			<Button variant="outline" size="sm" onClick={addSource}>
				<Plus className="mr-1 h-4 w-4" />
				Add income source
			</Button>

			<div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
				<span className="text-sm text-muted-foreground">
					Total pension income
				</span>
				<span className="text-lg font-semibold">
					{formatCurrency(total, "eur")}/mo
				</span>
			</div>
		</RetirementStepShell>
	);
}
