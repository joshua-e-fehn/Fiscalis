"use client";

import * as React from "react";
import { Euro, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import { TimeRange } from "@/../services/finance/financeService";
import { PriceChart } from "@/components/atomic/organisms/priceChart";
import { MetalCurrency, MetalType } from "@/lib/types/metals";
import {
  useMetalPrices,
  useMetalPriceLatest,
  useMetalPricesRange,
} from "@/hooks/metals";
import { formatDate } from "@/lib/utils/date";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import Link from "next/link";

const chartConfig = {
  price: {
    label: "Price",
    color: "hsl(var(--chart-1))",
  },
} as const;

const timeRangeButtons: Array<[TimeRange, string]> = [
  ["Hour", "1H"],
  ["Day", "1D"],
  ["Week", "1W"],
  ["Month", "1M"],
  ["YTD", "YTD"],
  ["Year", "1Y"],
  ["ALL", "All"],
];

const metalTypes: MetalType[] = ["gold", "silver", "platinum", "palladium"];
const metalNames: Record<MetalType, string> = {
  gold: "Gold",
  silver: "Silver",
  platinum: "Platinum",
  palladium: "Palladium",
};

const MetalPriceCard = ({
  metal,
  currency,
  onSelect,
  isSelected,
}: {
  metal: MetalType;
  currency: MetalCurrency;
  onSelect: () => void;
  isSelected: boolean;
}) => {
  const { data, isLoading } = useMetalPriceLatest(metal, currency);

  // Fetch YTD data to calculate performance
  const today = new Date();
  const currentYear = today.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));

  const { data: ytdData, isLoading: ytdLoading } = useMetalPricesRange(
    metal,
    startOfYear,
    today,
    "day", // Daily aggregation
    currency,
    !isLoading, // Only fetch YTD data once we have latest price
  );

  // Calculate YTD performance
  const startPrice = ytdData && ytdData.length > 0 ? ytdData[0]?.price : null;
  const currentPrice = data?.price || null;

  const hasPerformanceData = startPrice && currentPrice;
  const performancePercent = hasPerformanceData
    ? ((currentPrice - startPrice) / startPrice) * 100
    : null;

  const isPositive = performancePercent !== null && performancePercent >= 0;

  return (
    <Card
      className={`cursor-pointer transition-all ${
        isSelected ? "ring-2 ring-primary" : ""
      }`}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{metalNames[metal]}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold">
                {currentPrice?.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground">
                {currency.toUpperCase()}
              </span>
            </div>

            {ytdLoading ? (
              <Skeleton className="h-4 w-16 mt-2" />
            ) : hasPerformanceData ? (
              <div
                className={`flex items-center gap-1 mt-1 text-sm ${
                  isPositive ? "text-green-500" : "text-red-500"
                }`}
              >
                {isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                <span>{performancePercent?.toFixed(2)}% YTD</span>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default function PreciousMetalsPage() {
  const [timeRange, setTimeRange] = React.useState<TimeRange>("Week");
  const [currency, setCurrency] = React.useState<MetalCurrency>("eur");
  const [metal, setMetal] = React.useState<MetalType>("gold");

  const { data, isLoading, error } = useMetalPrices(metal, timeRange, currency);

  const currentPrice = data ? (data[data.length - 1]?.price ?? null) : null;
  const lastUpdate = data ? (data[data.length - 1]?.date ?? null) : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-6 md:px-24 gap-6">
      {/* Header with navigation to inventory */}
      <div className="flex w-full items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Precious Metals</h1>
          <p className="text-muted-foreground">
            Real-time price tracking for Gold, Silver, Platinum, and Palladium
          </p>
        </div>
        <Button asChild>
          <Link href="/commodities/metals/inventory">My Holdings</Link>
        </Button>
      </div>

      {/* Metal type selection cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
        {metalTypes.map((metalType) => (
          <MetalPriceCard
            key={metalType}
            metal={metalType}
            currency={currency}
            onSelect={() => setMetal(metalType)}
            isSelected={metal === metalType}
          />
        ))}
      </div>

      {/* Main chart card */}
      <Card className="w-full relative p-4">
        <CardHeader>
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="grid flex-1 gap-1 text-center sm:text-left">
              <CardTitle>{metalNames[metal]}</CardTitle>
              <CardDescription>
                {isLoading
                  ? "Loading..."
                  : `Last update: ${
                      lastUpdate ? formatDate(new Date(lastUpdate)) : "-"
                    }`}
              </CardDescription>
            </div>
            {currentPrice && (
              <div className="flex flex-col items-end gap-1">
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

                {/* Performance indicator for selected time range */}
                {isLoading ? (
                  <Skeleton className="h-4 w-16" />
                ) : data && data.length >= 2 ? (
                  (() => {
                    const firstPrice =
                      data?.find((item) => item?.price && item.price > 0)
                        ?.price ?? null;
                    const lastPrice = data[data.length - 1].price;
                    const performancePercent =
                      ((lastPrice! - firstPrice!) / firstPrice!) * 100;
                    const isPositive = performancePercent >= 0;

                    const timeRangeLabels: Record<TimeRange, string> = {
                      Hour: "last hour",
                      Day: "last day",
                      Week: "last week",
                      Month: "last month",
                      Year: "last year",
                      YTD: "YTD",
                      ALL: "all time",
                    };

                    return (
                      <div
                        className={`flex items-center gap-1 text-sm ${
                          isPositive ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {isPositive ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        <span>
                          {performancePercent.toFixed(2)}%{" "}
                          {timeRangeLabels[timeRange]}
                        </span>
                      </div>
                    );
                  })()
                ) : null}
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
              Loading...
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
