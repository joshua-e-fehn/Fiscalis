"use client";

import { Briefcase, Info } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/shadcn/select";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { useRetirementPreview } from "@/hooks/convex/retirement";
import { useBaseCurrency } from "@/hooks/convex/portfolio";
import {
	FUNDING_TREATMENT_LABELS,
	type FundingTreatment,
} from "@/lib/types/retirement";
import { formatCurrency, formatRate } from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

const TREATMENTS = Object.keys(FUNDING_TREATMENT_LABELS) as FundingTreatment[];

export function PortfolioStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
}: RetirementStepProps) {
	const currency = useBaseCurrency();
	// The funding base exactly as the plan uses it (dashboard assets per
	// category, liabilities, the residence mortgage taken out).
	const results = useRetirementPreview(data);
	const loading = !results;

	const setTreatment = (category: string, treatment: FundingTreatment) =>
		update({
			fundingTreatments: { ...data.fundingTreatments, [category]: treatment },
		});

	return (
		<RetirementStepShell
			icon={Briefcase}
			title="Your portfolio today"
			description="This is the starting point we grow toward your target. Choose how each part is expected to grow, or leave out money you won't invest, like an emergency fund."
			onNext={onNext}
			onBack={onBack}
			isSaving={isSaving}
		>
			{loading ? (
				<Skeleton className="h-48 w-full rounded-lg" />
			) : (
				<div className="space-y-3">
					{results.fundingLines.length === 0 && (
						<p className="text-sm text-muted-foreground">
							No assets tracked yet — your plan starts from {formatCurrency(0, currency, { compact: true })}.
						</p>
					)}
					{results.fundingLines.map((line) => (
						<div
							key={line.category}
							className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
						>
							<div>
								<p className="text-sm font-medium">{line.label}</p>
								<p
									className={
										line.treatment === "exclude"
											? "text-xs text-muted-foreground line-through"
											: "text-xs text-muted-foreground"
									}
								>
									{formatCurrency(line.value, currency)}
								</p>
							</div>
							<Select
								value={line.treatment}
								onValueChange={(value: FundingTreatment) =>
									setTreatment(line.category, value)
								}
							>
								<SelectTrigger
									className="w-64"
									aria-label={`${line.label}: growth`}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{TREATMENTS.map((t) => (
										<SelectItem key={t} value={t}>
											{FUNDING_TREATMENT_LABELS[t]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					))}

					{results.liabilitiesCounted > 0 && (
						<div className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
							<span>Liabilities</span>
							<span className="font-medium">
								−{formatCurrency(results.liabilitiesCounted, currency)}
							</span>
						</div>
					)}

					<div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
						<div>
							<p className="font-medium">Fundable assets</p>
							<p className="text-xs text-muted-foreground">
								Expected growth {formatRate(results.optimistic.baseReturn)} / yr
								(conservative {formatRate(results.conservative.baseReturn)})
							</p>
						</div>
						<span className="text-xl font-bold">
							{formatCurrency(results.fundableNow, currency)}
						</span>
					</div>
				</div>
			)}

			{results?.hasNetDebt && (
				<Note>
					Your liabilities exceed your assets by{" "}
					<span className="font-medium text-foreground">
						{formatCurrency(-results.fundableNow, currency)}
					</span>
					. Your plan starts from{" "}
					{formatCurrency(0, currency, { compact: true })} — debt isn&apos;t grown at the investment
					return — so paying it down comes on top of the savings we calculate.
				</Note>
			)}
			{results?.residenceMortgage && (
				<Note>
					The{" "}
					<span className="font-medium text-foreground">
						{formatCurrency(results.residenceMortgage.balance, currency)}
					</span>{" "}
					mortgage on your home is not subtracted here: its{" "}
					{formatCurrency(results.residenceMortgage.monthlyPayment, currency)}/mo
					repayments come from your income until retirement.
				</Note>
			)}

			<p className="text-xs text-muted-foreground">
				Asset values update automatically as your accounts sync, so your
				progress stays live. Each part grows at its own rate; new savings grow
				at the scenario return. A home you live in is not included.
			</p>
		</RetirementStepShell>
	);
}

function Note({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
			<Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
			<p>{children}</p>
		</div>
	);
}
