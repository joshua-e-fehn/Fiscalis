"use client";

/**
 * Crypto Allocation Chart
 *
 * A donut chart showing portfolio allocation by cryptocurrency position.
 * Shows top holdings (BTC, ETH, SOL, etc.) rather than by category/exchange.
 */

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { cn } from "@/lib/utils";
import { useCryptoPositionAllocations } from "@/hooks/convex/crypto";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface CryptoAllocationChartProps {
  maxPositions?: number;
  className?: string;
}

export function CryptoAllocationChart({
  maxPositions = 8,
  className,
}: CryptoAllocationChartProps) {
  const { allocations, totalValue, isLoading } =
    useCryptoPositionAllocations(maxPositions);

  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Allocation by Position
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48">
          <div className="h-32 w-32 rounded-full bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (allocations.length === 0 || totalValue === 0) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Allocation by Position
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-48">
          {/* Empty state donut placeholder */}
          <div className="relative h-32 w-32">
            <div className="absolute inset-0 rounded-full border-8 border-muted" />
            <div className="absolute inset-4 rounded-full bg-background" />
          </div>
          <span className="text-sm text-muted-foreground mt-4">
            No holdings yet
          </span>
        </CardContent>
      </Card>
    );
  }

  // Prepare data for pie chart
  const chartData = allocations.map((a) => ({
    name: a.symbol,
    fullName: a.name,
    value: a.percentage,
    absoluteValue: a.value,
    color: a.color,
  }));

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Allocation by Position
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={2}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    stroke="none"
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value.toFixed(1)}%`,
                  chartData.find((d) => d.name === name)?.fullName || name,
                ]}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-3 mt-2">
          {chartData.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.name}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
