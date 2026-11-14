"use client";

import { useTranslations } from "next-intl";
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
import type { InvestmentCurrency } from "@/lib/types/investments";
import { formatCurrency } from "@/lib/utils/currency";

interface Props {
	/** The currency `results` is in */
	currency: InvestmentCurrency;
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

export function RetirementProjectionChart({ results, currency, className }: Props) {
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
	const t = useTranslations("retirement.chart");

	if (data.length < 2 || !Number.isFinite(results.targetPortfolio)) {
		return null;
	}

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle className="text-base">{t("title")}</CardTitle>
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
								type="number"
								domain={["dataMin", "dataMax"]}
								allowDecimals={false}
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								className="text-xs"
								tickFormatter={(v) => `${v}`}
							/>
							<YAxis
								tickLine={false}
								axisLine={false}
								width={60}
								className="text-xs"
								tickFormatter={(v) =>
									formatCurrency(v as number, currency, { compact: true })
								}
							/>
							<Tooltip
								formatter={(value: number, name: string) => [
									formatCurrency(value, currency),
									name,
								]}
								labelFormatter={(label) => t("age", { age: String(label) })}
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
									value: t("target"),
									position: "insideTopRight",
									fontSize: 11,
									fill: "hsl(var(--foreground))",
								}}
							/>
							{/* Expected return, with monthly saving (the plan) */}
							<Area
								type="monotone"
								dataKey="expectedSaving"
								name={t("expectedSaving")}
								stroke="hsl(var(--primary))"
								strokeWidth={2.5}
								fill="url(#rp-expected)"
							/>
							{/* Conservative return, with monthly saving */}
							<Area
								type="monotone"
								dataKey="conservativeSaving"
								name={t("conservativeSaving")}
								stroke={EMERALD}
								strokeWidth={2}
								fill="none"
							/>
							{/* Expected return, current portfolio only */}
							<Area
								type="monotone"
								dataKey="expectedNoSaving"
								name={t("expectedNoSaving")}
								stroke="hsl(var(--primary))"
								strokeWidth={1.5}
								strokeDasharray="5 3"
								fill="none"
							/>
							{/* Conservative return, current portfolio only */}
							<Area
								type="monotone"
								dataKey="conservativeNoSaving"
								name={t("conservativeNoSaving")}
								stroke="hsl(var(--muted-foreground))"
								strokeWidth={1.5}
								strokeDasharray="5 3"
								fill="none"
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
				<p className="mt-2 text-xs text-muted-foreground">{t("footnote")}</p>
			</CardContent>
		</Card>
	);
}
