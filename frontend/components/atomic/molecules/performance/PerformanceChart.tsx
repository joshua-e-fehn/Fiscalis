/**
 * Unified Performance Chart Component
 *
 * A chart component that integrates with the new performance service.
 * Uses the unified TimeRange type and PerformanceDataPoint format.
 */

"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { TrendingUp, Wallet, TrendingDown } from "lucide-react";
import type {
  TimeRange,
  PerformanceTimeRangeLabel,
  PerformanceDataPoint,
  PerformanceMetrics,
} from "@/lib/performance";
import { TIME_RANGE_LABEL_MAP, TIME_RANGE_TO_LABEL } from "@/lib/performance";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type ChartViewMode = "portfolio" | "networth";

export interface PerformanceChartProps {
  /** Data points from performance hooks */
  dataPoints: PerformanceDataPoint[];
  /** Optional performance metrics for summary display */
  metrics?: PerformanceMetrics | null;
  /** Current value to display */
  currentValue: number;
  /** Total cost basis for reference line */
  totalCost?: number | null;
  /** Currency code for formatting */
  currency?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Custom class name */
  className?: string;
  /** Current liabilities for net worth calculation */
  totalLiabilities?: number;
  /** Custom title */
  title?: string;
  /** Enable portfolio/networth toggle */
  showViewToggle?: boolean;
  /** Available time ranges to show */
  availableRanges?: PerformanceTimeRangeLabel[];
  /** Initial time range */
  defaultTimeRange?: TimeRange;
  /** Callback when time range changes */
  onTimeRangeChange?: (range: TimeRange) => void;
  /** External time range control */
  timeRange?: TimeRange;
}

// ═══════════════════════════════════════════════════════════════
// Default Configuration
// ═══════════════════════════════════════════════════════════════

const DEFAULT_AVAILABLE_RANGES: PerformanceTimeRangeLabel[] = [
  "1W",
  "1M",
  "3M",
  "6M",
  "1Y",
  "ALL",
];

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(timestamp: number, range: TimeRange): string {
  const date = new Date(timestamp);
  if (range === "Hour" || range === "Day" || range === "Week") {
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
  }
  if (range === "Month" || range === "3Month") {
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
  }
  return date.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
}

