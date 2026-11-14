"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/utils/currency";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChartPoint, PerformanceTimeRangeLabel } from "@/lib/performance";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** The ranges the chart offers (shared PerformanceTimeRangeLabel values) */
export type ChartTimeRange = Extract<
  PerformanceTimeRangeLabel,
  "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL"
>;

export const CHART_TIME_RANGES: readonly ChartTimeRange[] = [
  "1W",
  "1M",
  "3M",
  "6M",
  "1Y",
  "ALL",
];

interface PortfolioChartProps {
  /**
   * The vault's value history (useVaultPerformance, toChartPoints): value
   * at the quantity held then and historical spot, and the cost line (null
   * where the cost is unknown).
   */
  dataPoints: ChartPoint[];
  timeRange: ChartTimeRange;
  onTimeRangeChange: (range: ChartTimeRange) => void;
  /** The currency of the series (useVaultPerformance's `currency`) */
  currency: InvestmentCurrency;
  isLoading?: boolean;
  className?: string;
}

/** Each chart range's label: the price chart's range keys (metals.prices.range) */
const RANGE_LABEL_KEYS = {
  "1W": "Week",
  "1M": "Month",
  "3M": "3Month",
  "6M": "6Month",
  "1Y": "Year",
  ALL: "ALL",
} as const satisfies Record<ChartTimeRange, string>;

// Custom tooltip component
function CustomTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
  currency: InvestmentCurrency;
}) {
  const t = useTranslations("metals.performance");
  if (!active || !payload || payload.length === 0) return null;

  const value = payload.find((p) => p.dataKey === "value")?.value ?? 0;
  const cost = payload.find((p) => p.dataKey === "cost")?.value ?? null;
  const profitLoss = cost !== null ? value - cost : null;
  const profitLossPercent =
    profitLoss !== null && cost !== null && cost > 0
      ? (profitLoss / cost) * 100
      : null;

  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
      <div className="font-medium mb-1">{label}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">
            {t("tooltipRow", { label: t("value") })}
          </span>
          <span className="font-medium">{formatCurrency(value, currency)}</span>
        </div>
        {cost !== null && profitLoss !== null && (
          <>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                {t("tooltipRow", { label: t("cost") })}
              </span>
              <span>{formatCurrency(cost, currency)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                {t("tooltipRow", { label: t("profitLoss") })}
              </span>
              <span
                className={cn(
                  "font-medium",
                  profitLoss >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {profitLossPercent !== null
                  ? t("withPercent", {
                      amount: formatCurrency(profitLoss, currency, {
                        showSign: true,
                      }),
                      percent: formatPercent(profitLossPercent, true, 1),
                    })
                  : formatCurrency(profitLoss, currency, { showSign: true })}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function PortfolioChart({
  dataPoints,
  timeRange,
  onTimeRangeChange,
  currency,
  isLoading = false,
  className,
}: PortfolioChartProps) {
  const t = useTranslations("metals");
  const format = useFormatter();
  const chartData = useMemo(
    () =>
      dataPoints.map((p) => ({
        ...p,
        date:
          timeRange === "1W" || timeRange === "1M"
            ? format.dateTime(p.timestamp, { day: "2-digit", month: "short" })
            : format.dateTime(p.timestamp, "axisMonth"),
      })),
    [dataPoints, timeRange, format],
  );

  const last = dataPoints[dataPoints.length - 1];
  const isProfit = !last || last.cost === null || last.value >= last.cost;

  const header = (
    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
      <TrendingUp className="h-4 w-4" />
      {t("performance.portfolioTitle")}
    </CardTitle>
  );

  // Loading state
  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">{header}</CardHeader>
        <CardContent>
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  // Nothing held in the range, or no price history for it
  if (chartData.length < 2) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">{header}</CardHeader>
        <CardContent className="flex items-center justify-center h-48">
          <span className="text-sm text-muted-foreground">
            {t("performance.portfolioEmpty")}
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          {header}

          {/* Time Range Selector */}
          <div className="flex gap-1">
            {CHART_TIME_RANGES.map((range) => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={cn(
                  "px-2 py-1 text-xs rounded-md transition-colors",
                  timeRange === range
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {t(`prices.range.${RANGE_LABEL_KEYS[range]}`)}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          <motion.div
            key={timeRange}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-48"
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={isProfit ? "#22c55e" : "#ef4444"}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={isProfit ? "#22c55e" : "#ef4444"}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={(value) =>
                    formatCurrency(value, currency, { compact: true })
                  }
                  width={70}
                />
                <Tooltip
                  content={<CustomTooltip currency={currency} />}
                  cursor={{
                    stroke: "hsl(var(--muted-foreground))",
                    strokeDasharray: "5 5",
                  }}
                />
                {/* Portfolio value - render first so it's behind the cost line */}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={isProfit ? "#22c55e" : "#ef4444"}
                  strokeWidth={2}
                  fill="url(#colorValue)"
                  dot={false}
                  activeDot={{
                    r: 6,
                    stroke: isProfit ? "#22c55e" : "#ef4444",
                    strokeWidth: 2,
                    fill: "white",
                  }}
                />
                {/* Cost line: the lots' cost over time (rendered on top) */}
                <Line
                  connectNulls={false}
                  type="monotone"
                  dataKey="cost"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  dot={false}
                  activeDot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>
        </AnimatePresence>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div
              className={cn("w-3 h-0.5", isProfit ? "bg-profit" : "bg-loss")}
            />
            <span>{t("performance.value")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-0.5 bg-muted-foreground border-dashed"
              style={{ borderTopWidth: 1, borderTopStyle: "dashed" }}
            />
            <span>{t("performance.costBasis")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
