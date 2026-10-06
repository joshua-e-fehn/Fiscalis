"use client";

import { Briefcase, Home, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { useRetirementNetWorth } from "@/hooks/convex/retirement";
import { formatCurrency } from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

export function PortfolioStep({
	data,
	onNext,
	onBack,
	isSaving,
}: RetirementStepProps) {
	// Same figure as the dashboard's net worth (incl. vault holdings and manual loans).
	const netWorth = useRetirementNetWorth();
	const loading = netWorth === undefined;
	const nw = netWorth?.netWorth ?? 0;
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
					hint={
						netWorth
							? `Same as your dashboard: ${formatCurrency(netWorth.totalAssets, "eur")} in assets minus ${formatCurrency(netWorth.totalLiabilities, "eur")} in liabilities`
							: "Same as your dashboard: all assets minus liabilities"
					}
					value={loading ? null : formatCurrency(nw, "eur")}
				/>
				{equity > 0 && (
					<Row
						icon={Home}
						label="Sellable property"
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

			{!loading && fundable < 0 && (
				<Note>
					Your liabilities exceed your assets by{" "}
					<span className="font-medium text-foreground">
						{formatCurrency(-fundable, "eur")}
					</span>
					. Your plan starts from €0 — debt isn&apos;t grown at the investment
					return — so paying it down comes on top of the savings we calculate.
				</Note>
			)}
			{!loading && netWorth.totalLiabilities > 0 && (
				<Note>
					Your{" "}
					<span className="font-medium text-foreground">
						{formatCurrency(netWorth.totalLiabilities, "eur")}
					</span>{" "}
					in tracked loans reduce your net worth here just as on your
					dashboard
					{data.ownsPrimaryResidence
						? " — any mortgage on the home you live in is included, even though the home itself is not counted."
						: "."}
				</Note>
			)}

			<p className="text-xs text-muted-foreground">
				Your net worth updates automatically as your accounts sync, so your
				progress stays live. A primary residence you live in is not included
				here.
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
