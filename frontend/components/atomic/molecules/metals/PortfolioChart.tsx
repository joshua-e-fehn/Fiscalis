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
import { MetalsCurrency } from "@/lib/types/metals-extended";
import { TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MS } from "@/../services/finance/financeService";

// ═══════════════════════════════════════════════════════════════
// Types using unified performance service
// ═══════════════════════════════════════════════════════════════

/**
 * @deprecated Use PerformanceTimeRangeLabel from @/lib/performance instead
 */
export type ChartTimeRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";

interface PortfolioDataPoint {
  date: string;
  value: number;
  cost: number;
  timestamp: number;
}

interface Transaction {
  transactionDate: string;
  transactionType: "buy" | "sell" | "gift_received" | "gift_given";
  quantity: number;
  pricePerUnit: number;
}

interface PortfolioChartProps {
  transactions: Transaction[] | undefined;
  currentValue: number;
  totalCost: number | null;
  currency?: MetalsCurrency;
  isLoading?: boolean;
  className?: string;
}

/**
 * Time range labels for UI buttons
 */
const timeRangeLabels: Record<ChartTimeRange, string> = {
  "1W": "1W",
  "1M": "1M",
  "3M": "3M",
  "6M": "6M",
  "1Y": "1Y",
  ALL: "All",
};

/**
 * Time range to milliseconds mapping
 * Uses unified MS constants from finance service
 */
const timeRangeMs: Record<ChartTimeRange, number | null> = {
  "1W": MS.DAY * 7,
  "1M": MS.DAY * 30,
  "3M": MS.DAY * 90,
  "6M": MS.DAY * 180,
  "1Y": MS.DAY * 365,
  ALL: null,
};

