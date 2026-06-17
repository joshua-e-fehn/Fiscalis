"use client";

import { useQuery } from "convex/react";
import { Briefcase, Home } from "lucide-react";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { api } from "@/convex/_generated/api";
import { formatCurrency } from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

export function PortfolioStep({
	data,
	onNext,
	onBack,
	isSaving,
}: RetirementStepProps) {
	const netWorth = useQuery(api.portfolio.getTotalNetWorth);
	const loading = netWorth === undefined;
	const nw = netWorth?.total ?? 0;
	const equity = data.fundableRealEstateEquity ?? 0;
	const fundable = nw + equity;

	return (
		<RetirementStepShell
			icon={Briefcase}
			title="Your portfolio today"
			description="This is the starting point we grow toward your target."
			onNext={onNext}
			onBack={onBack}
			isSaving={isSaving}
		>
			<div className="space-y-3">
				<Row
					icon={Briefcase}
					label="Net worth"
					hint="All connected accounts, investments & cash"
					value={loading ? null : formatCurrency(nw, "eur")}
				/>
				{equity > 0 && (
					<Row
						icon={Home}
						label="Sellable property equity"
						hint="Added from the housing step"
						value={formatCurrency(equity, "eur")}
					/>
				)}
				<div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
					<div>
						<p className="font-medium">Fundable assets</p>
						<p className="text-xs text-muted-foreground">
							The basis for your retirement plan
						</p>
					</div>
					{loading ? (
						<Skeleton className="h-7 w-28" />
					) : (
						<span className="text-xl font-bold">
							{formatCurrency(fundable, "eur")}
						</span>
					)}
				</div>
			</div>

			<p className="text-xs text-muted-foreground">
				Your net worth updates automatically as your connected accounts sync, so
				your progress stays live. A primary residence you live in is not
				included here.
			</p>
		</RetirementStepShell>
	);
}

function Row({
	icon: Icon,
	label,
	hint,
	value,
}: {
	icon: typeof Briefcase;
	label: string;
	hint: string;
	value: string | null;
}) {
	return (
		<div className="flex items-center justify-between rounded-lg border border-border p-4">
			<div className="flex items-center gap-3">
				<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
					<Icon className="h-4 w-4" />
				</div>
				<div>
					<p className="text-sm font-medium">{label}</p>
					<p className="text-xs text-muted-foreground">{hint}</p>
				</div>
			</div>
			{value === null ? (
				<Skeleton className="h-6 w-24" />
			) : (
				<span className="font-semibold">{value}</span>
			)}
		</div>
	);
}
