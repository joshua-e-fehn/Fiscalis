"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  InvestmentCurrency,
  PortfolioDataPoint,
} from "@/lib/types/investments";
import { currencyCodes } from "@/lib/utils/currency";
import { TrendingUp, Wallet } from "lucide-react";
import { TIME_RANGE_LABEL_MAP } from "@/lib/performance";
import { getTimeRangeStartTimestamp } from "@/../services/finance/financeService";
import {
  CHART_TIME_RANGES,
  type ChartTimeRange,
} from "@/components/atomic/molecules/metals/PortfolioChart";

// View mode options
export type ChartViewMode = "portfolio" | "networth";

interface CategoryPerformanceChartProps {
  /**
   * The series to plot, ending at the current value. `cost` is the cost
   * line, null (a gap) where unknown.
   */
  dataPoints: PortfolioDataPoint[];
  currency?: InvestmentCurrency;
  isLoading?: boolean;
  className?: string;
  /** Title override - defaults to "Portfolio Performance" */
  title?: string;
  /**
   * Selected range (shared range labels). With `onTimeRangeChange` the
   * caller owns it and fetches the series for it; otherwise the chart keeps
   * it (default 3M) and shows the part of `dataPoints` within it.
   */
  timeRange?: ChartTimeRange;
  onTimeRangeChange?: (range: ChartTimeRange) => void;
  /**
   * With `onViewModeChange`, the Portfolio / Net Worth toggle is shown and
   * the caller passes the matching series (gross assets or net worth).
   */
  viewMode?: ChartViewMode;
  onViewModeChange?: (mode: ChartViewMode) => void;
  /** Some values are incomplete (a missing price, a partly failed sync) */
  partial?: boolean;
}

function formatCurrency(value: number, currency: InvestmentCurrency): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: currencyCodes[currency],
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(timestamp: number, range: ChartTimeRange): string {
  const date = new Date(timestamp);
  if (range === "1W" || range === "1M") {
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
  }
  return date.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
}

export function CategoryPerformanceChart({
  dataPoints,
  currency = "eur",
  isLoading = false,
  className,
  title,
  timeRange: controlledRange,
  onTimeRangeChange,
  viewMode = "portfolio",
  onViewModeChange,
  partial = false,
}: CategoryPerformanceChartProps) {
  const [ownRange, setOwnRange] = useState<ChartTimeRange>("3M");
  const timeRange = controlledRange ?? ownRange;
  const setTimeRange = onTimeRangeChange ?? setOwnRange;

  // The points within the range, in time order. A caller that owns the
  // range passes the engine's series for it, which starts exactly at the
  // range start: shown unchanged, since filtering again with a later
  // Date.now() would cut that baseline point (services toChartPoints).
  const controlled = onTimeRangeChange !== undefined;
  const chartData = useMemo(() => {
    const start =
      controlled || timeRange === "ALL"
        ? -Infinity
        : getTimeRangeStartTimestamp(
            TIME_RANGE_LABEL_MAP[timeRange],
            Date.now(),
          );
    return dataPoints
      .filter((dp) => dp.timestamp >= start)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((dp) => ({ ...dp, date: formatDate(dp.timestamp, timeRange) }));
  }, [dataPoints, timeRange, controlled]);

  const hasCost = chartData.some((d) => d.cost !== null);

  // Y axis bounds over the values and the known costs
  const { minValue, maxValue } = useMemo(() => {
    if (chartData.length === 0) return { minValue: 0, maxValue: 100 };
    const all = chartData.flatMap((d) =>
      d.cost === null ? [d.value] : [d.value, d.cost],
    );
    const min = Math.min(...all);
    const max = Math.max(...all);
    const padding = (max - min) * 0.1 || Math.abs(max) * 0.1;
    // Net worth in debt goes below 0
    return {
      minValue: min < 0 ? min - padding : Math.max(0, min - padding),
      maxValue: max + padding,
    };
  }, [chartData]);

  const isNetWorth = viewMode === "networth";
  const chartTitle =
    title ?? (isNetWorth ? "Net Worth Performance" : "Portfolio Performance");
  const ChartIcon = isNetWorth ? Wallet : TrendingUp;
  const valueLabel = isNetWorth ? "Net Worth" : "Value";

  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {chartTitle}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-48 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ChartIcon className="h-4 w-4" />
              {chartTitle}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-48">
          <div className="text-muted-foreground text-sm text-center">
            <p>No performance data yet</p>
            <p className="text-xs mt-1">
              Add holdings to track portfolio performance
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2">
          {/* Top row: Title + View Toggle */}
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ChartIcon className="h-4 w-4" />
              {chartTitle}
            </CardTitle>
            {onViewModeChange && (
              <div className="flex gap-1 bg-muted rounded-md p-0.5">
                {(
                  [
                    ["portfolio", "Portfolio"],
                    ["networth", "Net Worth"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => onViewModeChange(mode)}
                    className={cn(
                      "px-2 py-1 text-xs rounded transition-colors",
                      viewMode === mode
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Bottom row: Time range selector */}
          <div className="flex justify-end gap-1">
            {CHART_TIME_RANGES.map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors",
                  timeRange === range
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <defs>
                <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(var(--profit))"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(var(--profit))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.5}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[minValue, maxValue]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatCurrency(value, currency)}
                width={70}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const dataPoint = payload[0]?.payload;

                  // Format the date from timestamp for precise display
                  let dateLabel = dataPoint?.date || "";
                  if (dataPoint?.timestamp) {
                    const date = new Date(dataPoint.timestamp);
                    // Show full date with time for short ranges, date only for longer ranges
                    if (timeRange === "1W") {
                      dateLabel = date.toLocaleString("de-DE", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    } else {
                      dateLabel = date.toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      });
                    }
                  }

                  return (
                    <div
                      style={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                        fontSize: "12px",
                        padding: "8px 12px",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          marginBottom: "4px",
                          fontWeight: 500,
                        }}
                      >
                        {dateLabel}
                      </p>
                      {payload
                        .filter((entry) => typeof entry.value === "number")
                        .map((entry, index) => (
                          <p
                            key={index}
                            style={{
                              margin: 0,
                              color: entry.color,
                            }}
                          >
                            {entry.dataKey === "value"
                              ? valueLabel
                              : "Cost Basis"}
                            : {formatCurrency(entry.value as number, currency)}
                          </p>
                        ))}
                    </div>
                  );
                }}
              />
              {/* Value area */}
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--profit))"
                strokeWidth={2}
                fill="url(#valueGradient)"
              />
              {/* Cost line over time, with gaps where the cost is unknown */}
              {hasCost && (
                <Line
                  connectNulls={false}
                  type="monotone"
                  dataKey="cost"
                  stroke="hsl(var(--muted-foreground))"
                  strokeOpacity={0.6}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="flex justify-center gap-6 mt-2">
          <div className="flex items-center gap-1.5 text-xs">
            <div className="w-4 h-0.5 bg-profit rounded" />
            <span className="text-muted-foreground">{valueLabel}</span>
          </div>
          {hasCost && (
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-4 h-0.5 border-t border-dashed border-muted-foreground" />
              <span className="text-muted-foreground">Cost Basis</span>
            </div>
          )}
        </div>
        {partial && (
          <p className="text-xs text-muted-foreground text-center mt-1">
            Partial: a provider sync failed or a price is missing
          </p>
        )}
      </CardContent>
    </Card>
  );
}
