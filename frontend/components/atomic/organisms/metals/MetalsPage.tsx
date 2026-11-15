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
import { useFormatter, useTranslations } from "next-intl";
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
  useMetalPriceHistory,
} from "@/hooks/metals";
import { useMetalsYTD } from "@/hooks/performance";
import { useVaultPerformance } from "@/hooks/performance/useContinuousPerformance";
import { labelToTimeRange, toChartPoints } from "@/lib/performance";
import {
  MetalsType,
  MetalItemWithValuation,
} from "@/lib/types/metals-extended";
import { MetalChartData, MetalType } from "@/lib/types/metals";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { TimeRange } from "@/../services/finance/financeService";
import {
  isRecordedClose,
  recordedRangeChange,
} from "@/../services/finance/metals";
import {
  TotalValueCard,
  TotalProfitLossCard,
  type ChartTimeRange,
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
import { formatCurrency } from "@/lib/utils/currency";
import {
  Banknote,
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
import { DeleteTransactionDialog } from "./DeleteTransactionDialog";
import {
  exportTransactionsToCSV,
  TRANSACTION_CSV_COLUMNS,
  type TransactionCsvHeaders,
} from "@/lib/utils/export";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS FOR PRICES TAB
// ═══════════════════════════════════════════════════════════════

const timeRangeButtons: TimeRange[] = [
  "Day",
  "Week",
  "Month",
  "YTD",
  "Year",
  "ALL",
];

const metalTypes: MetalType[] = ["gold", "silver", "platinum", "palladium"];

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
    borderClass: "border-s-metal-gold",
    bgClass: "hover:bg-metal-gold/5",
    selectedBgClass: "bg-metal-gold/10",
  },
  silver: {
    borderClass: "border-s-metal-silver",
    bgClass: "hover:bg-metal-silver/5",
    selectedBgClass: "bg-metal-silver/10",
  },
  platinum: {
    borderClass: "border-s-metal-platinum",
    bgClass: "hover:bg-metal-platinum/5",
    selectedBgClass: "bg-metal-platinum/10",
  },
  palladium: {
    borderClass: "border-s-metal-palladium",
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
  currency: InvestmentCurrency;
  onSelect: () => void;
  isSelected: boolean;
  showCheckbox?: boolean;
}) => {
  const t = useTranslations("metals");
  const config = metalConfig[metal];
  const { data, isLoading } = useMetalPriceLatest(metal, currency);

  // YTD closes (the shared daily history) to calculate performance
  const { data: ytdData, isLoading: ytdLoading } = useMetalPriceHistory(
    metal,
    "YTD",
    currency,
    { enabled: !isLoading },
  );

  // Calculate YTD performance
  const startPrice = ytdData && ytdData.length > 0 ? ytdData[0]?.price : null;
  const currentPrice = data?.price || null;

  const hasPerformanceData = startPrice && currentPrice;
  const performancePercent = hasPerformanceData
    ? ((currentPrice - startPrice) / startPrice) * 100
    : null;

  const isPositive = performancePercent !== null && performancePercent >= 0;

  if (isLoading) {
    return (
      <Card
        className={cn(
          "border-s-4 cursor-pointer transition-all duration-200",
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
            {t(`metal.${metal}`)}
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
        "border-s-4 cursor-pointer transition-all duration-200",
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
            {t(`metal.${metal}`)}
          </div>
          <span className="text-xs text-muted-foreground">
            {t("prices.perOz")}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold">
            {formatCurrency(currentPrice!, currency)}
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
            <span>
              {t("prices.ytd", {
                percent: `${performancePercent?.toFixed(2)}%`,
              })}
            </span>
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
  className?: string;
}

export function MetalsPage({ className }: MetalsPageProps) {
  const t = useTranslations("metals");
  const format = useFormatter();
  const chartConfig = useMemo(
    () => ({
      price: { label: t("chart.price"), color: "hsl(var(--chart-1))" },
    }),
    [t],
  );
  // ─────────────────────────────────────────────────────────────
  // DATA HOOKS
  // ─────────────────────────────────────────────────────────────
  // Holdings, summaries and spot quotes in the display currency
  const {
    items,
    currency,
    isLoading: itemsLoading,
    prices,
    spotPrices,
  } = useMetals();
  // Gated on the display rate: loading until it arrives
  const {
    summary,
    isLoading: summaryLoading,
    pricesAsOf,
  } = useMetalsSummary();
  // The Prices tab quotes in the display currency by default: the price
  // table's own column, or (GBP) the EUR quotes at each day's rate
  // (useMetalPrices). Everything else on the page is in the display
  // currency too: YTD and the vault series from the performance hooks, the
  // transaction summary and the sale dialogs at the display rate.
  const { data: pricesData, isLoading: pricesLoading } = useMetalsPrices();
  const { transactions: rawTransactions, isLoading: transactionsLoading } =
    useVaultTransactions();

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
  const [deletingTransaction, setDeletingTransaction] =
    useState<Transaction | null>(null);
  const [txSearchQuery, setTxSearchQuery] = useState("");
  const [txTypeFilter, setTxTypeFilter] =
    useState<TransactionTypeFilter>("all");
  const [txMetalFilter, setTxMetalFilter] = useState<MetalTypeFilter>("all");

  // Slide-over state: the id only, resolved from the live items, so the
  // detail view follows valuation and display-currency updates
  const [selectedItemId, setSelectedItemId] = useState<
    MetalItemWithValuation["_id"] | null
  >(null);
  const selectedItem =
    items?.find((item) => item._id === selectedItemId) ?? null;
  const setSelectedItem = (item: MetalItemWithValuation | null) =>
    setSelectedItemId(item?._id ?? null);
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
  // The quote toggle starts at the display currency and cycles through it,
  // EUR and USD; a choice made here overrides the default
  const [priceCurrencyChoice, setPriceCurrency] =
    useState<InvestmentCurrency | null>(null);
  const priceCurrency = priceCurrencyChoice ?? currency;
  const quoteCurrencies = [
    ...new Set<InvestmentCurrency>([currency, "eur", "usd"]),
  ];
  const nextQuoteCurrency =
    quoteCurrencies[
      (quoteCurrencies.indexOf(priceCurrency) + 1) % quoteCurrencies.length
    ];
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
    const datasets: { metal: MetalType; data: MetalChartData[]; color: string }[] = [];

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

  // The last recorded close (a missing one is a gap, null or 0)
  const currentPrice =
    priceChartData?.findLast((p) => isRecordedClose(p.price))?.price ?? null;
  const isCompareLoading =
    goldData.isLoading ||
    silverData.isLoading ||
    platinumData.isLoading ||
    palladiumData.isLoading;

  // ─────────────────────────────────────────────────────────────
  // LOADING STATES
  // ─────────────────────────────────────────────────────────────
  const isLoading = itemsLoading || summaryLoading || pricesLoading;

  // YTD and the value history from the one vault engine: ledger
  // quantities at historical spot, purchases and sales as flows
  const ytdPerformance = useMetalsYTD();
  const [chartRange, setChartRange] = useState<ChartTimeRange>("3M");
  const vaultHistory = useVaultPerformance(labelToTimeRange(chartRange), {
    includeDataPoints: true,
  });
  const chartPoints = useMemo(
    () => toChartPoints(vaultHistory.dataPoints),
    [vaultHistory.dataPoints],
  );

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

    // Opening balances are listed too, an unknown cost or date shown as such
    let result: Transaction[] = rawTransactions.map((tx) => ({
      _id: tx._id,
      transactionType: tx.transactionType as Transaction["transactionType"],
      quantity: tx.quantity,
      pricePerUnit: tx.pricePerUnit ?? null,
      currency: tx.currency,
      pricePerUnitBase: tx.pricePerUnitBase ?? undefined,
      transactionDate: tx.transactionDate ?? null,
      isOpening: tx.isOpening,
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
      const headers = Object.fromEntries(
        TRANSACTION_CSV_COLUMNS.map((column) => [column, t(`csv.${column}`)]),
      ) as TransactionCsvHeaders;
      exportTransactionsToCSV(
        transactions,
        headers,
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
        title={t("page.title")}
        subtitle={t("page.subtitle")}
      />

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="w-full space-y-6"
      >
        <TabsList>
          <TabsTrigger value="overview">{t("page.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="prices">{t("page.tabs.prices")}</TabsTrigger>
          <TabsTrigger value="holdings">{t("page.tabs.holdings")}</TabsTrigger>
          <TabsTrigger value="history">{t("page.tabs.history")}</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* OVERVIEW TAB */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TotalValueCard
              totalValue={summary?.totalMarketValue ?? 0}
              currency={currency}
              isLoading={summaryLoading}
            />
            {/* Unrealized + realized; unavailable while not priced at spot */}
            <TotalProfitLossCard
              profitLoss={
                summary?.pricedAtSpot ? summary.totalProfitLoss : null
              }
              profitLossPercent={
                summary?.pricedAtSpot ? summary.totalProfitLossPercent : null
              }
              currency={currency}
              isLoading={summaryLoading}
            />
            <YTDPerformanceCard
              ytdProfitLoss={ytdPerformance.ytdProfitLoss}
              ytdProfitLossPercent={ytdPerformance.ytdProfitLossPercent}
              currency={ytdPerformance.currency}
              isLoading={summaryLoading || ytdPerformance.isLoading}
            />
          </div>

          {!summaryLoading && !isEmpty && (
            <p className="text-xs text-muted-foreground -mt-3">
              {/* count: items with neither a spot nor a purchase price (M-C6) */}
              {t("page.pricesNote", {
                spot:
                  summary?.pricedAtSpot && pricesAsOf !== null
                    ? t("page.spotAsOf", {
                        date: format.dateTime(pricesAsOf, "full"),
                      })
                    : t("page.spotUnavailable"),
                count: summary?.unvaluedCount ?? 0,
              })}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AllocationChart summary={summary} isLoading={summaryLoading} />
            <PortfolioChart
              dataPoints={chartPoints}
              timeRange={chartRange}
              onTimeRangeChange={setChartRange}
              currency={vaultHistory.currency}
              isLoading={vaultHistory.isLoading}
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
                  spotPrice={spotPrices?.[metal] ?? null}
                  currency={currency}
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
              currency={currency}
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
                  currency={currency}
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
                  currency={currency}
                  onItemClick={setSelectedItem}
                  isLoading={itemsLoading}
                />
              )}

              {viewMode === "grouped" && (
                <HoldingsGroupedView
                  items={filteredItems}
                  currency={currency}
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
              {t("page.noTransactions")}
            </div>
          ) : (
            <>
              {transactions.length > 0 && (
                <TransactionSummary
                  transactions={transactions}
                  displayCurrency={currency}
                  exchangeRates={(prices ?? pricesData)?.all?.exchangeRates}
                  realizedPL={summary?.realizedProfitLoss ?? null}
                  unrealizedPL={
                    summary?.pricedAtSpot ? summary.unrealizedProfitLoss : null
                  }
                  totalPL={summary?.pricedAtSpot ? summary.totalProfitLoss : null}
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
                displayCurrency={currency}
                isLoading={transactionsLoading}
                onDelete={setDeletingTransaction}
              />
              <DeleteTransactionDialog
                transaction={deletingTransaction}
                onClose={() => setDeletingTransaction(null)}
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
                    <span className="text-sm font-medium">
                      {t("prices.compareMode")}
                    </span>
                  </div>
                  <Button
                    variant={compareMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCompareMode(!compareMode)}
                  >
                    {compareMode ? t("prices.on") : t("prices.off")}
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
                        {t("prices.comparisonTitle")}
                      </>
                    ) : (
                      <>
                        <MetalIcon metal={selectedMetal} />
                        {t("prices.metalPrice", {
                          metal: t(`metal.${selectedMetal}`),
                        })}
                      </>
                    )}
                  </CardTitle>

                  <div className="flex items-center gap-3">
                    {/* Time Range Selector */}
                    <div className="flex gap-1">
                      {timeRangeButtons.map((value) => (
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
                          {t(`prices.range.${value}`)}
                        </button>
                      ))}
                    </div>

                    {/* Currency Toggle */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPriceCurrency(nextQuoteCurrency)}
                      className="h-8"
                    >
                      {priceCurrency === "eur" ? (
                        <Euro className="h-4 w-4 me-1" />
                      ) : priceCurrency === "usd" ? (
                        <DollarSign className="h-4 w-4 me-1" />
                      ) : (
                        <Banknote className="h-4 w-4 me-1" />
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
                            {formatCurrency(currentPrice, priceCurrency)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {t("prices.perOz")}
                          </span>
                        </>
                      ) : null}
                    </div>

                    {/* Performance indicator */}
                    {!priceChartLoading &&
                      priceChartData &&
                      (() => {
                        // First to last recorded close; gaps at either end
                        // are skipped, never read as a price
                        const change = recordedRangeChange(priceChartData);
                        if (!change) return null;
                        const performancePercent = change.percentage;
                        const isPositive = performancePercent >= 0;

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
                              {t("prices.change", {
                                percent: `${isPositive ? "+" : ""}${performancePercent.toFixed(2)}%`,
                                range: t(`prices.range.${timeRange}`),
                              })}
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
                      const performancePercent = metalData
                        ? (recordedRangeChange(metalData)?.percentage ?? null)
                        : null;

                      return (
                        <div key={m} className="flex items-center gap-1.5">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: metalColors[m] }}
                          />
                          <span className="text-sm">{t(`metal.${m}`)}</span>
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
        currency={currency}
      />

      <AddMetalSlideOver
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
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
        currency={currency}
      />
    </div>
  );
}
