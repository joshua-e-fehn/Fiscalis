"use client";

import { Gauge, PiggyBank } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/shadcn/card";
import type { RetirementResults } from "@/lib/types/retirement";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";

interface Props {
	results: RetirementResults;
	className?: string;
}

function monthly(value: number): string {
	if (!Number.isFinite(value)) return "—";
	return formatCurrency(value, "eur");
}

export function RequiredSavingsCard({ results, className }: Props) {
	const onTrack = results.optimistic.onTrack && results.conservative.onTrack;

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<PiggyBank className="h-4 w-4 text-primary" />
					How much to save each month
				</CardTitle>
			</CardHeader>
			<CardContent>
				{onTrack ? (
					<p className="text-sm text-muted-foreground">
						Based on your current assets and expected growth, you&apos;re on
						track to reach your goal without saving anything extra. Keep it up!
					</p>
				) : (
					<div className="grid gap-4 sm:grid-cols-2">
						<ScenarioBox
							label="Expected case"
							hint={`assumes ${(results.optimistic.annualReturn * 100).toFixed(1)}% / yr — a portfolio that doubles roughly every 10 years`}
							value={monthly(results.optimistic.monthlyContribution)}
							accent="primary"
						/>
						<ScenarioBox
							label="Conservative case"
							hint={`assumes a cautious ${(results.conservative.annualReturn * 100).toFixed(1)}% / yr`}
							value={monthly(results.conservative.monthlyContribution)}
							accent="muted"
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function ScenarioBox({
	label,
	hint,
	value,
	accent,
}: {
	label: string;
	hint: string;
	value: string;
	accent: "primary" | "muted";
}) {
	return (
		<div
			className={cn(
				"rounded-xl border p-4",
				accent === "primary"
					? "border-primary/30 bg-primary/5"
					: "border-border bg-muted/30",
			)}
		>
			<div className="flex items-center gap-1.5 text-sm font-medium">
				<Gauge className="h-3.5 w-3.5 text-muted-foreground" />
				{label}
			</div>
			<p className="mt-2 text-2xl font-bold">
				{value}
				<span className="ml-1 text-sm font-normal text-muted-foreground">
					/ mo
				</span>
			</p>
			<p className="mt-1 text-xs text-muted-foreground">{hint}</p>
		</div>
	);
}
