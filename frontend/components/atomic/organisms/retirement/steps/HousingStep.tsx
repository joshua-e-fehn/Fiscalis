"use client";

import { Home, Info } from "lucide-react";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
import { useRetirementMortgageCandidates } from "@/hooks/convex/retirement";
import { validateRetirementInputs } from "@/lib/types/retirement";
import { formatCurrency } from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

/** Select value for "no residence mortgage linked". */
const NO_LOAN = "none";

export function HousingStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
}: RetirementStepProps) {
	const equityError = validateRetirementInputs(data).fundableRealEstateEquity;
	const loans = useRetirementMortgageCandidates();

	return (
		<RetirementStepShell
			icon={Home}
			title="Your home"
			description="Property is handled differently from investments — let's get it right."
			onNext={onNext}
			onBack={onBack}
			nextDisabled={!!equityError}
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

			{data.ownsPrimaryResidence && (
				<div className="space-y-2">
					<Label htmlFor="residenceLoan">
						Mortgage on this home{" "}
						<span className="font-normal text-muted-foreground">(optional)</span>
					</Label>
					<Select
						value={data.primaryResidenceLoanId ?? NO_LOAN}
						onValueChange={(value) =>
							update({
								primaryResidenceLoanId: value === NO_LOAN ? undefined : value,
							})
						}
					>
						<SelectTrigger id="residenceLoan">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NO_LOAN}>No mortgage / not tracked</SelectItem>
							{loans?.map((loan) => (
								<SelectItem key={loan._id} value={loan._id}>
									{loan.name} — {formatCurrency(loan.currentBalance, "eur")}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-xs text-muted-foreground">
						Its balance is not subtracted from your retirement funding: you pay
						the repayments from your income until retirement, like rent. Any
						balance still owed when you retire is added to your target.
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
				{equityError ? (
					<p className="text-xs text-destructive">{equityError}.</p>
				) : (
					<p className="text-xs text-muted-foreground">
						For a rental or second property you plan to sell: its value minus
						any loan on it that isn&apos;t tracked in Fiscalis (tracked loans
						are already subtracted from your net worth). Leave at 0 if none.
					</p>
				)}
			</div>
		</RetirementStepShell>
	);
}
