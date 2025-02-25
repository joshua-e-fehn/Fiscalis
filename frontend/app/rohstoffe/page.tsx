"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Euro, DollarSign } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import { getHistoricalMetalPrices } from "@/lib/supabase/metals";
import { PeriodDuration } from "@/../services/finance/financeService";
import { PriceChart } from "@/components/atomic/organisms/PriceChart";
import { MetalChartData, MetalCurrency, MetalType } from "@/lib/types/metals";
import { formatDate } from "@/lib/utils/date";

const chartConfig = {
  price: {
    label: "Price",
    color: "hsl(var(--chart-1))",
  },
} as const;

const timeRangeButtons: Array<[PeriodDuration, string]> = [
  ["Hour", "1H"],
  ["Day", "1D"],
  ["Week", "1W"],
  ["Month", "1M"],
  ["YTD", "YTD"],
  ["Year", "1Y"],
  ["ALL", "All"],
];

export default function MetalsPage() {
  const [timeRange, setTimeRange] = React.useState<PeriodDuration>("Week");
  const [currency, setCurrency] = React.useState<MetalCurrency>("eur");
  const [metal, setMetal] = React.useState<MetalType>("gold");

  const { data, isLoading, error } = useQuery<MetalChartData[]>({
    queryKey: ["metalPrices", timeRange, currency],
    queryFn: () => getHistoricalMetalPrices(metal, timeRange, currency),
    // You can set options for refetching, cacheTime etc.
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true, // Refetch on window focus
    refetchOnReconnect: true, // Refetch if network reconnects
    refetchInterval: timeRange === "Hour" ? 1000 * 60 : 1000 * 60 * 5, // 1 minute or 5 minutes
  });

  const currentPrice = data ? data[data.length - 1]?.price ?? null : null;
  const lastUpdate = data ? data[data.length - 1]?.date ?? null : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <Card className="w-full relative z-10 p-4">
        <CardHeader>
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="grid flex-1 gap-1 text-center sm:text-left">
              <CardTitle>Goldpreis</CardTitle>
              <CardDescription>
                {isLoading
                  ? "Lädt..."
                  : `Stand: ${
                      lastUpdate ? formatDate(new Date(lastUpdate)) : "-"
                    }`}
              </CardDescription>
            </div>
            {currentPrice && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setCurrency(currency === "eur" ? "usd" : "eur")
                  }
                >
                  {currency === "eur" ? (
                    <Euro className="h-4 w-4" />
                  ) : (
                    <DollarSign className="h-4 w-4" />
                  )}
                </Button>
                <div className="text-2xl font-bold">
                  {currentPrice.toFixed(2)}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between space-y-0 pb-2 gap-2">
            {timeRangeButtons.map(([value, label]) => (
              <Button
                key={value}
                variant={timeRange === value ? "default" : "outline"}
                onClick={() => setTimeRange(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-[250px]">
              Laden...
            </div>
          ) : (
            <PriceChart
              chartData={data!}
              timeRange={timeRange}
              currency={currency}
              chartConfig={chartConfig}
              dataKey="date"
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
