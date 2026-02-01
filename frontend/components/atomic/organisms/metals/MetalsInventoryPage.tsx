"use client";

import { useState, useMemo } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/shadcn/tabs";
import { Button } from "@/components/ui/shadcn/button";
import {
  useMetals,
  useMetalsSummary,
  useVaultTransactions,
} from "@/hooks/convex/metals";
import { useMetalsPrices, useYTDPortfolioPerformance } from "@/hooks/metals";
import {
  MetalsType,
  MetalsCurrency,
  MetalItemWithValuation,
} from "@/lib/types/metals-extended";
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
} from "@/components/atomic/molecules/metals";
import { cn } from "@/lib/utils";
import { ArrowLeftRight } from "lucide-react";
import { MetalDetailSlideOver } from "./MetalDetailSlideOver";
import { AddMetalSlideOver } from "./AddMetalSlideOver";
import { BulkSellDialog } from "./BulkSellDialog";
import { exportTransactionsToCSV } from "@/lib/utils/export";
import Link from "next/link";

interface MetalsInventoryPageProps {
  userId: string;
  currency?: MetalsCurrency;
  className?: string;
}

export function MetalsInventoryPage({
  userId,
  currency = "eur",
  className,
}: MetalsInventoryPageProps) {
  // Data hooks
  const {
    items,
    isLoading: itemsLoading,
    prices,
  } = useMetals(userId, currency);
  const { summary, isLoading: summaryLoading } = useMetalsSummary(
    userId,
    currency,
  );
  const {
    data: pricesData,
    isLoading: pricesLoading,
    refetch: refetchPrices,
  } = useMetalsPrices();
  const { transactions: rawTransactions, isLoading: transactionsLoading } =
    useVaultTransactions(userId);

  // UI state
  const [activeTab, setActiveTab] = useState<
    "overview" | "holdings" | "history"
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

  // Loading state
  const isLoading = itemsLoading || summaryLoading || pricesLoading;

  // Calculate YTD performance using historical prices
  // This fetches spot prices for Jan 1 and calculates portfolio value at that date
  const ytdPerformance = useYTDPortfolioPerformance(
    items,
    summary?.totalMarketValue ?? 0,
    currency,
  );

  // Filter and sort items
  const filteredItems = useMemo(() => {
    if (!items) return [];

    let result = [...items];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.displayName.toLowerCase().includes(query) ||
          item.catalogItem?.name.toLowerCase().includes(query) ||
          item.customName?.toLowerCase().includes(query),
      );
    }

    // Apply metal filter
    if (metalFilter !== "all") {
      result = result.filter((item) => item.metalType === metalFilter);
    }

    // Apply sorting
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

  // Transform and filter transactions for History tab
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

    // Apply search filter
    if (txSearchQuery) {
      const query = txSearchQuery.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.itemName.toLowerCase().includes(query) ||
          tx.notes?.toLowerCase().includes(query),
      );
    }

    // Apply type filter
    if (txTypeFilter !== "all") {
      result = result.filter((tx) => tx.transactionType === txTypeFilter);
    }

    // Apply metal filter
    if (txMetalFilter !== "all") {
      result = result.filter((tx) => tx.metalType === txMetalFilter);
    }

    return result;
  }, [rawTransactions, txSearchQuery, txTypeFilter, txMetalFilter]);

  // CSV Export handler
  const handleExportCSV = () => {
    if (transactions.length > 0) {
      const dateStr = new Date().toISOString().split("T")[0];
      exportTransactionsToCSV(
        transactions,
        `metal-transactions-${dateStr}.csv`,
      );
    }
  };

  // Toggle sort direction
  const handleSortChange = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Empty state - show within the page, not as replacement
  const isEmpty = !isLoading && (!items || items.length === 0);

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col items-center justify-start p-6 md:px-24 gap-6",
        className,
      )}
    >
      {/* Header */}
      <div className="w-full flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Precious Metals Inventory</h1>
          <p className="text-muted-foreground">
            Track and manage your precious metals portfolio
          </p>
        </div>
        <Button asChild>
          <Link
            href="/assets/commodities/metals"
            className="flex items-center gap-2"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Prices
          </Link>
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="w-full space-y-6"
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Row 1: Total Value + P/L + YTD */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TotalValueCard
              totalValue={summary?.totalMarketValue ?? 0}
              currency={currency}
              isLoading={summaryLoading}
            />
            <TotalProfitLossCard
              profitLoss={summary?.totalProfitLoss ?? null}
              profitLossPercent={summary?.totalProfitLossPercent ?? null}
              currency={currency}
              isLoading={summaryLoading}
            />
            <YTDPerformanceCard
              ytdProfitLoss={ytdPerformance.ytdProfitLoss}
              ytdProfitLossPercent={ytdPerformance.ytdProfitLossPercent}
              currency={currency}
              isLoading={summaryLoading || ytdPerformance.isLoading}
            />
          </div>

          {/* Row 2: Allocation + Performance Chart */}
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
              currency={currency}
              isLoading={summaryLoading || transactionsLoading}
            />
          </div>

          {/* Row 3: Metal Holdings Cards */}
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

          {/* Empty state CTA below the dashboard */}
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

        {/* Holdings Tab */}
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
                  // Navigate to history tab for export
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

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {isEmpty ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              No transactions yet. Add items to your vault to track history.
            </div>
          ) : (
            <>
              {/* Summary - at the top */}
              {transactions.length > 0 && (
                <TransactionSummary
                  transactions={transactions}
                  displayCurrency={currency}
                  unrealizedPL={summary?.totalProfitLoss ?? null}
                />
              )}

              {/* Filters */}
              <TransactionFilters
                searchQuery={txSearchQuery}
                onSearchChange={setTxSearchQuery}
                typeFilter={txTypeFilter}
                onTypeFilterChange={setTxTypeFilter}
                metalFilter={txMetalFilter}
                onMetalFilterChange={setTxMetalFilter}
                onExport={transactions.length > 0 ? handleExportCSV : undefined}
              />

              {/* Transaction List */}
              <TransactionList
                transactions={transactions}
                displayCurrency={currency}
                isLoading={transactionsLoading}
              />
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Slide-overs */}
      <MetalDetailSlideOver
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        userId={userId}
        currency={currency}
        onEdit={(item) => {
          // TODO: Open edit mode
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
        currency={currency}
      />
    </div>
  );
}
