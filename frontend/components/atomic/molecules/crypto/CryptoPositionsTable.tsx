"use client";

/**
 * CryptoPositionsTable Component
 *
 * Displays all crypto positions (aggregated across providers) in a sortable,
 * filterable table.
 */

import { useState, useMemo } from "react";
import { Search, ArrowUpDown, Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
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
import { positionPriceIssue, useCryptoPositions } from "@/hooks/convex/crypto";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import {
  subcategoryLabel,
  useCategoryLabels,
} from "@/lib/config/categoryUI";

/** A position's crypto subcategory name; an unknown slug as stored */
function subcategoryName(
  labels: ReturnType<typeof useCategoryLabels>,
  slug: string | undefined,
): string {
  if (!slug) return labels.categoryName("crypto");
  const label = subcategoryLabel("crypto", slug);
  return label ? labels.name(label) : slug;
}

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
  if (value > 0 && value < 0.01) return value.toExponential(2);
  return value.toLocaleString("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

interface CryptoPositionsTableProps {
  className?: string;
  showFilters?: boolean;
  maxRows?: number;
}

type SortField = "symbol" | "quantity" | "value";
type SortDirection = "asc" | "desc";

function SortButton({
  field,
  activeField,
  onSort,
  children,
}: {
  field: SortField;
  activeField: SortField;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => onSort(field)}
    >
      {children}
      <ArrowUpDown
        className={cn("ml-2 h-3 w-3", activeField === field && "text-primary")}
      />
    </Button>
  );
}

export function CryptoPositionsTable({
  className,
  showFilters = true,
  maxRows,
}: CryptoPositionsTableProps) {
  // Position values come from the crypto data hook in the display
  // currency (converted there, never here)
  const loadedPositions = useCryptoPositions();
  const labels = useCategoryLabels();
  const t = useTranslations("assets.crypto.positions");
  const format = useFormatter();
  const isLoading = loadedPositions === undefined;
  const positions = useMemo(() => loadedPositions ?? [], [loadedPositions]);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const filteredPositions = useMemo(() => {
    let filtered = [...positions];

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.symbol.toLowerCase().includes(s) ||
          p.name?.toLowerCase().includes(s),
      );
    }

    filtered.sort((a, b) => {
      switch (sortField) {
        case "symbol":
          return sortDirection === "asc"
            ? a.symbol.localeCompare(b.symbol)
            : b.symbol.localeCompare(a.symbol);
        case "quantity":
          return sortDirection === "asc"
            ? a.quantity - b.quantity
            : b.quantity - a.quantity;
        case "value":
          return sortDirection === "asc"
            ? a.displayValue - b.displayValue
            : b.displayValue - a.displayValue;
        default:
          return 0;
      }
    });

    if (maxRows) filtered = filtered.slice(0, maxRows);
    return filtered;
  }, [positions, search, sortField, sortDirection, maxRows]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{t("title")}</CardTitle>
            <CardDescription>
              {t("count", {
                shown: filteredPositions.length,
                total: positions.length,
              })}
            </CardDescription>
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("search")}
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 space-y-2">
            <Coins className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          </div>
        ) : filteredPositions.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Coins className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search ? t("noMatch") : t("empty")}
            </p>
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">
                    <SortButton
                      field="symbol"
                      activeField={sortField}
                      onSort={handleSort}
                    >
                      {t("token")}
                    </SortButton>
                  </TableHead>
                  <TableHead>
                    <SortButton
                      field="quantity"
                      activeField={sortField}
                      onSort={handleSort}
                    >
                      {t("quantity")}
                    </SortButton>
                  </TableHead>
                  <TableHead>
                    <SortButton
                      field="value"
                      activeField={sortField}
                      onSort={handleSort}
                    >
                      {t("value")}
                    </SortButton>
                  </TableHead>
                  <TableHead>{t("category")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPositions.map((position) => {
                  const priceIssue = positionPriceIssue(position);
                  return (
                    <TableRow key={position._id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <Coins className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <span className="font-medium">
                              {position.symbol}
                            </span>
                            {position.name && (
                              <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                                {position.name}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {formatNumber(position.quantity)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-medium">
                            {priceIssue?.status === "missing"
                              ? "—"
                              : formatCurrency(position.displayValue, position.currency)}
                          </span>
                          {priceIssue?.status === "missing" && (
                            <Badge variant="outline" className="text-xs">
                              {t("priceUnavailable")}
                            </Badge>
                          )}
                          {priceIssue?.status === "stale" && (
                            <Badge
                              variant="outline"
                              className="text-xs"
                              title={t("staleHint")}
                            >
                              {priceIssue.asOf !== undefined
                                ? t("priceAsOf", {
                                    date: format.dateTime(
                                      priceIssue.asOf,
                                      "full",
                                    ),
                                  })
                                : t("lastKnownPrice")}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {subcategoryName(
                            labels,
                            position.investmentSubcategory,
                          )}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CryptoPositionsTable;
