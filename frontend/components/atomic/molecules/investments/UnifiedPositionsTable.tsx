"use client";

/**
 * UnifiedPositionsTable Component
 *
 * Displays all positions across all financial providers
 * (Plaid, SnapTrade, Bitpanda, manual entries) in a unified, sortable
 * table, or only one subcategory's (the generic subcategory page).
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
import {
  Search,
  ArrowUpDown,
  Landmark,
  Briefcase,
  Filter,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  PenLine,
  HandCoins,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { InvestmentCurrency } from "@/lib/types/investments";
import { formatCurrency } from "@/lib/utils/currency";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  isInvestmentCategory,
  subcategoryLabel,
  useCategoryLabels,
} from "@/lib/config/categoryUI";
import type { FinancialProvider } from "@/lib/types/portfolio";
import type { ClassificationTarget } from "@/lib/types/classification";
import {
  CategoryOverrideMenu,
  ManualCategoryBadge,
} from "@/components/atomic/molecules/classification";
import { ManualAssetRowMenu } from "@/components/atomic/molecules/manualAssets";
import { ValuationBadge } from "@/components/atomic/molecules/valuation";
import { valuationHoldingRef } from "@/hooks/convex/valuationOverrides";
import type { PositionValuation } from "@/convex/portfolio";
import type { Id } from "@/convex/_generated/dataModel";
import type { HoldingSource } from "@/../services/portfolio/aggregate";

interface UnifiedPositionsTableProps {
  className?: string;
  showFilters?: boolean;
  maxRows?: number;
  compact?: boolean;
  /** Only the positions of this category (and subcategory, when given) */
  category?: string;
  subcategory?: string;
  /** The empty state's hint, in place of the default (connect a provider) */
  emptyHint?: string;
}

// Position type returned from useUnifiedPositions
interface UnifiedPositionData {
  id: string;
  _id: string;
  provider: FinancialProvider;
  source: HoldingSource;
  category: string;
  subcategory?: string;
  symbol: string;
  name: string;
  quantity: number;
  currentPrice?: number;
  /** Native amount (signed) */
  marketValue: number;
  currency: string;
  /** Value in the display currency (signed: a liability is negative) */
  valueInBaseCurrency: number;
  /** Cost basis in the display currency */
  costBasis?: number;
  unrealizedPL?: number;
  unrealizedPLPercent?: number;
  /** Cost (and P/L) at today's exchange rate: the trade dates are unknown */
  costFxEstimated?: boolean;
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
  /** Set when the category can be changed (bank, broker, Bitpanda) */
  classification?: { target: ClassificationTarget; isManual: boolean };
  /** How a broker or Bitpanda price is known, and the user's override */
  valuation?: PositionValuation;
  /** Whose position it is, in a team workspace (convex/teamViews.ts) */
  owner?: { displayName: string | null; isMe: boolean } | null;
}

type SortField = "name" | "value" | "quantity" | "profitLoss";
type SortDirection = "asc" | "desc";

/** The row menu's price items, for a holding that can take an override. */
function valuationMenuItem(position: UnifiedPositionData) {
  const holding = valuationHoldingRef(position.source, position._id);
  if (!holding || !position.valuation?.canOverride) return undefined;
  return {
    holding,
    quantity: position.quantity,
    providerPrice: position.currentPrice,
    providerCurrency: position.currency,
    override: position.valuation.override,
  };
}

const providerIcons: Record<FinancialProvider, React.ElementType> = {
  plaid: Landmark,
  snaptrade: Briefcase,
  bitpanda: HandCoins,
  manual: PenLine,
};

const providerColors: Record<FinancialProvider, string> = {
  plaid: "bg-green-500/10 text-green-600 border-green-500/20",
  snaptrade: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  bitpanda: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  manual: "bg-purple-500/10 text-purple-600 border-purple-500/20",
};

/** The providers, in filter order */
const PROVIDERS = Object.keys(providerIcons) as FinancialProvider[];

/** Whether a stored provider is still known (legacy data may not be) */
function isProvider(value: string): value is FinancialProvider {
  return Object.hasOwn(providerIcons, value);
}