function formatCurrency(value: number, currency: MetalsCurrency): string {
  const currencyMap: Record<MetalsCurrency, string> = {
    eur: "EUR",
    usd: "USD",
    chf: "CHF",
  };
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: currencyMap[currency],
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

/**
 * Build portfolio value history from transactions
 * This creates a running total of invested cost over time
 * The chart shows:
 * - "value" line: historical cost basis, ending at current market value
 * - "cost" line: horizontal reference showing total cost basis
 */
function buildPortfolioHistory(
  transactions: Transaction[],
  currentValue: number,
  totalCost: number | null,
  timeRange: ChartTimeRange,
): PortfolioDataPoint[] {
  if (!transactions || transactions.length === 0) {
    return [];
  }

  // Sort transactions by date
  const sorted = [...transactions].sort(
    (a, b) =>
      new Date(a.transactionDate).getTime() -
      new Date(b.transactionDate).getTime(),
  );

  // Calculate cutoff date for time range
  const now = Date.now();
  const msRange = timeRangeMs[timeRange];
  const cutoffDate = msRange ? now - msRange : 0;

  // Build running cost total - track cost before cutoff too
  let runningCost = 0;
  let costAtCutoff = 0;
  const dataPoints: PortfolioDataPoint[] = [];

  for (const tx of sorted) {
    const txDate = new Date(tx.transactionDate).getTime();

    // Calculate cost change
    const costChange = tx.quantity * tx.pricePerUnit;

    if (
      tx.transactionType === "buy" ||
      tx.transactionType === "gift_received"
    ) {
      runningCost += costChange;
    } else if (
      tx.transactionType === "sell" ||
      tx.transactionType === "gift_given"
    ) {
      runningCost -= costChange;
    }

    // Track cost at the cutoff point
    if (txDate < cutoffDate) {
      costAtCutoff = runningCost;
    }

    // Only include data points if within time range
    if (txDate >= cutoffDate) {
      dataPoints.push({
        date: new Date(tx.transactionDate).toLocaleDateString("de-DE"),
        value: runningCost, // Use cost as proxy for historical value
        cost: runningCost,
        timestamp: txDate,
      });
    }
  }

  // Calculate the final cost basis to use as reference line
  const finalCost = totalCost ?? runningCost;

  // If we have holdings (runningCost > 0), always show the chart
  if (runningCost > 0 || currentValue > 0) {
    // Add starting point at cutoff if we had holdings before the range
    if (dataPoints.length === 0 && costAtCutoff > 0) {
      dataPoints.push({
        date: formatDate(cutoffDate, timeRange),
        value: costAtCutoff,
        cost: finalCost, // Use final cost basis as horizontal reference
        timestamp: cutoffDate,
      });
    }

    // Update all data points to show the final cost basis as a horizontal reference line
    for (const point of dataPoints) {
      point.cost = finalCost;
    }

    // Add current point with actual market value
    dataPoints.push({
      date: new Date().toLocaleDateString("de-DE"),
      value: currentValue,
      cost: finalCost,
      timestamp: now,
    });
  }

  // Ensure we have at least 2 points for a proper chart
  if (dataPoints.length === 1) {
    const firstPoint = dataPoints[0];
    // Add a point from the start of the range
    dataPoints.unshift({
      date: formatDate(
        cutoffDate || firstPoint.timestamp - 7 * 24 * 60 * 60 * 1000,
        timeRange,
      ),
      value: 0,
      cost: finalCost,
      timestamp: cutoffDate || firstPoint.timestamp - 7 * 24 * 60 * 60 * 1000,
    });
  }

  return dataPoints;
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
  const cost = payload.find((p) => p.dataKey === "cost")?.value ?? 0;
  const profitLoss = value - cost;
  const profitLossPercent = cost > 0 ? (profitLoss / cost) * 100 : 0;

  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
      <div className="font-medium mb-1">{label}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Value:</span>
          <span className="font-medium">{formatCurrency(value, currency)}</span>
        </div>
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
            {profitLoss >= 0 ? "+" : ""}
            {formatCurrency(profitLoss, currency)} (
            {profitLossPercent.toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>
  );
}

export function PortfolioChart({
  transactions,
  currentValue,
  totalCost,
  currency = "eur",
  isLoading = false,
  className,
}: PortfolioChartProps) {
  const [timeRange, setTimeRange] = useState<ChartTimeRange>("3M");

  const chartData = useMemo(
    () =>
      buildPortfolioHistory(
        transactions ?? [],
        currentValue,
        totalCost,
        timeRange,
      ),
    [transactions, currentValue, totalCost, timeRange],
  );

  const profitLoss = totalCost !== null ? currentValue - totalCost : null;
  const isProfit = profitLoss !== null && profitLoss >= 0;

  // Loading state
  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Portfolio Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  // No data state - but show current value if we have holdings
  if (
    (!transactions || transactions.length === 0 || chartData.length === 0) &&
    currentValue === 0
  ) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Portfolio Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48">
          <span className="text-sm text-muted-foreground">
            Add items to your vault to see portfolio performance
          </span>
        </CardContent>
      </Card>
    );
  }

  // Has holdings but no transaction history - show simple value display
  if (
    (!transactions || transactions.length === 0 || chartData.length === 0) &&
    currentValue > 0
  ) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Portfolio Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-48 space-y-4">
          <div className="text-center">
            <div className="text-3xl font-bold">
              {formatCurrency(currentValue, currency)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Current Portfolio Value
            </div>
          </div>
          {totalCost !== null && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">P/L:</span>
              <span
                className={cn(
                  "font-medium",
                  currentValue - totalCost >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {currentValue - totalCost >= 0 ? "+" : ""}
                {formatCurrency(currentValue - totalCost, currency)}
                {totalCost > 0 && (
                  <span className="ml-1">
                    (
                    {(((currentValue - totalCost) / totalCost) * 100).toFixed(
                      1,
                    )}
                    %)
                  </span>
                )}
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Add purchase details to your items to see historical performance
            charts
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Portfolio Performance
          </CardTitle>

          {/* Time Range Selector */}
          <div className="flex gap-1">
            {(Object.keys(timeRangeLabels) as ChartTimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  "px-2 py-1 text-xs rounded-md transition-colors",
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
                  tickFormatter={(value) => formatCurrency(value, currency)}
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
                {/* Cost baseline - horizontal reference line (rendered on top) */}
                <Line
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
