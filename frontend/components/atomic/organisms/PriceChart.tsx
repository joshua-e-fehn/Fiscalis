import { memo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/shadcn/chart";
import { MetalChartData } from "@/types/metals";
import { PeriodDuration } from "@/../services/finance/financeService";
import { formatDate } from "@/lib/utils/date";

interface PriceChartProps {
  chartData: MetalChartData[];
  timeRange: PeriodDuration;
  currency: string;
  chartConfig: ChartConfig;
  dataKey: string;
}

export const PriceChart = memo(function PriceChart({
  chartData,
  timeRange,
  currency,
  chartConfig,
  dataKey,
}: PriceChartProps) {
  return (
    <ChartContainer config={chartConfig}>
      <AreaChart
        accessibilityLayer
        width={800}
        height={250}
        data={chartData}
        margin={{ left: 12, right: 12 }}
        className="p-2"
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={dataKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value) =>
            timeRange === "Hour" || timeRange === "Day"
              ? formatDate(new Date(value), "short")
              : formatDate(new Date(value), "date")
          }
        />
        <YAxis
          domain={["auto", "auto"]}
          tickFormatter={(value) => `${value.toFixed(2)}${currency}`}
        />
        <ChartTooltip
          cursor={false}
          labelFormatter={(label: any) => new Date(label).toLocaleDateString()}
          content={<ChartTooltipContent indicator="line" />}
        />
        <Area
          dataKey="price"
          type="linear"
          fill="var(--color-desktop)"
          fillOpacity={0.4}
          stroke="var(--color-desktop)"
        />
      </AreaChart>
    </ChartContainer>
  );
});