const providerRoutes: Record<FinancialProvider, string> = {
  plaid: "/integrations/banking",
  snaptrade: "/integrations/brokers",
  bitpanda: "/integrations/brokers",
  manual: "/assets/commodities/metals",
};

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
  showFilters = true,
  maxRows,
  compact = false,
  category: onlyCategory,
  subcategory: onlySubcategory,
  emptyHint,
}: UnifiedPositionsTableProps) {
  // Values and P/L in the display currency (`currency`); each position's
  // native amount in its own
  const {
    positions: rawPositions,
    currency,
    isLoading,
  } = useUnifiedPositions();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);
  const t = useTranslations("dashboard.positions");
  const tTeams = useTranslations("teams");
  const labels = useCategoryLabels();

  /** A stored subcategory slug's name; an unknown slug as stored */
  const subcategoryName = (category: string, slug: string) => {
    const label = isInvestmentCategory(category)
      ? subcategoryLabel(category, slug)
      : null;
    return label ? labels.name(label) : slug;
  };

  // Valued on the server (vault metals at spot included), with the
  // classified category and P/L (convex/portfolio.ts)
  const positions = useMemo(
    () =>
      (rawPositions as UnifiedPositionData[]).filter(
        (p) =>
          (!onlyCategory || p.category === onlyCategory) &&
          (!onlySubcategory || p.subcategory === onlySubcategory),
      ),
    [rawPositions, onlyCategory, onlySubcategory],
  );

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
          comparison =
            Math.abs(a.valueInBaseCurrency) - Math.abs(b.valueInBaseCurrency);
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
    if (maxRows && !showAll) {
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
    showAll,
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
            {t("title")}
          </CardTitle>
          {!compact && (
            <CardDescription>{t("description")}</CardDescription>
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
            {t("title")}
          </CardTitle>
          {!compact && (
            <CardDescription>{t("description")}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Filter className="h-12 w-12 mb-2 opacity-50" />
            <p>{t("empty")}</p>
            <p className="text-sm">{emptyHint ?? t("emptyHint")}</p>
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
              {t("title")}
            </CardTitle>
            {!compact && (
              <CardDescription>
                {t("shownOfTotal", {
                  shown: filteredPositions.length,
                  total: positions.length,
                })}
              </CardDescription>
            )}
          </div>
          {maxRows && positions.length > maxRows && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAll((prev) => !prev)}
            >
              {showAll ? t("showLess") : t("viewAll")}
              {showAll ? (
                <ChevronUp className="ms-2 h-3 w-3" />
              ) : (
                <ChevronDown className="ms-2 h-3 w-3" />
              )}
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
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn("ps-9", compact && "h-8 text-sm")}
              />
            </div>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className={cn("w-[130px]", compact && "h-8")}>
                <SelectValue placeholder={t("provider")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allProviders")}</SelectItem>
                {PROVIDERS.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {t(`providerFilter.${provider}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className={cn("w-[130px]", compact && "h-8")}>
                <SelectValue placeholder={t("category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allCategories")}</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {labels.categoryNameOf(cat)}
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
                <TableHead className="w-[40px]">
                  {t("columns.source")}
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 font-medium -ms-3"
                    onClick={() => toggleSort("name")}
                  >
                    {t("columns.position")}
                    <ArrowUpDown className="ms-2 h-4 w-4" />
                  </Button>
                </TableHead>
                {!compact && <TableHead>{t("columns.category")}</TableHead>}
                <TableHead className="text-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 font-medium -me-3 float-end"
                    onClick={() => toggleSort("quantity")}
                  >
                    {t("columns.quantity")}
                    <ArrowUpDown className="ms-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="text-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 font-medium -me-3 float-end"
                    onClick={() => toggleSort("value")}
                  >
                    {t("columns.value")}
                    <ArrowUpDown className="ms-2 h-4 w-4" />
                  </Button>
                </TableHead>
                {!compact && (
                  <TableHead className="text-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 font-medium -me-3 float-end"
                      onClick={() => toggleSort("profitLoss")}
                    >
                      {t("columns.profitLoss")}
                      <ArrowUpDown className="ms-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                )}
                <TableHead className="w-[40px]">
                  <span className="sr-only">{t("columns.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPositions.map((position) => {
                // Defensive lookups: an unrecognized provider must never crash
                // the row (e.g. legacy data from a removed provider).
                const Icon = providerIcons[position.provider] ?? PenLine;
                // Manual entries: vault metals, loans and manual assets
                const providerRoute =
                  position.source === "loan"
                    ? `/liabilities/loans/${position.id}`
                    : position.source === "manualAsset"
                      ? `/assets/${position.category}/${position.subcategory}`
                      : (providerRoutes[position.provider] ?? "/dashboard");
                const providerColor = providerColors[position.provider] ?? "";
                const providerLabel = isProvider(position.provider)
                  ? t(`providers.${position.provider}`)
                  : position.provider;
                const hasPL =
                  position.unrealizedPL !== undefined &&
                  position.unrealizedPL !== 0;
                const isPositive = (position.unrealizedPL ?? 0) > 0;
                const isNegativeValue = position.valueInBaseCurrency < 0;

                return (
                  <TableRow key={`${position.provider}-${position.id}`}>
                    {/* Provider Badge */}
                    <TableCell>
                      <Link href={providerRoute}>
                        <Badge
                          variant="outline"
                          className={cn(
                            "flex items-center justify-center w-8 h-8 p-0",
                            providerColor,
                          )}
                          title={providerLabel}
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
                          {compact && position.classification?.isManual && (
                            <ManualCategoryBadge className="ms-1" />
                          )}
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
                        {position.owner && (
                          <span
                            className="flex items-center gap-1 text-xs text-muted-foreground"
                            title={tTeams("workspace.owner")}
                          >
                            <UserRound className="h-3 w-3" aria-label={tTeams("workspace.owner")} />
                            {position.owner.isMe
                              ? tTeams("team.you")
                              : (position.owner.displayName ?? tTeams("team.unnamed"))}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Category */}
                    {!compact && (
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {labels.categoryNameOf(position.category)}
                        </Badge>
                        {position.subcategory &&
                          position.subcategory !== position.category && (
                            <span className="ms-1 text-xs text-muted-foreground">
                              {subcategoryName(
                                position.category,
                                position.subcategory,
                              )}
                            </span>
                          )}
                        {position.classification?.isManual && (
                          <ManualCategoryBadge className="ms-1" />
                        )}
                      </TableCell>
                    )}

                    {/* Quantity - hide for bank accounts and loans where quantity doesn't make sense */}
                    <TableCell className="text-end font-mono text-sm">
                      {(position.provider === "plaid" &&
                        position.category === "cash") ||
                      position.category === "liabilities"
                        ? "—"
                        : formatQuantity(position.quantity)}
                    </TableCell>

                    {/* Value */}
                    <TableCell
                      className={cn(
                        "text-end font-medium",
                        isNegativeValue && "text-red-500",
                      )}
                    >
                      {formatCurrency(position.valueInBaseCurrency, currency)}
                      {position.valuation && (
                        <ValuationBadge
                          kind={position.valuation.kind}
                          className="ms-1"
                        />
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
                      <TableCell className="text-end">
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
                            {position.costFxEstimated && (
                              <span
                                className="text-xs text-muted-foreground"
                                title={t("costFxEstimatedHint")}
                              >
                                {t("costFxEstimated")}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}

                    {/* Change category; edit or delete a manual asset */}
                    <TableCell className="p-1">
                      {position.source === "manualAsset" && (
                        <ManualAssetRowMenu
                          assetId={position._id as Id<"manualAssets">}
                          name={position.name}
                        />
                      )}
                      {position.classification && (
                        <CategoryOverrideMenu
                          item={{
                            target: position.classification.target,
                            id: position._id,
                          }}
                          name={position.name}
                          category={position.category}
                          subcategory={position.subcategory}
                          isManual={position.classification.isManual}
                          valuation={valuationMenuItem(position)}
                        />
                      )}
                    </TableCell>
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
              {t("shown", { count: filteredPositions.length })}
            </span>
            <span className="font-medium">
              {t("total", {
                amount: formatCurrency(
                  filteredPositions.reduce(
                    (sum, p) => sum + p.valueInBaseCurrency,
                    0,
                  ),
                  currency,
                ),
              })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
