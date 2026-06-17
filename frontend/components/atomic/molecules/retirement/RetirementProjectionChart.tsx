"use client";

import { useMemo } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	Legend,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/shadcn/card";
import type { RetirementResults } from "@/lib/types/retirement";
import { formatCurrency } from "@/lib/utils/currency";

interface Props {
	results: RetirementResults;
	className?: string;
}

interface ChartRow {
	age: number;
	expectedSaving: number;
	expectedNoSaving: number;
	conservativeSaving: number;
	conservativeNoSaving: number;
}

const EMERALD = "#10b981";

export function RetirementProjectionChart({ results, className }: Props) {
	const data = useMemo<ChartRow[]>(() => {
		const opt = results.optimistic.projectionSeries;
		const cons = results.conservative.projectionSeries;
		return opt.map((point, i) => ({
			age: point.age,
			expectedSaving: Math.round(point.portfolioValue),
			expectedNoSaving: Math.round(point.portfolioValueNoContrib),
			conservativeSaving: Math.round(
				cons[i]?.portfolioValue ?? point.portfolioValue,
			),
			conservativeNoSaving: Math.round(
				cons[i]?.portfolioValueNoContrib ?? point.portfolioValueNoContrib,
			),
		}));
	}, [results]);

	if (data.length < 2 || !Number.isFinite(results.targetPortfolio)) {
		return null;
	}

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle className="text-base">Projected portfolio growth</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="h-80 w-full">
					<ResponsiveContainer width="100%" height="100%">
						<AreaChart
							data={data}
							margin={{ top: 8, right: 8, left: 8, bottom: 4 }}
						>
							<defs>
								<linearGradient id="rp-expected" x1="0" y1="0" x2="0" y2="1">
									<stop
										offset="5%"
										stopColor="hsl(var(--primary))"
										stopOpacity={0.3}
									/>
									<stop
										offset="95%"
										stopColor="hsl(var(--primary))"
										stopOpacity={0}
									/>
								</linearGradient>
							</defs>
							<CartesianGrid
								strokeDasharray="3 3"
								className="stroke-muted"
								vertical={false}
							/>
							<XAxis
								dataKey="age"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								className="text-xs"
								tickFormatter={(v) => `${v}`}
							/>
							<YAxis
								tickLine={false}
								axisLine={false}
								width={48}
								className="text-xs"
								tickFormatter={(v) =>
									formatCurrency(v as number, "eur", { compact: true })
								}
							/>
							<Tooltip
								formatter={(value: number, name: string) => [
									formatCurrency(value, "eur"),
									name,
								]}
								labelFormatter={(label) => `Age ${label}`}
								contentStyle={{
									background: "hsl(var(--popover))",
									border: "1px solid hsl(var(--border))",
									borderRadius: 8,
									fontSize: 12,
								}}
							/>
							<Legend wrapperStyle={{ fontSize: 11 }} />
							<ReferenceLine
								y={results.targetPortfolio}
								stroke="hsl(var(--foreground))"
								strokeDasharray="4 4"
								label={{
									value: "Target",
									position: "insideTopRight",
									fontSize: 11,
									fill: "hsl(var(--foreground))",
								}}
							/>
							{/* Expected return, with monthly saving (the plan) */}
							<Area
								type="monotone"
								dataKey="expectedSaving"
								name="Expected + saving"
								stroke="hsl(var(--primary))"
								strokeWidth={2.5}
								fill="url(#rp-expected)"
							/>
							{/* Conservative return, with monthly saving */}
							<Area
								type="monotone"
								dataKey="conservativeSaving"
								name="Conservative + saving"
								stroke={EMERALD}
								strokeWidth={2}
								fill="none"
							/>
							{/* Expected return, current portfolio only */}
							<Area
								type="monotone"
								dataKey="expectedNoSaving"
								name="Expected, no saving"
								stroke="hsl(var(--primary))"
								strokeWidth={1.5}
								strokeDasharray="5 3"
								fill="none"
							/>
							{/* Conservative return, current portfolio only */}
							<Area
								type="monotone"
								dataKey="conservativeNoSaving"
								name="Conservative, no saving"
								stroke="hsl(var(--muted-foreground))"
								strokeWidth={1.5}
								strokeDasharray="5 3"
								fill="none"
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
				<p className="mt-2 text-xs text-muted-foreground">
					Four paths: your expected and conservative returns, each shown with
					your monthly saving plan and with your current portfolio left to grow
					on its own. The dashed line is your target.
				</p>
			</CardContent>
		</Card>
	);
}
