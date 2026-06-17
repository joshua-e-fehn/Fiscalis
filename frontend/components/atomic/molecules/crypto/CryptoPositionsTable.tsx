"use client";

/**
 * CryptoPositionsTable Component
 *
 * Displays all crypto positions (aggregated across providers) in a sortable,
 * filterable table.
 */

import { useState, useMemo } from "react";
import { Search, ArrowUpDown, Coins } from "lucide-react";
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
import { useCryptoPositions } from "@/hooks/convex/crypto";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { subcategoryDisplayNames } from "@/lib/types/classification";
import type { InvestmentSubcategory } from "@/lib/types/classification";

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
  if (value > 0 && value < 0.01) return value.toExponential(2);
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function posValue(p: {
  valueInBaseCurrency?: number;
  marketValue?: number;
}): number {
  return p.valueInBaseCurrency ?? p.marketValue ?? 0;
}

interface CryptoPositionsTableProps {
  className?: string;
  showFilters?: boolean;
  maxRows?: number;
}

type SortField = "symbol" | "quantity" | "value";
type SortDirection = "asc" | "desc";

export function CryptoPositionsTable({
  className,
  showFilters = true,
  maxRows,
}: CryptoPositionsTableProps) {
  const positions = useCryptoPositions();
  const isLoading = positions.length === 0;
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
            ? posValue(a) - posValue(b)
            : posValue(b) - posValue(a);
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

  const SortButton = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => handleSort(field)}
    >
      {children}
      <ArrowUpDown
        className={cn("ml-2 h-3 w-3", sortField === field && "text-primary")}
      />
    </Button>
  );

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">All Positions</CardTitle>
            <CardDescription>
              {filteredPositions.length} of {positions.length} positions
            </CardDescription>
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by token..."
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
            <p className="text-sm text-muted-foreground">No positions found</p>
          </div>
        ) : filteredPositions.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Coins className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search ? "No positions match your search" : "No positions found"}
            </p>
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">
                    <SortButton field="symbol">Token</SortButton>
                  </TableHead>
                  <TableHead>
                    <SortButton field="quantity">Quantity</SortButton>
                  </TableHead>
                  <TableHead>
                    <SortButton field="value">Value</SortButton>
                  </TableHead>
                  <TableHead>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPositions.map((position) => (
                  <TableRow key={position._id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <Coins className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <span className="font-medium">{position.symbol}</span>
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
                      <span className="font-medium">
                        {formatCurrency(posValue(position), "eur")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {position.investmentSubcategory
                          ? (subcategoryDisplayNames[
                              position.investmentSubcategory as InvestmentSubcategory
                            ] ?? position.investmentSubcategory)
                          : "Crypto"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CryptoPositionsTable;
