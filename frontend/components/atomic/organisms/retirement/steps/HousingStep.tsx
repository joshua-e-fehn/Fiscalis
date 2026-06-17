"use client";

import { Home, Info } from "lucide-react";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Switch } from "@/components/ui/shadcn/switch";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

export function HousingStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
}: RetirementStepProps) {
	return (
		<RetirementStepShell
			icon={Home}
			title="Your home"
			description="Property is handled differently from investments — let's get it right."
			onNext={onNext}
			onBack={onBack}
			isSaving={isSaving}
		>
			<div className="flex items-center justify-between rounded-lg border border-border p-4">
				<div className="space-y-0.5 pr-4">
					<Label htmlFor="ownsHome">I own the home I live in</Label>
					<p className="text-xs text-muted-foreground">
						An owner-occupied home isn&apos;t counted as retirement funding.
					</p>
				</div>
				<Switch
					id="ownsHome"
					checked={data.ownsPrimaryResidence}
					onCheckedChange={(checked) =>
						update({ ownsPrimaryResidence: checked })
					}
				/>
			</div>

			{data.ownsPrimaryResidence && (
				<div className="flex items-start gap-2 rounded-lg bg-primary/5 p-4 text-sm">
					<Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
					<p className="text-muted-foreground">
						We <span className="font-medium text-foreground">don&apos;t</span>{" "}
						count your home toward the portfolio that funds retirement — you
						can&apos;t sell it and still live in it. Its real benefit is already
						reflected in your lower monthly expenses (no rent).
					</p>
				</div>
			)}

			<div className="space-y-2">
				<Label htmlFor="fundableEquity">
					Sellable property equity to fund retirement{" "}
					<span className="font-normal text-muted-foreground">(optional)</span>
				</Label>
				<div className="relative">
					<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
						€
					</span>
					<Input
						id="fundableEquity"
						type="number"
						min={0}
						step={1000}
						className="pl-7"
						value={data.fundableRealEstateEquity || ""}
						onChange={(e) =>
							update({
								fundableRealEstateEquity: Number(e.target.value) || 0,
							})
						}
					/>
				</div>
				<p className="text-xs text-muted-foreground">
					For a rental or second property you plan to sell. This is added to
					your portfolio basis. Leave at 0 if none.
				</p>
			</div>
		</RetirementStepShell>
	);
}
