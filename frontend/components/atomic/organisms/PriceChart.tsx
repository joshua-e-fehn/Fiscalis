import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/shadcn/chart";
import { MetalChartData } from "@/lib/types/metals";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { TimeRange } from "@/../services/finance/financeService";
import { formatDate } from "@/lib/utils/date";
import {
  isRecordedClose,
  percentFromFirstClose,
} from "@/../services/finance/metals";

interface PriceChartProps {
  chartData: MetalChartData[];
  timeRange: TimeRange;
  /** The currency of the closes */
  currency: InvestmentCurrency;
  chartConfig: ChartConfig;
  dataKey: string;
}

/** A missing close (null, or 0 from the API) is a gap, never a price */
const hasPrice = (d: MetalChartData) => isRecordedClose(d.price);

// Custom tooltip content; a gap says so instead of showing a price
const CustomTooltipContent = ({
  active,
  payload,
  label,
  timeRange,
  currency,
}: Pick<TooltipProps<number, string>, "active" | "payload" | "label"> & {
  timeRange: TimeRange;
  currency: InvestmentCurrency;
}) => {
  if (!active || !payload || !payload[0]) return null;

  const data = payload[0].payload as MetalChartData;

  return (
    <div className="bg-background border rounded-lg p-3 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1">
        {timeRange === "Hour" || timeRange === "Day"
          ? formatDate(new Date(label), "short")
          : formatDate(new Date(label), "date")}
      </p>
      {hasPrice(data) ? (
        <p className="text-sm font-medium">
          {formatCurrency(data.price!, currency)}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          No price recorded
        </p>
      )}
    </div>
  );
};

export const PriceChart = memo(function PriceChart({
  chartData,
  timeRange,
  currency,
  chartConfig,
  dataKey,
}: PriceChartProps) {
  // The raw closes, gaps as null so the line breaks there (no filling)
  const plotted = useMemo(
    () =>
      (chartData ?? []).map((d) => (hasPrice(d) ? d : { ...d, price: null })),
    [chartData],
  );
  const hasGaps = plotted.some((d) => d.price === null);

  // Calculate if price is up or down, between the first and last prices
  const isPositive = useMemo(() => {
    const prices = plotted.filter(hasPrice);
    if (prices.length < 2) return true;
    return prices[prices.length - 1].price! >= prices[0].price!;
  }, [plotted]);

  const chartColor = isPositive ? "#22c55e" : "#ef4444";

  return (
    <div className="relative h-full">
      {hasGaps && (
        <p className="absolute right-3 top-0 z-10 text-xs text-muted-foreground">
          Gaps: no price recorded
        </p>
      )}
      <ChartContainer config={chartConfig}>
        <AreaChart
          accessibilityLayer
          width={800}
          height={250}
          data={plotted}
          margin={{ left: 12, right: 12 }}
          className="p-2"
        >
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
          />
          <XAxis
            dataKey={dataKey}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(value) =>
              timeRange === "Hour" || timeRange === "Day"
                ? formatDate(new Date(value), "short")
                : formatDate(new Date(value), "date")
            }
          />
          <YAxis
            domain={["auto", "auto"]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(value) => formatCurrency(value, currency)}
          />
          {/* Recharts drops null values from the payload by default; a gap
              (price null) must reach the content to say no price was recorded */}
          <ChartTooltip
            cursor={false}
            filterNull={false}
            content={
              <CustomTooltipContent timeRange={timeRange} currency={currency} />
            }
          />
          <Area
            dataKey="price"
            type="linear"
            fill="url(#priceGradient)"
            fillOpacity={1}
            stroke={chartColor}
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
});

// Compare Chart - shows normalized % performance for multiple metals
interface CompareChartProps {
  datasets: {
    metal: string;
    data: MetalChartData[];
    color: string;
  }[];
  timeRange: TimeRange;
  className?: string;
}

export const CompareChart = memo(function CompareChart({
  datasets,
  timeRange,
  className,
}: CompareChartProps) {
  // Normalize data to percentage change from start
  const normalizedData = useMemo(() => {
    if (!datasets || datasets.length === 0) return [];

    // Find the dataset with the most data points to use as base timeline
    const baseDataset = datasets.reduce((a, b) =>
      (a.data?.length || 0) > (b.data?.length || 0) ? a : b,
    );

    if (!baseDataset.data || baseDataset.data.length === 0) return [];

    // Each metal as % change from its first recorded close; a gap leaves
    // the key unset so that line breaks, as in PriceChart
    const normalized = datasets.map((dataset) => ({
      metal: dataset.metal,
      percents: percentFromFirstClose(dataset.data ?? []),
    }));

    return baseDataset.data.map((point, index) => {
      const result: Record<string, Date | null | number> = {
        date: point.date,
      };

      for (const { metal, percents } of normalized) {
        const percentChange = percents[index];
        if (percentChange !== null && percentChange !== undefined) {
          result[metal] = percentChange;
        }
      }

      return result;
    });
  }, [datasets]);

  if (normalizedData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select metals to compare
      </div>
    );
  }

  return (
    <div className={cn("h-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={normalizedData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            {datasets.map((dataset) => (
              <linearGradient
                key={`gradient-${dataset.metal}`}
                id={`compareGradient-${dataset.metal}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={dataset.color} stopOpacity={0.3} />
                <stop
                  offset="95%"
                  stopColor={dataset.color}
                  stopOpacity={0.05}
                />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="hsl(var(--border))"
          />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(value) =>
              timeRange === "Hour" || timeRange === "Day"
                ? formatDate(new Date(value), "short")
                : formatDate(new Date(value), "date")
            }
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(value) =>
              `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
            }
            domain={["auto", "auto"]}
          />
          <ChartTooltip<number, string>
            content={({ active, payload, label }) => {
              if (!active || !payload) return null;
              // Filter out entries that aren't metal data
              const metalEntries = payload.filter(
                (entry): entry is typeof entry & { dataKey: string } =>
                  typeof entry.dataKey === "string" &&
                  datasets.some((d) => d.metal === entry.dataKey),
              );
              if (metalEntries.length === 0) return null;
              return (
                <div className="bg-background border rounded-lg p-3 shadow-lg">
                  <p className="text-xs text-muted-foreground mb-2">
                    {timeRange === "Hour" || timeRange === "Day"
                      ? formatDate(new Date(label), "short")
                      : formatDate(new Date(label), "date")}
                  </p>
                  {metalEntries.map((entry) => (
                    <div
                      key={entry.dataKey}
                      className="flex items-center gap-2 text-sm"
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="capitalize">{entry.dataKey}:</span>
                      <span
                        className={
                          entry.value !== undefined && entry.value >= 0
                            ? "text-profit"
                            : "text-loss"
                        }
                      >
                        {entry.value !== undefined && entry.value >= 0
                          ? "+"
                          : ""}
                        {entry.value?.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          {datasets.map((dataset) => (
            <Area
              key={dataset.metal}
              type="monotone"
              dataKey={dataset.metal}
              stroke={dataset.color}
              strokeWidth={2}
              fill={`url(#compareGradient-${dataset.metal})`}
              fillOpacity={1}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
