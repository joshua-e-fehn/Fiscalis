"use client";

/**
 * Unified Precious Metals Page
 *
 * Combines inventory management and price tracking:
 * - Overview: Portfolio summary, allocation, performance
 * - Holdings: Individual metal items (coins, bars, etc.)
 * - History: Transaction history with export
 * - Prices: Real-time price tracking and comparison
 */

import { useState, useMemo } from "react";
import * as React from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/shadcn/tabs";
import { Button } from "@/components/ui/shadcn/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  useMetals,
  useMetalsSummary,
  useVaultTransactions,
} from "@/hooks/convex/metals";
import {
  useMetalsPrices,
  useMetalPrices,
  useMetalPriceLatest,
  useMetalPricesRange,
} from "@/hooks/metals";
import { useMetalsYTD } from "@/hooks/performance";
import {
  MetalsType,
  MetalsCurrency,
  MetalItemWithValuation,
} from "@/lib/types/metals-extended";
import { MetalCurrency, MetalType } from "@/lib/types/metals";
import { TimeRange } from "@/../services/finance/financeService";
import {
  TotalValueCard,
  TotalProfitLossCard,
  YTDPerformanceCard,
  MetalCard,
  AllocationChart,
  PortfolioChart,
  EmptyVaultState,
  HoldingsToolbar,
  HoldingsTable,
  HoldingsCardGrid,
  HoldingsGroupedView,
  ViewMode,
  SortField,
  SortDirection,
  TransactionFilters,
  TransactionList,
  TransactionSummary,
  Transaction,
  TransactionTypeFilter,
  MetalTypeFilter,
  MetalsLargestHoldingsCard,
} from "@/components/atomic/molecules/metals";
import { PageHeader } from "@/components/atomic/molecules/investments";
import { MetalIcon } from "@/components/atomic/atoms/metals";
import {
  PriceChart,
  CompareChart,
} from "@/components/atomic/organisms/PriceChart";
import { cn } from "@/lib/utils";
import {
  Euro,
  DollarSign,
  TrendingUp,
  TrendingDown,
  GitCompare,
} from "lucide-react";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { MetalDetailSlideOver } from "./MetalDetailSlideOver";
import { AddMetalSlideOver } from "./AddMetalSlideOver";
import { BulkSellDialog } from "./BulkSellDialog";
import { exportTransactionsToCSV } from "@/lib/utils/export";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS FOR PRICES TAB
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// METAL PRICE CARD (for Prices tab)
// ═══════════════════════════════════════════════════════════════

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
    "day",
    currency,
    !isLoading,
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

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

interface MetalsPageProps {
  userId: string;
  currency?: MetalsCurrency;
  className?: string;
}

