"use client";

import * as React from "react";
import {
  Euro,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  GitCompare,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import { TimeRange } from "@/../services/finance/financeService";
import {
  PriceChart,
  CompareChart,
} from "@/components/atomic/organisms/priceChart";
import { MetalCurrency, MetalType } from "@/lib/types/metals";
import { MetalIcon } from "@/components/atomic/atoms/metals";
import {
  useMetalPrices,
  useMetalPriceLatest,
  useMetalPricesRange,
} from "@/hooks/metals";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import {
  hasInterpolatedData,
  getInterpolatedCount,
} from "@/lib/utils/interpolate";

const chartConfig = {
  price: {
    label: "Price",
    color: "hsl(var(--chart-1))",
  },
} as const;

const timeRangeButtons: Array<[TimeRange, string]> = [
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

const metalColors: Record<MetalType, string> = {
  gold: "#FFD700",
  silver: "#C0C0C0",
  platinum: "#E5E4E2",
  palladium: "#CED0DD",
};

const metalConfig: Record<
  MetalType,
  {
    borderClass: string;
    bgClass: string;
    selectedBgClass: string;
  }
> = {
  gold: {
    borderClass: "border-l-metal-gold",
    bgClass: "hover:bg-metal-gold/5",
    selectedBgClass: "bg-metal-gold/10",
  },
  silver: {
    borderClass: "border-l-metal-silver",
    bgClass: "hover:bg-metal-silver/5",
    selectedBgClass: "bg-metal-silver/10",
  },
  platinum: {
    borderClass: "border-l-metal-platinum",
    bgClass: "hover:bg-metal-platinum/5",
    selectedBgClass: "bg-metal-platinum/10",
  },
  palladium: {
    borderClass: "border-l-metal-palladium",
    bgClass: "hover:bg-metal-palladium/5",
    selectedBgClass: "bg-metal-palladium/10",
  },
};

const MetalPriceCard = ({
  metal,
  currency,
  onSelect,
  isSelected,
  showCheckbox = false,
}: {
  metal: MetalType;
  currency: MetalCurrency;
  onSelect: () => void;
  isSelected: boolean;
  showCheckbox?: boolean;
}) => {
  const config = metalConfig[metal];
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("de-CH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  if (isLoading) {
    return (
      <Card
        className={cn(
          "border-l-4 cursor-pointer transition-all duration-200",
          config.borderClass,
          config.bgClass,
        )}
        onClick={onSelect}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {showCheckbox && (
              <Checkbox checked={isSelected} className="pointer-events-none" />
            )}
            <MetalIcon metal={metal} />
            {metalNames[metal]}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "border-l-4 cursor-pointer transition-all duration-200",
        config.borderClass,
        isSelected ? config.selectedBgClass : config.bgClass,
        isSelected && "ring-2 ring-primary",
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            {showCheckbox && (
              <Checkbox checked={isSelected} className="pointer-events-none" />
            )}
            <MetalIcon metal={metal} />
            {metalNames[metal]}
          </div>
          <span className="text-xs text-muted-foreground">/oz</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold">
            {currency === "eur" ? "€" : "$"}
            {formatCurrency(currentPrice!)}
          </span>
        </div>

        {ytdLoading ? (
          <Skeleton className="h-4 w-16 mt-2" />
        ) : hasPerformanceData ? (
          <div
            className={cn(
              "flex items-center gap-1 mt-1 text-sm",
              isPositive ? "text-profit" : "text-loss",
            )}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span>{performancePercent?.toFixed(2)}% YTD</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default function PreciousMetalsPage() {
  const [timeRange, setTimeRange] = React.useState<TimeRange>("Month");
  const [currency, setCurrency] = React.useState<MetalCurrency>("eur");
  const [metal, setMetal] = React.useState<MetalType>("gold");
  const [compareMode, setCompareMode] = React.useState(false);
  const [selectedMetals, setSelectedMetals] = React.useState<MetalType[]>([
    "gold",
    "silver",
  ]);

  // Single metal data
  const { data, isLoading } = useMetalPrices(metal, timeRange, currency);

  // Compare mode data - fetch all selected metals
  const goldData = useMetalPrices("gold", timeRange, currency);
  const silverData = useMetalPrices("silver", timeRange, currency);
  const platinumData = useMetalPrices("platinum", timeRange, currency);
  const palladiumData = useMetalPrices("palladium", timeRange, currency);

  const compareDatasets = React.useMemo(() => {
    const datasets: { metal: MetalType; data: any[]; color: string }[] = [];

    if (selectedMetals.includes("gold") && goldData.data) {
      datasets.push({
        metal: "gold",
        data: goldData.data,
        color: metalColors.gold,
      });
    }
    if (selectedMetals.includes("silver") && silverData.data) {
      datasets.push({
        metal: "silver",
        data: silverData.data,
        color: metalColors.silver,
      });
    }
    if (selectedMetals.includes("platinum") && platinumData.data) {
      datasets.push({
        metal: "platinum",
        data: platinumData.data,
        color: metalColors.platinum,
      });
    }
    if (selectedMetals.includes("palladium") && palladiumData.data) {
      datasets.push({
        metal: "palladium",
        data: palladiumData.data,
        color: metalColors.palladium,
      });
    }

    return datasets;
  }, [
    selectedMetals,
    goldData.data,
    silverData.data,
    platinumData.data,
    palladiumData.data,
  ]);

  const toggleMetalSelection = (metalType: MetalType) => {
    setSelectedMetals((prev) => {
      if (prev.includes(metalType)) {
        // Don't allow deselecting if only one is selected
        if (prev.length === 1) return prev;
        return prev.filter((m) => m !== metalType);
      }
      return [...prev, metalType];
    });
  };

  const currentPrice = data ? (data[data.length - 1]?.price ?? null) : null;
  const isCompareLoading =
    goldData.isLoading ||
    silverData.isLoading ||
    platinumData.isLoading ||
    palladiumData.isLoading;

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-6 md:px-24 gap-6">
      {/* Header */}
      <div className="flex w-full items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Precious Metals</h1>
          <p className="text-muted-foreground">
            Real-time price tracking for Gold, Silver, Platinum, and Palladium
          </p>
        </div>
        <Button asChild>
          <Link
            href="/commodities/metals/inventory"
            className="flex items-center gap-2"
          >
            <ArrowLeftRight className="h-4 w-4" />
            My Inventory
          </Link>
        </Button>
      </div>

      {/* Main Content Grid */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Metal Selection Sidebar */}
        <div className="lg:col-span-1 space-y-3">
          {/* Compare Toggle */}
          <Card className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Compare Mode</span>
              </div>
              <Button
                variant={compareMode ? "default" : "outline"}
                size="sm"
                onClick={() => setCompareMode(!compareMode)}
              >
                {compareMode ? "On" : "Off"}
              </Button>
            </div>
          </Card>

          {/* Metal Cards */}
          {metalTypes.map((metalType) => (
            <MetalPriceCard
              key={metalType}
              metal={metalType}
              currency={currency}
              onSelect={() => {
                if (compareMode) {
                  toggleMetalSelection(metalType);
                } else {
                  setMetal(metalType);
                }
              }}
              isSelected={
                compareMode
                  ? selectedMetals.includes(metalType)
                  : metal === metalType
              }
              showCheckbox={compareMode}
            />
          ))}
        </div>

        {/* Chart Area */}
        <Card className="lg:col-span-3 flex flex-col">
          <CardHeader className="pb-2">
            {/* Top row: Title, Time Range, Currency Toggle */}
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                {compareMode ? (
                  <>
                    <GitCompare className="h-4 w-4" />
                    Performance Comparison (% Change)
                  </>
                ) : (
                  <>
                    <MetalIcon metal={metal} />
                    {metalNames[metal]} Price
                  </>
                )}
              </CardTitle>

              <div className="flex items-center gap-3">
                {/* Time Range Selector */}
                <div className="flex gap-1">
                  {timeRangeButtons.map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setTimeRange(value)}
                      className={cn(
                        "px-2 py-1 text-xs rounded-md transition-colors",
                        timeRange === value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Currency Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrency(currency === "eur" ? "usd" : "eur")
                  }
                  className="h-8"
                >
                  {currency === "eur" ? (
                    <Euro className="h-4 w-4 mr-1" />
                  ) : (
                    <DollarSign className="h-4 w-4 mr-1" />
                  )}
                  {currency.toUpperCase()}
                </Button>
              </div>
            </div>

            {/* Second row: Price + Performance (normal) or Legend + Performance (compare) */}
            {!compareMode && (
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-baseline gap-2">
                  {isLoading ? (
                    <Skeleton className="h-9 w-36" />
                  ) : currentPrice ? (
                    <>
                      <span className="text-4xl font-bold">
                        {currency === "eur" ? "€" : "$"}
                        {new Intl.NumberFormat("de-CH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(currentPrice)}
                      </span>
                      <span className="text-sm text-muted-foreground">/oz</span>
                    </>
                  ) : null}
                </div>

                {/* Performance indicator */}
                {!isLoading &&
                  data &&
                  data.length >= 2 &&
                  (() => {
                    const firstPrice =
                      data?.find((item) => item?.price && item.price > 0)
                        ?.price ?? null;
                    const lastPrice = data[data.length - 1].price;
                    const performancePercent =
                      ((lastPrice! - firstPrice!) / firstPrice!) * 100;
                    const isPositive = performancePercent >= 0;

                    const timeRangeLabels: Record<TimeRange, string> = {
                      Hour: "1H",
                      Day: "1D",
                      Week: "1W",
                      Month: "1M",
                      Year: "1Y",
                      YTD: "YTD",
                      ALL: "All",
                    };

                    return (
                      <div
                        className={cn(
                          "flex items-center gap-1 text-sm font-medium",
                          isPositive ? "text-profit" : "text-loss",
                        )}
                      >
                        {isPositive ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        <span>
                          {isPositive ? "+" : ""}
                          {performancePercent.toFixed(2)}% (
                          {timeRangeLabels[timeRange]})
                        </span>
                      </div>
                    );
                  })()}
              </div>
            )}

            {/* Compare mode legend */}
            {compareMode && (
              <div className="flex items-center gap-4 mt-2">
                {selectedMetals.map((m) => {
                  const dataset = compareDatasets.find((d) => d.metal === m);
                  const metalData = dataset?.data;
                  let performancePercent: number | null = null;

                  if (metalData && metalData.length >= 2) {
                    const firstPrice =
                      metalData.find((item) => item?.price && item.price > 0)
                        ?.price ?? null;
                    const lastPrice = metalData[metalData.length - 1]?.price;
                    if (firstPrice && lastPrice) {
                      performancePercent =
                        ((lastPrice - firstPrice) / firstPrice) * 100;
                    }
                  }

                  return (
                    <div key={m} className="flex items-center gap-1.5">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: metalColors[m] }}
                      />
                      <span className="text-sm capitalize">{m}</span>
                      {performancePercent !== null && (
                        <span
                          className={cn(
                            "text-xs font-medium",
                            performancePercent >= 0
                              ? "text-profit"
                              : "text-loss",
                          )}
                        >
                          ({performancePercent >= 0 ? "+" : ""}
                          {performancePercent.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardHeader>

          <CardContent className="pt-2 flex-1 flex flex-col">
            {compareMode ? (
              isCompareLoading ? (
                <div className="flex-1 min-h-[350px] bg-muted animate-pulse rounded-lg" />
              ) : (
                <div className="flex-1 min-h-[350px]">
                  <CompareChart
                    datasets={compareDatasets}
                    timeRange={timeRange}
                  />
                </div>
              )
            ) : isLoading ? (
              <div className="h-[350px] bg-muted animate-pulse rounded-lg" />
            ) : (
              <div className="space-y-3">
                <div className="h-[350px]">
                  <PriceChart
                    chartData={data!}
                    timeRange={timeRange}
                    currency={currency}
                    chartConfig={chartConfig}
                    dataKey="date"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
