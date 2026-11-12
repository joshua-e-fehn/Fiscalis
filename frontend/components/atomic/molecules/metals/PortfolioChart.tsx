"use client";

import { useMemo } from "react";
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
  ReferenceLine,
  Area,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { MetalsCurrency } from "@/lib/types/metals-extended";
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
  currency?: MetalsCurrency;
  isLoading?: boolean;
  className?: string;
}

function formatDate(timestamp: number, range: ChartTimeRange): string {
  const date = new Date(timestamp);
  if (range === "1W" || range === "1M") {
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
  }
  return date.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
}

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
  currency: MetalsCurrency;
}) {
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
          <span className="text-muted-foreground">Value:</span>
          <span className="font-medium">{formatCurrency(value, currency)}</span>
        </div>
        {cost !== null && profitLoss !== null && (
          <>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Cost:</span>
              <span>{formatCurrency(cost, currency)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">P/L:</span>
              <span
                className={cn(
                  "font-medium",
                  profitLoss >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {formatCurrency(profitLoss, currency, { showSign: true })}
                {profitLossPercent !== null &&
                  ` (${profitLossPercent.toFixed(1)}%)`}
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
  currency = "eur",
  isLoading = false,
  className,
}: PortfolioChartProps) {
  const chartData = useMemo(
    () =>
      dataPoints.map((p) => ({
        ...p,
        date: formatDate(p.timestamp, timeRange),
      })),
    [dataPoints, timeRange],
  );

  const last = dataPoints[dataPoints.length - 1];
  const isProfit = !last || last.cost === null || last.value >= last.cost;

  const header = (
    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
      <TrendingUp className="h-4 w-4" />
      Portfolio Performance
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
            Add items to your vault to see portfolio performance
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
                {range === "ALL" ? "All" : range}
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
            <span>Value</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-0.5 bg-muted-foreground border-dashed"
              style={{ borderTopWidth: 1, borderTopStyle: "dashed" }}
            />
            <span>Cost Basis</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
