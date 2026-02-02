"use client";

import { useState, useMemo } from "react";
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
import {
  InvestmentCurrency,
  PortfolioDataPoint,
  currencyCodes,
} from "@/lib/types/investments";
import { TrendingUp, Wallet } from "lucide-react";
import {
  type PerformanceTimeRangeLabel,
  TIME_RANGE_LABEL_MAP,
} from "@/lib/performance";
import { MS } from "@/../services/finance/financeService";

// ═══════════════════════════════════════════════════════════════
// Types using unified performance service
// ═══════════════════════════════════════════════════════════════

/**
 * @deprecated Use PerformanceTimeRangeLabel from @/lib/performance instead
 */
export type ChartTimeRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "All";

// View mode options
export type ChartViewMode = "portfolio" | "networth";

interface CategoryPerformanceChartProps {
  dataPoints: PortfolioDataPoint[];
  currentValue: number;
  totalCost: number | null;
  currency?: InvestmentCurrency;
  isLoading?: boolean;
  className?: string;
  /** Current total liabilities - used to calculate net worth view */
  totalLiabilities?: number;
  /** Title override - defaults to "Portfolio Performance" */
  title?: string;
  /** Enable view mode toggle between portfolio and net worth */
  showViewToggle?: boolean;
}

/**
 * Time range labels for UI buttons
 * Maps to unified TimeRange via TIME_RANGE_LABEL_MAP
 */
const timeRangeLabels: Record<ChartTimeRange, string> = {
  "1W": "1W",
  "1M": "1M",
  "3M": "3M",
  "6M": "6M",
  "1Y": "1Y",
  All: "All",
};

/**
 * Time range to milliseconds mapping
 * Uses unified MS constants from finance service
 */
const timeRangeDays: Record<ChartTimeRange, number | null> = {
  "1W": MS.DAY * 7,
  "1M": MS.DAY * 30,
  "3M": MS.DAY * 90,
  "6M": MS.DAY * 180,
  "1Y": MS.DAY * 365,
  All: null,
};

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
  currentValue,
  totalCost,
  currency = "eur",
  isLoading = false,
  className,
  totalLiabilities = 0,
  title,
  showViewToggle = false,
}: CategoryPerformanceChartProps) {
  const [timeRange, setTimeRange] = useState<ChartTimeRange>("3M");
  const [viewMode, setViewMode] = useState<ChartViewMode>("portfolio");

  // Determine current display value based on view mode
  const displayValue =
    viewMode === "networth" ? currentValue - totalLiabilities : currentValue;

  // For net worth view, we approximate historical liabilities as constant
  // (proper implementation would track loan balances over time)
  const liabilitiesOffset = viewMode === "networth" ? totalLiabilities : 0;

  // Filter data points by time range and add current value
  const chartData = useMemo(() => {
    if (!dataPoints || dataPoints.length === 0) {
      // If no history, create minimal chart with just current state
      if (displayValue > 0 || (viewMode === "networth" && currentValue > 0)) {
        const now = Date.now();
        const value = currentValue - liabilitiesOffset;
        return [
          {
            date: formatDate(now, timeRange),
            value: value,
            cost: totalCost ? totalCost - liabilitiesOffset : value,
            timestamp: now,
          },
        ];
      }
      return [];
    }

    const now = Date.now();
    const msRange = timeRangeDays[timeRange];
    const cutoffDate = msRange ? now - msRange : 0;

    // Filter by time range
    let filtered = dataPoints.filter((dp) => dp.timestamp >= cutoffDate);

    // If no data in range, show all available
    if (filtered.length === 0) {
      filtered = [...dataPoints];
    }

    // Sort by timestamp
    filtered.sort((a, b) => a.timestamp - b.timestamp);

    // Add current point if not already at the end
    const lastPoint = filtered[filtered.length - 1];
    if (!lastPoint || lastPoint.timestamp < now - 60 * 60 * 1000) {
      filtered.push({
        date: formatDate(now, timeRange),
        value: currentValue,
        cost: totalCost ?? currentValue,
        timestamp: now,
      });
    }

    // Format dates for display and apply liabilities offset for net worth view
    return filtered.map((dp) => ({
      ...dp,
      date: formatDate(dp.timestamp, timeRange),
      value: dp.value - liabilitiesOffset,
      cost: dp.cost - liabilitiesOffset,
    }));
  }, [dataPoints, currentValue, totalCost, timeRange, liabilitiesOffset]);

  // Calculate min/max for Y axis
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

    // For net worth, allow negative values
    const minBound =
      viewMode === "networth" ? min - padding : Math.max(0, min - padding);

    // Apply liabilities offset to cost baseline for net worth view
    const adjustedCostBaseline =
      totalCost !== null ? totalCost - liabilitiesOffset : null;

    return {
      minValue: minBound,
      maxValue: max + padding,
      costBaseline: adjustedCostBaseline,
    };
  }, [chartData, totalCost, viewMode, liabilitiesOffset]);

  // Dynamic title based on view mode
  const chartTitle =
    title ??
    (viewMode === "networth"
      ? "Net Worth Performance"
      : "Portfolio Performance");
  const chartIcon = viewMode === "networth" ? Wallet : TrendingUp;
  const ChartIcon = chartIcon;

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
            {/* View mode toggle */}
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
          {/* Bottom row: Time range selector */}
          <div className="flex justify-end gap-1">
            {(Object.keys(timeRangeLabels) as ChartTimeRange[]).map((range) => (
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
                {timeRangeLabels[range]}
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

                  // Label based on view mode
                  const valueLabel =
                    viewMode === "networth" ? "Net Worth" : "Value";

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
                      {payload.map((entry, index) => (
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
              {/* Cost basis reference line */}
              {costBaseline && (
                <ReferenceLine
                  y={costBaseline}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="5 5"
                  strokeOpacity={0.5}
                />
              )}
              {/* Value area */}
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--profit))"
                strokeWidth={2}
                fill="url(#valueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="flex justify-center gap-6 mt-2">
          <div className="flex items-center gap-1.5 text-xs">
            <div className="w-4 h-0.5 bg-profit rounded" />
            <span className="text-muted-foreground">
              {viewMode === "networth" ? "Net Worth" : "Value"}
            </span>
          </div>
          {costBaseline && (
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-4 h-0.5 border-t border-dashed border-muted-foreground" />
              <span className="text-muted-foreground">Cost Basis</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
