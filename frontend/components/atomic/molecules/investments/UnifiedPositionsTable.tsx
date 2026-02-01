"use client";

/**
 * UnifiedPositionsTable Component
 *
 * Displays all positions across all financial providers
 * (Plaid, SnapTrade, Vezgo) in a unified, sortable table.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Input } from "@/components/ui/shadcn/input";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { useUnifiedPositions } from "@/hooks/convex/providers";
import { useAllMetalPrices } from "@/hooks/metals";
import {
  Search,
  ArrowUpDown,
  Landmark,
  Briefcase,
  Bitcoin,
  Filter,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  PenLine,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatCurrency, InvestmentCurrency } from "@/lib/types/investments";
import { useState, useMemo } from "react";
import type { FinancialProvider } from "@/lib/types/portfolio";

interface UnifiedPositionsTableProps {
  className?: string;
  currency?: InvestmentCurrency;
  showFilters?: boolean;
  maxRows?: number;
  compact?: boolean;
}

// Position type returned from useUnifiedPositions
interface UnifiedPositionData {
  id: string;
  _id: string;
  provider: FinancialProvider;
  category: string;
  subcategory?: string;
  symbol: string;
  name: string;
  quantity: number;
  currentPrice?: number;
  marketValue: number;
  currency: string;
  valueInBaseCurrency?: number;
  costBasis?: number;
  unrealizedPL?: number;
  unrealizedPLPercent?: number;
  lastSyncAt: number;
  metadata?: {
    accountId?: string;
    institutionName?: string;
    accountType?: string;
    subtype?: string;
    mask?: string;
    brokerName?: string;
    isin?: string;
    assetType?: string;
    accountName?: string;
    chain?: string;
    protocol?: string;
    providerName?: string;
    providerType?: string;
    contractAddress?: string;
    tokenId?: string;
    imageUrl?: string;
  };
}

type SortField = "name" | "value" | "quantity" | "profitLoss";
type SortDirection = "asc" | "desc";

const providerIcons: Record<FinancialProvider, React.ElementType> = {
  plaid: Landmark,
  snaptrade: Briefcase,
  vezgo: Bitcoin,
  manual: PenLine,
};

const providerColors: Record<FinancialProvider, string> = {
  plaid: "bg-green-500/10 text-green-600 border-green-500/20",
  snaptrade: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  vezgo: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  manual: "bg-purple-500/10 text-purple-600 border-purple-500/20",
};

const providerLabels: Record<FinancialProvider, string> = {
  plaid: "Banking",
  snaptrade: "Broker",
  vezgo: "Crypto",
  manual: "Manual",
};

const providerRoutes: Record<FinancialProvider, string> = {
  plaid: "/banking",
  snaptrade: "/brokers",
  vezgo: "/crypto",
  manual: "/commodities",
};

// Format large numbers
function formatNumber(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return (value / 1000000).toFixed(2) + "M";
  }
  if (Math.abs(value) >= 1000) {
    return (value / 1000).toFixed(2) + "K";
  }
  if (Math.abs(value) < 0.01 && value !== 0) {
    return value.toExponential(2);
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

// Format quantity with appropriate precision
function formatQuantity(value: number | undefined | null): string {
  // If quantity is undefined, null, or 0, show dash
  if (value === undefined || value === null || value === 0) return "—";

  if (value >= 1000000) {
    return (value / 1000000).toFixed(2) + "M";
  }
  if (value >= 1000) {
    return (value / 1000).toFixed(2) + "K";
  }
  if (value < 0.000001) {
    return value.toExponential(2);
  }
  if (value < 1) {
    return value.toFixed(6);
  }
  // For whole numbers, show without decimals
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2);
}

export function UnifiedPositionsTable({
  className,
  currency = "eur",
  showFilters = true,
  maxRows,
  compact = false,
}: UnifiedPositionsTableProps) {
  const { positions: rawPositions, isLoading } = useUnifiedPositions();
  // Fetch metal prices for commodities valuation
  const { data: metalPrices } = useAllMetalPrices();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Enrich positions with calculated market values for commodities
  const positions = useMemo(() => {
    // 1 troy ounce = 31.1035 grams
    const TROY_OUNCE_TO_GRAMS = 31.1035;

    const enriched = (rawPositions as UnifiedPositionData[]).map((p) => {
      // For commodities (metals), calculate market value from spot prices
      if (
        p.provider === "manual" &&
        p.category === "commodities" &&
        metalPrices
      ) {
        const metadata = p.metadata as Record<string, unknown> | undefined;
        const metalType = metadata?.metalType as string | undefined;
        const fineWeightGrams = metadata?.fineWeightGrams as number | undefined;

        if (metalType && fineWeightGrams) {
          // Get spot price per ounce for this metal and convert to per gram
          const currencyKey = currency.toLowerCase() as "eur" | "usd" | "chf";
          let spotPricePerOunce = 0;

          switch (metalType) {
            case "gold":
              spotPricePerOunce = metalPrices.gold?.[currencyKey] ?? 0;
              break;
            case "silver":
              spotPricePerOunce = metalPrices.silver?.[currencyKey] ?? 0;
              break;
            case "platinum":
              spotPricePerOunce = metalPrices.platinum?.[currencyKey] ?? 0;
              break;
            case "palladium":
              spotPricePerOunce = metalPrices.palladium?.[currencyKey] ?? 0;
              break;
          }

          // Convert price per ounce to price per gram
          const spotPricePerGram = spotPricePerOunce / TROY_OUNCE_TO_GRAMS;

          // Calculate total value: fine weight * quantity * spot price per gram
          const marketValue = fineWeightGrams * p.quantity * spotPricePerGram;

          return {
            ...p,
            marketValue,
            currentPrice: spotPricePerGram,
            valueInBaseCurrency: marketValue,
          };
        }
      }
      return p;
    });
    return enriched;
  }, [rawPositions, metalPrices, currency]);

  // Get unique categories from positions
  const categories = useMemo(() => {
    const uniqueCategories = new Set(positions.map((p) => p.category));
    return Array.from(uniqueCategories).sort() as string[];
  }, [positions]);

  // Filter and sort positions
  const filteredPositions = useMemo(() => {
    let result = [...positions];

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.symbol.toLowerCase().includes(searchLower) ||
          p.provider.toLowerCase().includes(searchLower) ||
          p.category.toLowerCase().includes(searchLower),
      );
    }

    // Apply provider filter
    if (providerFilter !== "all") {
      result = result.filter((p) => p.provider === providerFilter);
    }

    // Apply category filter
    if (categoryFilter !== "all") {
      result = result.filter((p) => p.category === categoryFilter);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "value":
          comparison = Math.abs(a.marketValue) - Math.abs(b.marketValue);
          break;
        case "quantity":
          comparison = a.quantity - b.quantity;
          break;
        case "profitLoss":
          comparison = (a.unrealizedPL ?? 0) - (b.unrealizedPL ?? 0);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    // Apply max rows
    if (maxRows) {
      result = result.slice(0, maxRows);
    }

    return result;
  }, [
    positions,
    search,
    providerFilter,
    categoryFilter,
    sortField,
    sortDirection,
    maxRows,
  ]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className={cn(compact && "pb-2")}>
          <CardTitle className={cn("text-lg", compact && "text-base")}>
            All Positions
          </CardTitle>
          {!compact && (
            <CardDescription>
              Unified view across all financial providers
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (positions.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className={cn(compact && "pb-2")}>
          <CardTitle className={cn("text-lg", compact && "text-base")}>
            All Positions
          </CardTitle>
          {!compact && (
            <CardDescription>
              Unified view across all financial providers
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Filter className="h-12 w-12 mb-2 opacity-50" />
            <p>No positions found</p>
            <p className="text-sm">
              Connect your accounts to see your holdings
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className={cn(compact && "pb-2")}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className={cn("text-lg", compact && "text-base")}>
              All Positions
            </CardTitle>
            {!compact && (
              <CardDescription>
                {filteredPositions.length} of {positions.length} positions
              </CardDescription>
            )}
          </div>
          {maxRows && positions.length > maxRows && (
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/positions">
                View All
                <ExternalLink className="ml-2 h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        {showFilters && (
          <div
            className={cn(
              "flex gap-2 mb-4",
              compact ? "flex-col" : "flex-wrap",
            )}
          >
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search positions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn("pl-9", compact && "h-8 text-sm")}
              />
            </div>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className={cn("w-[130px]", compact && "h-8")}>
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                <SelectItem value="plaid">Banking</SelectItem>
                <SelectItem value="snaptrade">Brokers</SelectItem>
                <SelectItem value="vezgo">Crypto</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className={cn("w-[130px]", compact && "h-8")}>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Table */}
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">Source</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 font-medium -ml-3"
                    onClick={() => toggleSort("name")}
                  >
                    Position
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                {!compact && <TableHead>Category</TableHead>}
                <TableHead className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 font-medium -mr-3 float-right"
                    onClick={() => toggleSort("quantity")}
                  >
                    Quantity
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 font-medium -mr-3 float-right"
                    onClick={() => toggleSort("value")}
                  >
                    Value
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                {!compact && (
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 font-medium -mr-3 float-right"
                      onClick={() => toggleSort("profitLoss")}
                    >
                      P&L
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPositions.map((position) => {
                const Icon = providerIcons[position.provider];
                const hasPL =
                  position.unrealizedPL !== undefined &&
                  position.unrealizedPL !== 0;
                const isPositive = (position.unrealizedPL ?? 0) > 0;
                const isNegativeValue = position.marketValue < 0;

                return (
                  <TableRow key={`${position.provider}-${position.id}`}>
                    {/* Provider Badge */}
                    <TableCell>
                      <Link href={providerRoutes[position.provider]}>
                        <Badge
                          variant="outline"
                          className={cn(
                            "flex items-center justify-center w-8 h-8 p-0",
                            providerColors[position.provider],
                          )}
                          title={providerLabels[position.provider]}
                        >
                          <Icon className="h-4 w-4" />
                        </Badge>
                      </Link>
                    </TableCell>

                    {/* Position Name */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span
                          className={cn(
                            "font-medium",
                            compact ? "text-sm" : "",
                          )}
                        >
                          {position.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {position.symbol}
                          {position.metadata?.institutionName && (
                            <> • {position.metadata.institutionName}</>
                          )}
                          {position.metadata?.brokerName && (
                            <> • {position.metadata.brokerName}</>
                          )}
                          {position.metadata?.providerName && (
                            <> • {position.metadata.providerName}</>
                          )}
                        </span>
                      </div>
                    </TableCell>

                    {/* Category */}
                    {!compact && (
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {position.category}
                        </Badge>
                        {position.subcategory &&
                          position.subcategory !== position.category && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {position.subcategory}
                            </span>
                          )}
                      </TableCell>
                    )}

                    {/* Quantity - hide for bank accounts and loans where quantity doesn't make sense */}
                    <TableCell className="text-right font-mono text-sm">
                      {(position.provider === "plaid" &&
                        position.category === "cash") ||
                      position.category === "liabilities"
                        ? "—"
                        : formatQuantity(position.quantity)}
                    </TableCell>

                    {/* Value */}
                    <TableCell
                      className={cn(
                        "text-right font-medium",
                        isNegativeValue && "text-red-500",
                      )}
                    >
                      {formatCurrency(
                        position.valueInBaseCurrency ?? position.marketValue,
                        currency,
                      )}
                      {position.currency !== currency.toUpperCase() && (
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(
                            position.marketValue,
                            position.currency.toLowerCase() as InvestmentCurrency,
                          )}
                        </div>
                      )}
                    </TableCell>

                    {/* P&L */}
                    {!compact && (
                      <TableCell className="text-right">
                        {hasPL ? (
                          <div
                            className={cn(
                              "flex items-center justify-end gap-1",
                              isPositive ? "text-green-500" : "text-red-500",
                            )}
                          >
                            {isPositive ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            <span className="font-medium">
                              {isPositive ? "+" : ""}
                              {formatCurrency(position.unrealizedPL!, currency)}
                            </span>
                            {position.unrealizedPLPercent !== undefined && (
                              <span className="text-xs">
                                ({isPositive ? "+" : ""}
                                {position.unrealizedPLPercent.toFixed(2)}%)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Summary */}
        {!compact && filteredPositions.length > 0 && (
          <div className="flex justify-between items-center mt-4 pt-4 border-t text-sm">
            <span className="text-muted-foreground">
              {filteredPositions.length} position
              {filteredPositions.length !== 1 ? "s" : ""} shown
            </span>
            <span className="font-medium">
              Total:{" "}
              {formatCurrency(
                filteredPositions.reduce(
                  (sum, p) => sum + (p.valueInBaseCurrency ?? p.marketValue),
                  0,
                ),
                currency,
              )}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
