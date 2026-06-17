"use client";

/**
 * ProviderAllocationChart Component
 *
 * Displays asset allocation breakdown by financial provider
 * (Plaid/Banking, SnapTrade/Brokers, Bitpanda).
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { useProviderAllocation } from "@/hooks/convex/providers";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Landmark,
  Briefcase,
  Bitcoin,
  PiggyBank,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { InvestmentCurrency } from "@/lib/types/investments";
import { formatCurrency } from "@/lib/utils/currency";

interface ProviderAllocationChartProps {
  className?: string;
  currency?: InvestmentCurrency;
  showLegend?: boolean;
  compact?: boolean;
}

const providerIcons: Record<string, React.ElementType> = {
  plaid: Landmark,
  snaptrade: Briefcase,
  bitpanda: Bitcoin,
};

const providerRoutes: Record<string, string> = {
  plaid: "/banking",
  snaptrade: "/brokers",
  bitpanda: "/integrations/brokers",
};

const providerLabels: Record<string, string> = {
  plaid: "Banking",
  snaptrade: "Brokers",
  bitpanda: "Bitpanda",
};

export function ProviderAllocationChart({
  className,
  currency = "eur",
  showLegend = true,
  compact = false,
}: ProviderAllocationChartProps) {
  const { allocations, totalValue, isLoading } = useProviderAllocation();

  // Filter out items under 2% threshold and combine into "Other"
  const THRESHOLD_PERCENT = 2;
  const significantItems: typeof allocations = [];
  let otherValue = 0;
  let otherPositions = 0;
  let otherConnections = 0;

  for (const alloc of allocations) {
    if (alloc.percentage >= THRESHOLD_PERCENT) {
      significantItems.push(alloc);
    } else {
      otherValue += alloc.value;
      otherPositions += alloc.positionsCount;
      otherConnections += alloc.connectionsCount;
    }
  }

  const chartData = significantItems.map((alloc) => ({
    name: providerLabels[alloc.provider] || alloc.name,
    value: alloc.value,
    color: alloc.color,
    percent: alloc.percentage,
    provider: alloc.provider as string,
    positionsCount: alloc.positionsCount,
    connectionsCount: alloc.connectionsCount,
  }));

  // Add "Other" category if there are small items
  if (otherValue > 0) {
    const otherPercent = totalValue > 0 ? (otherValue / totalValue) * 100 : 0;
    chartData.push({
      name: "Other (<2%)",
      value: otherValue,
      color: "#6B7280",
      percent: otherPercent,
      provider: "other",
      positionsCount: otherPositions,
      connectionsCount: otherConnections,
    });
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className={cn(compact && "pb-2")}>
          <CardTitle className={cn("text-lg", compact && "text-base")}>
            Provider Allocation
          </CardTitle>
          {!compact && (
            <CardDescription>
              Distribution by financial provider
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "flex items-center justify-center",
              compact ? "h-[150px]" : "h-[250px]",
            )}
          >
            <Skeleton
              className={cn(
                "rounded-full",
                compact ? "h-[130px] w-[130px]" : "h-[200px] w-[200px]",
              )}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (allocations.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className={cn(compact && "pb-2")}>
          <CardTitle className={cn("text-lg", compact && "text-base")}>
            Provider Allocation
          </CardTitle>
          {!compact && (
            <CardDescription>
              Distribution by financial provider
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "flex flex-col items-center justify-center text-muted-foreground",
              compact ? "h-[150px]" : "h-[250px]",
            )}
          >
            <PiggyBank className="h-12 w-12 mb-2 opacity-50" />
            <p>No connected providers</p>
            <p className="text-sm">
              Connect your banks, brokers, or crypto accounts
            </p>
            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="outline" asChild>
                <Link href="/banking">
                  <Landmark className="mr-2 h-4 w-4" />
                  Banking
                </Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/brokers">
                  <Briefcase className="mr-2 h-4 w-4" />
                  Brokers
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartSize = compact ? 130 : 200;
  const innerRadius = compact ? 35 : 50;
  const outerRadius = compact ? 55 : 80;

  return (
    <Card className={className}>
      <CardHeader className={cn(compact && "pb-2")}>
        <CardTitle className={cn("text-lg", compact && "text-base")}>
          Provider Allocation
        </CardTitle>
        {!compact && (
          <CardDescription>Distribution by financial provider</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "flex items-center gap-4",
            compact ? "flex-col" : "flex-col md:flex-row",
          )}
        >
          {/* Chart */}
          <div
            style={{ height: chartSize, width: chartSize }}
            className="shrink-0"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={innerRadius}
                  outerRadius={outerRadius}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0)
                      return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-card border rounded-lg p-2 shadow-lg">
                        <p className="font-medium">{data.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(data.value, currency)} (
                          {data.percent.toFixed(1)}%)
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {data.positionsCount} position
                          {data.positionsCount !== 1 ? "s" : ""} •{" "}
                          {data.connectionsCount} connection
                          {data.connectionsCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          {showLegend && (
            <div className={cn("flex-1 space-y-2", compact && "w-full")}>
              {chartData.map((item) => {
                const Icon = providerIcons[item.provider] || PiggyBank;
                const route = providerRoutes[item.provider] || "/";

                return (
                  <Link
                    key={item.provider}
                    href={route}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span
                        className={cn(
                          "font-medium",
                          compact ? "text-xs" : "text-sm",
                        )}
                      >
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p
                          className={cn(
                            "font-medium",
                            compact ? "text-xs" : "text-sm",
                          )}
                        >
                          {formatCurrency(item.value, currency)}
                        </p>
                        <p
                          className={cn(
                            "text-muted-foreground",
                            compact ? "text-[10px]" : "text-xs",
                          )}
                        >
                          {item.percent.toFixed(1)}%
                        </p>
                      </div>
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                    </div>
                  </Link>
                );
              })}

              {/* Total */}
              <div className="border-t pt-2 mt-2 flex items-center justify-between px-2">
                <span
                  className={cn(
                    "font-medium text-muted-foreground",
                    compact ? "text-xs" : "text-sm",
                  )}
                >
                  Total
                </span>
                <span className={cn("font-bold", compact ? "text-sm" : "")}>
                  {formatCurrency(totalValue, currency)}
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