export function MetalsPage({
  userId,
  currency: initialCurrency = "eur",
  className,
}: MetalsPageProps) {
  // ─────────────────────────────────────────────────────────────
  // DATA HOOKS
  // ─────────────────────────────────────────────────────────────
  const {
    items,
    isLoading: itemsLoading,
    prices,
  } = useMetals(userId, initialCurrency);
  const { summary, isLoading: summaryLoading } = useMetalsSummary(
    userId,
    initialCurrency,
  );
  const {
    data: pricesData,
    isLoading: pricesLoading,
    refetch: refetchPrices,
  } = useMetalsPrices();
  const { transactions: rawTransactions, isLoading: transactionsLoading } =
    useVaultTransactions(userId);

  // ─────────────────────────────────────────────────────────────
  // UI STATE
  // ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<
    "overview" | "holdings" | "history" | "prices"
  >("overview");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [metalFilter, setMetalFilter] = useState<MetalsType | "all">("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // History tab state
  const [txSearchQuery, setTxSearchQuery] = useState("");
  const [txTypeFilter, setTxTypeFilter] =
    useState<TransactionTypeFilter>("all");
  const [txMetalFilter, setTxMetalFilter] = useState<MetalTypeFilter>("all");

  // Slide-over state
  const [selectedItem, setSelectedItem] =
    useState<MetalItemWithValuation | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"catalog" | "custom">("catalog");

  // Selection state for bulk selling
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkSellOpen, setIsBulkSellOpen] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // PRICES TAB STATE
  // ─────────────────────────────────────────────────────────────
  const [timeRange, setTimeRange] = useState<TimeRange>("Month");
  const [priceCurrency, setPriceCurrency] = useState<MetalCurrency>(
    initialCurrency as MetalCurrency,
  );
  const [selectedMetal, setSelectedMetal] = useState<MetalType>("gold");
  const [compareMode, setCompareMode] = useState(false);
  const [selectedMetals, setSelectedMetals] = useState<MetalType[]>([
    "gold",
    "silver",
  ]);

  // ─────────────────────────────────────────────────────────────
  // PRICES TAB DATA
  // ─────────────────────────────────────────────────────────────
  const { data: priceChartData, isLoading: priceChartLoading } = useMetalPrices(
    selectedMetal,
    timeRange,
    priceCurrency,
  );

  // Compare mode data
  const goldData = useMetalPrices("gold", timeRange, priceCurrency);
  const silverData = useMetalPrices("silver", timeRange, priceCurrency);
  const platinumData = useMetalPrices("platinum", timeRange, priceCurrency);
  const palladiumData = useMetalPrices("palladium", timeRange, priceCurrency);

  const compareDatasets = useMemo(() => {
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
        if (prev.length === 1) return prev;
        return prev.filter((m) => m !== metalType);
      }
      return [...prev, metalType];
    });
  };

  const currentPrice = priceChartData
    ? (priceChartData[priceChartData.length - 1]?.price ?? null)
    : null;
  const isCompareLoading =
    goldData.isLoading ||
    silverData.isLoading ||
    platinumData.isLoading ||
    palladiumData.isLoading;

  // ─────────────────────────────────────────────────────────────
  // LOADING STATES
  // ─────────────────────────────────────────────────────────────
  const isLoading = itemsLoading || summaryLoading || pricesLoading;

  // Calculate YTD performance using the unified performance service
  // Uses continuous strategy with historical metal prices
  const ytdPerformance = useMetalsYTD(initialCurrency);

  // ─────────────────────────────────────────────────────────────
  // FILTER & SORT ITEMS
  // ─────────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!items) return [];

    let result = [...items];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.displayName.toLowerCase().includes(query) ||
          item.catalogItem?.name.toLowerCase().includes(query) ||
          item.customName?.toLowerCase().includes(query),
      );
    }

    if (metalFilter !== "all") {
      result = result.filter((item) => item.metalType === metalFilter);
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.displayName.localeCompare(b.displayName);
          break;
        case "value":
          comparison = (a.marketValue ?? 0) - (b.marketValue ?? 0);
          break;
        case "weight":
          comparison =
            a.fineWeightGrams * a.quantity - b.fineWeightGrams * b.quantity;
          break;
        case "profitLoss":
          comparison = (a.profitLoss ?? 0) - (b.profitLoss ?? 0);
          break;
        case "dateAdded":
          comparison = a.createdAt - b.createdAt;
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [items, searchQuery, metalFilter, sortField, sortDirection]);

  // ─────────────────────────────────────────────────────────────
  // TRANSACTIONS
  // ─────────────────────────────────────────────────────────────
  const transactions: Transaction[] = useMemo(() => {
    if (!rawTransactions) return [];

    let result = rawTransactions.map((tx) => ({
      _id: tx._id,
      transactionType: tx.transactionType as Transaction["transactionType"],
      quantity: tx.quantity,
      pricePerUnit: tx.pricePerUnit,
      currency: tx.currency,
      transactionDate: tx.transactionDate,
      spotPriceAtTransaction: tx.spotPriceAtTransaction ?? undefined,
      notes: tx.notes ?? undefined,
      itemName: tx.itemName,
      metalType: tx.metalType,
    }));

    if (txSearchQuery) {
      const query = txSearchQuery.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.itemName.toLowerCase().includes(query) ||
          tx.notes?.toLowerCase().includes(query),
      );
    }

    if (txTypeFilter !== "all") {
      result = result.filter((tx) => tx.transactionType === txTypeFilter);
    }

    if (txMetalFilter !== "all") {
      result = result.filter((tx) => tx.metalType === txMetalFilter);
    }

    return result;
  }, [rawTransactions, txSearchQuery, txTypeFilter, txMetalFilter]);

  // ─────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (transactions.length > 0) {
      const dateStr = new Date().toISOString().split("T")[0];
      exportTransactionsToCSV(
        transactions,
        `metal-transactions-${dateStr}.csv`,
      );
    }
  };

  const handleSortChange = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const isEmpty = !isLoading && (!items || items.length === 0);

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col items-center justify-start p-6 md:px-24 gap-6",
        className,
      )}
    >
      {/* Header */}
      <PageHeader
        title="Precious Metals"
        subtitle="Track prices and manage your precious metals portfolio"
      />

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="w-full space-y-6"
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="prices">Prices</TabsTrigger>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* OVERVIEW TAB */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TotalValueCard
              totalValue={summary?.totalMarketValue ?? 0}
              currency={initialCurrency}
              isLoading={summaryLoading}
            />
            <TotalProfitLossCard
              profitLoss={summary?.totalProfitLoss ?? null}
              profitLossPercent={summary?.totalProfitLossPercent ?? null}
              currency={initialCurrency}
              isLoading={summaryLoading}
            />
            <YTDPerformanceCard
              ytdProfitLoss={ytdPerformance.ytdProfitLoss}
              ytdProfitLossPercent={ytdPerformance.ytdProfitLossPercent}
              currency={initialCurrency}
              isLoading={summaryLoading || ytdPerformance.isLoading}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AllocationChart summary={summary} isLoading={summaryLoading} />
            <PortfolioChart
              transactions={rawTransactions?.map((tx) => ({
                transactionDate: tx.transactionDate,
                transactionType: tx.transactionType as
                  | "buy"
                  | "sell"
                  | "gift_received"
                  | "gift_given",
                quantity: tx.quantity,
                pricePerUnit: tx.pricePerUnit,
              }))}
              currentValue={summary?.totalMarketValue ?? 0}
              totalCost={summary?.totalCost ?? null}
              currency={initialCurrency}
              isLoading={summaryLoading || transactionsLoading}
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(["gold", "silver", "platinum", "palladium"] as const).map(
              (metal) => (
                <MetalCard
                  key={metal}
                  metal={metal}
                  summary={
                    summary?.[metal] ?? {
                      totalFineWeightGrams: 0,
                      totalFineWeightOz: 0,
                      marketValue: 0,
                      meltValue: 0,
                      totalCost: null,
                      profitLoss: null,
                      profitLossPercent: null,
                      itemCount: 0,
                      totalItems: 0,
                    }
                  }
                  prices={prices ?? pricesData}
                  currency={initialCurrency}
                  isLoading={summaryLoading || pricesLoading}
                  onClick={() => {
                    setMetalFilter(metal);
                    setActiveTab("holdings");
                  }}
                />
              ),
            )}
          </div>

          {/* Largest Holdings Card - only show when there are holdings */}
          {!isEmpty && (
            <MetalsLargestHoldingsCard
              items={items}
              currency={initialCurrency}
              maxHoldingsPerMetal={3}
              isLoading={itemsLoading}
            />
          )}

          {isEmpty && (
            <EmptyVaultState
              onAddFromCatalog={() => {
                setAddMode("catalog");
                setIsAddOpen(true);
              }}
              onAddCustom={() => {
                setAddMode("custom");
                setIsAddOpen(true);
              }}
            />
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* HOLDINGS TAB */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="holdings" className="space-y-4">
          {isEmpty ? (
            <EmptyVaultState
              onAddFromCatalog={() => {
                setAddMode("catalog");
                setIsAddOpen(true);
              }}
              onAddCustom={() => {
                setAddMode("custom");
                setIsAddOpen(true);
              }}
            />
          ) : (
            <>
              <HoldingsToolbar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                sortField={sortField}
                sortDirection={sortDirection}
                onSortChange={handleSortChange}
                metalFilter={metalFilter}
                onMetalFilterChange={setMetalFilter}
                onAddItem={() => setIsAddOpen(true)}
                onExport={() => {
                  setActiveTab("history");
                }}
                selectionMode={selectionMode}
                selectedCount={selectedIds.size}
                onToggleSelectionMode={() => {
                  setSelectionMode(!selectionMode);
                  setSelectedIds(new Set());
                }}
                onSellSelected={() => setIsBulkSellOpen(true)}
              />

              {viewMode === "table" && (
                <HoldingsTable
                  items={filteredItems}
                  currency={initialCurrency}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSortChange}
                  onItemClick={setSelectedItem}
                  isLoading={itemsLoading}
                  selectionMode={selectionMode}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                />
              )}

              {viewMode === "cards" && (
                <HoldingsCardGrid
                  items={filteredItems}
                  currency={initialCurrency}
                  onItemClick={setSelectedItem}
                  isLoading={itemsLoading}
                />
              )}

              {viewMode === "grouped" && (
                <HoldingsGroupedView
                  items={filteredItems}
                  currency={initialCurrency}
                  onItemClick={setSelectedItem}
                  isLoading={itemsLoading}
                />
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* HISTORY TAB */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="history" className="space-y-4">
          {isEmpty ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              No transactions yet. Add items to your vault to track history.
            </div>
          ) : (
            <>
              {transactions.length > 0 && (
                <TransactionSummary
                  transactions={transactions}
                  displayCurrency={initialCurrency}
                  unrealizedPL={summary?.totalProfitLoss ?? null}
                />
              )}

              <TransactionFilters
                searchQuery={txSearchQuery}
                onSearchChange={setTxSearchQuery}
                typeFilter={txTypeFilter}
                onTypeFilterChange={setTxTypeFilter}
                metalFilter={txMetalFilter}
                onMetalFilterChange={setTxMetalFilter}
                onExport={transactions.length > 0 ? handleExportCSV : undefined}
              />

              <TransactionList
                transactions={transactions}
                displayCurrency={initialCurrency}
                isLoading={transactionsLoading}
              />
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* PRICES TAB */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="prices" className="space-y-6">
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
                  currency={priceCurrency}
                  onSelect={() => {
                    if (compareMode) {
                      toggleMetalSelection(metalType);
                    } else {
                      setSelectedMetal(metalType);
                    }
                  }}
                  isSelected={
                    compareMode
                      ? selectedMetals.includes(metalType)
                      : selectedMetal === metalType
                  }
                  showCheckbox={compareMode}
                />
              ))}
            </div>

            {/* Chart Area */}
            <Card className="lg:col-span-3 flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    {compareMode ? (
                      <>
                        <GitCompare className="h-4 w-4" />
                        Performance Comparison (% Change)
                      </>
                    ) : (
                      <>
                        <MetalIcon metal={selectedMetal} />
                        {metalNames[selectedMetal]} Price
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
                        setPriceCurrency(
                          priceCurrency === "eur" ? "usd" : "eur",
                        )
                      }
                      className="h-8"
                    >
                      {priceCurrency === "eur" ? (
                        <Euro className="h-4 w-4 mr-1" />
                      ) : (
                        <DollarSign className="h-4 w-4 mr-1" />
                      )}
                      {priceCurrency.toUpperCase()}
                    </Button>
                  </div>
                </div>

                {/* Price + Performance (normal mode) */}
                {!compareMode && (
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-baseline gap-2">
                      {priceChartLoading ? (
                        <Skeleton className="h-9 w-36" />
                      ) : currentPrice ? (
                        <>
                          <span className="text-4xl font-bold">
                            {priceCurrency === "eur" ? "€" : "$"}
                            {new Intl.NumberFormat("de-CH", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }).format(currentPrice)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            /oz
                          </span>
                        </>
                      ) : null}
                    </div>

                    {/* Performance indicator */}
                    {!priceChartLoading &&
                      priceChartData &&
                      priceChartData.length >= 2 &&
                      (() => {
                        const firstPrice =
                          priceChartData?.find(
                            (item) => item?.price && item.price > 0,
                          )?.price ?? null;
                        const lastPrice =
                          priceChartData[priceChartData.length - 1].price;
                        const performancePercent =
                          ((lastPrice! - firstPrice!) / firstPrice!) * 100;
                        const isPositive = performancePercent >= 0;

                        const timeRangeLabels: Record<TimeRange, string> = {
                          Hour: "1H",
                          Day: "1D",
                          Week: "1W",
                          Month: "1M",
                          "3Month": "3M",
                          "6Month": "6M",
                          Year: "1Y",
                          "3Year": "3Y",
                          "5Year": "5Y",
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
                      const dataset = compareDatasets.find(
                        (d) => d.metal === m,
                      );
                      const metalData = dataset?.data;
                      let performancePercent: number | null = null;

                      if (metalData && metalData.length >= 2) {
                        const firstPrice =
                          metalData.find(
                            (item) => item?.price && item.price > 0,
                          )?.price ?? null;
                        const lastPrice =
                          metalData[metalData.length - 1]?.price;
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
                ) : priceChartLoading ? (
                  <div className="h-[350px] bg-muted animate-pulse rounded-lg" />
                ) : (
                  <div className="space-y-3">
                    <div className="h-[350px]">
                      <PriceChart
                        chartData={priceChartData!}
                        timeRange={timeRange}
                        currency={priceCurrency}
                        chartConfig={chartConfig}
                        dataKey="date"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Slide-overs */}
      <MetalDetailSlideOver
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        userId={userId}
        currency={initialCurrency}
        onEdit={(item) => {
          console.log("Edit item", item);
        }}
      />

      <AddMetalSlideOver
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        userId={userId}
        mode={addMode}
        onModeChange={setAddMode}
        onSuccess={() => {
          // Items will auto-refresh via Convex reactivity
        }}
      />

      <BulkSellDialog
        items={filteredItems.filter((item) => selectedIds.has(item._id))}
        isOpen={isBulkSellOpen}
        onClose={() => {
          setIsBulkSellOpen(false);
          setSelectionMode(false);
          setSelectedIds(new Set());
        }}
        userId={userId}
        currency={initialCurrency}
      />
    </div>
  );
}