function formatPercentChange(value: number | null | undefined): string {
  if (value == null) return "--";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export function PerformanceChart({
  dataPoints,
  metrics,
  currentValue,
  totalCost,
  currency = "EUR",
  isLoading = false,
  className,
  totalLiabilities = 0,
  title,
  showViewToggle = false,
  availableRanges = DEFAULT_AVAILABLE_RANGES,
  defaultTimeRange = "3Month",
  onTimeRangeChange,
  timeRange: externalTimeRange,
}: PerformanceChartProps) {
  // Internal time range state (used if external control not provided)
  const [internalTimeRange, setInternalTimeRange] =
    useState<TimeRange>(defaultTimeRange);
  const [viewMode, setViewMode] = useState<ChartViewMode>("portfolio");

  // Use external or internal time range
  const timeRange = externalTimeRange ?? internalTimeRange;

  // Handle time range change
  const handleTimeRangeChange = useCallback(
    (label: PerformanceTimeRangeLabel) => {
      const range = TIME_RANGE_LABEL_MAP[label];
      setInternalTimeRange(range);
      onTimeRangeChange?.(range);
    },
    [onTimeRangeChange],
  );

  // Determine display value based on view mode
  const displayValue =
    viewMode === "networth" ? currentValue - totalLiabilities : currentValue;
  const liabilitiesOffset = viewMode === "networth" ? totalLiabilities : 0;

  // Transform data points for chart
  const chartData = useMemo(() => {
    if (!dataPoints || dataPoints.length === 0) {
      if (displayValue > 0) {
        const now = Date.now();
        return [
          {
            date: formatDate(now, timeRange),
            value: currentValue - liabilitiesOffset,
            cost: (totalCost ?? currentValue) - liabilitiesOffset,
            timestamp: now,
          },
        ];
      }
      return [];
    }

    // Format and apply liabilities offset
    return dataPoints.map((dp) => ({
      date: formatDate(dp.timestamp, timeRange),
      value: dp.value - liabilitiesOffset,
      cost: (totalCost ?? dp.value) - liabilitiesOffset,
      timestamp: dp.timestamp,
      source: dp.source,
    }));
  }, [
    dataPoints,
    currentValue,
    totalCost,
    timeRange,
    liabilitiesOffset,
    displayValue,
  ]);

  // Calculate Y axis bounds
  const { minValue, maxValue, costBaseline } = useMemo(() => {
    if (chartData.length === 0) {
      return { minValue: 0, maxValue: 100, costBaseline: null };
    }

    const values = chartData.map((d) => d.value);
    const costs = chartData.map((d) => d.cost);
    const allValues = [...values, ...costs];

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.1 || max * 0.1;

    const minBound =
      viewMode === "networth" ? min - padding : Math.max(0, min - padding);
    const adjustedCostBaseline =
      totalCost !== null && totalCost !== undefined
        ? totalCost - liabilitiesOffset
        : null;

    return {
      minValue: minBound,
      maxValue: max + padding,
      costBaseline: adjustedCostBaseline,
    };
  }, [chartData, totalCost, viewMode, liabilitiesOffset]);

  // Determine chart color based on performance
  const isPositive =
    metrics?.percentChange != null && metrics.percentChange >= 0;
  const chartColor = isPositive
    ? "hsl(142.1 76.2% 36.3%)"
    : "hsl(0 84.2% 60.2%)";
  const chartColorFaded = isPositive
    ? "hsl(142.1 76.2% 36.3% / 0.2)"
    : "hsl(0 84.2% 60.2% / 0.2)";

  // Dynamic title
  const chartTitle =
    title ??
    (viewMode === "networth"
      ? "Net Worth Performance"
      : "Portfolio Performance");
  const ChartIcon =
    viewMode === "networth" ? Wallet : isPositive ? TrendingUp : TrendingDown;

  // Current time range label
  const currentLabel = TIME_RANGE_TO_LABEL[timeRange];

  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {chartTitle}
          </CardTitle>
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
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <ChartIcon className="h-4 w-4" />
            {chartTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-48">
          <div className="text-muted-foreground text-sm text-center">
            <p>No performance data yet</p>
            <p className="text-xs mt-1">Add holdings to track performance</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2">
          {/* Title + metrics + view toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ChartIcon className="h-4 w-4" />
                {chartTitle}
              </CardTitle>
              {metrics && (
                <span
                  className={cn(
                    "text-sm font-medium",
                    isPositive ? "text-green-600" : "text-red-600",
                  )}
                >
                  {formatPercentChange(metrics.percentChange)}
                </span>
              )}
            </div>
            {showViewToggle && (
              <div className="flex gap-1 bg-muted rounded-md p-0.5">
                <button
                  onClick={() => setViewMode("portfolio")}
                  className={cn(
                    "px-2 py-1 text-xs rounded transition-colors",
                    viewMode === "portfolio"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Portfolio
                </button>
                <button
                  onClick={() => setViewMode("networth")}
                  className={cn(
                    "px-2 py-1 text-xs rounded transition-colors",
                    viewMode === "networth"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Net Worth
                </button>
              </div>
            )}
          </div>
          {/* Time range selector */}
          <div className="flex justify-end gap-1">
            {availableRanges.map((label) => (
              <button
                key={label}
                onClick={() => handleTimeRangeChange(label)}
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors",
                  currentLabel === label
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <defs>
                <linearGradient
                  id="performanceGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                opacity={0.3}
              />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[minValue, maxValue]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(value) => {
                  if (Math.abs(value) >= 1000000) {
                    return `${(value / 1000000).toFixed(1)}M`;
                  }
                  if (Math.abs(value) >= 1000) {
                    return `${(value / 1000).toFixed(0)}K`;
                  }
                  return value.toFixed(0);
                }}
                width={50}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs">
                        <p className="text-muted-foreground">{data.date}</p>
                        <p className="font-medium">
                          {formatCurrency(data.value, currency)}
                        </p>
                        {data.source && data.source !== "snapshot" && (
                          <p className="text-muted-foreground text-[10px]">
                            ({data.source})
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              {/* Cost basis reference line */}
              {costBaseline != null && costBaseline > 0 && (
                <ReferenceLine
                  y={costBaseline}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="5 5"
                  strokeOpacity={0.5}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke={chartColor}
                strokeWidth={2}
                fill="url(#performanceGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
