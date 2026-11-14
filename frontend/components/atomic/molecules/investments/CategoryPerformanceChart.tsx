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
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import type { InvestmentCurrency } from "@/lib/types/investments";
import type { ChartPoint } from "@/lib/performance";
import { formatCurrency } from "@/lib/utils/currency";
import { TrendingUp, Wallet } from "lucide-react";
import {
  CHART_TIME_RANGES,
  type ChartTimeRange,
} from "@/components/atomic/molecules/metals/PortfolioChart";

// View mode options
export type ChartViewMode = "portfolio" | "networth";

interface CategoryPerformanceChartProps {
  /**
   * The engine's series for `timeRange` (toChartPoints), plotted unchanged:
   * it starts exactly at the range start. `cost` is the cost line, null (a
   * gap) where unknown.
   */
  dataPoints: ChartPoint[];
  /** The currency of the series (the performance hook's `currency`) */
  currency: InvestmentCurrency;
  isLoading?: boolean;
  className?: string;
  /** Title override - defaults to "Portfolio Performance" (or net worth) */
  title?: string;
  /**
   * Selected range (shared range labels). The caller owns it and fetches the
   * series for it.
   */
  timeRange: ChartTimeRange;
  onTimeRangeChange: (range: ChartTimeRange) => void;
  /**
   * With `onViewModeChange`, the Portfolio / Net Worth toggle is shown and
   * the caller passes the matching series (gross assets or net worth).
   */
  viewMode?: ChartViewMode;
  onViewModeChange?: (mode: ChartViewMode) => void;
  /** Some values are incomplete (a missing price, a partly failed sync) */
  partial?: boolean;
  /** Second line of the empty state; defaults to asking for holdings */
  emptyHint?: string;
}

/** Whole units for axis ticks and tooltip rows, e.g. "84'998€" or "84'998$". */
function formatWhole(value: number, currency: InvestmentCurrency): string {
  return formatCurrency(value, currency, { fractionDigits: 0 });
}

/** Day and month for the axis of short ranges ("14 Nov" · "14. Nov.") */
const AXIS_DAY = { day: "2-digit", month: "short" } as const;

export function CategoryPerformanceChart({
  dataPoints,
  currency,
  isLoading = false,
  className,
  title,
  timeRange,
  onTimeRangeChange: setTimeRange,
  viewMode = "portfolio",
  onViewModeChange,
  partial = false,
  emptyHint,
}: CategoryPerformanceChartProps) {
  const t = useTranslations("dashboard.performanceChart");
  const format = useFormatter();
  // The caller's series for the range, unchanged: filtering it again with a
  // later Date.now() would cut the range-start point it is measured from
  const chartData = useMemo(
    () =>
      dataPoints.map((dp) => ({
        ...dp,
        date:
          timeRange === "1W" || timeRange === "1M"
            ? format.dateTime(dp.timestamp, AXIS_DAY)
            : format.dateTime(dp.timestamp, "axisMonth"),
      })),
    [dataPoints, timeRange, format],
  );

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
    title ?? (isNetWorth ? t("netWorthTitle") : t("portfolioTitle"));
  const ChartIcon = isNetWorth ? Wallet : TrendingUp;
  const valueLabel = isNetWorth ? t("netWorth") : t("value");

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
            <p>{t("empty")}</p>
            <p className="text-xs mt-1">{emptyHint ?? t("emptyHint")}</p>
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
                    ["portfolio", t("portfolio")],
                    ["networth", t("netWorth")],
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
                tickFormatter={(value) => formatWhole(value, currency)}
                width={70}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const dataPoint = payload[0]?.payload;

                  // Show the full date with time for short ranges, the
                  // date only for longer ranges
                  const dateLabel = dataPoint?.timestamp
                    ? format.dateTime(
                        dataPoint.timestamp,
                        timeRange === "1W" ? "full" : "date",
                      )
                    : (dataPoint?.date ?? "");

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
                            {t("tooltipRow", {
                              series:
                                entry.dataKey === "value"
                                  ? valueLabel
                                  : t("costBasis"),
                              amount: formatWhole(
                                entry.value as number,
                                currency,
                              ),
                            })}
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
              <span className="text-muted-foreground">
                {t("costBasis")}
              </span>
            </div>
          )}
        </div>
        {partial && (
          <p className="text-xs text-muted-foreground text-center mt-1">
            {t("partial")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
