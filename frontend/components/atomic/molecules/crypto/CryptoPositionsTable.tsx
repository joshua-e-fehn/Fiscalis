"use client";

/**
 * CryptoPositionsTable Component
 *
 * Displays all crypto positions in a sortable, filterable table
 * with detailed information about each holding.
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
import { useVezgoPositions, useVezgoConnections } from "@/hooks/convex/crypto";
import {
  Search,
  ArrowUpDown,
  Coins,
  Building2,
  Wallet,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { useState, useMemo } from "react";

import { Id } from "@/convex/_generated/dataModel";

// Helper function to format numbers
function formatNumber(value: number): string {
  if (value >= 1000000) {
    return (value / 1000000).toFixed(2) + "M";
  }
  if (value >= 1000) {
    return (value / 1000).toFixed(2) + "K";
  }
  if (value < 0.01) {
    return value.toExponential(2);
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

type ProviderCategory = "exchange" | "wallet" | "blockchain";

interface CryptoPositionsTableProps {
  className?: string;
  filterByConnectionId?: Id<"vezgoConnections">;
  filterByCategory?: ProviderCategory;
  showFilters?: boolean;
  maxRows?: number;
}

type SortField = "symbol" | "quantity" | "fiatValue";
type SortDirection = "asc" | "desc";

const categoryIcons = {
  exchange: Building2,
  wallet: Wallet,
};

export function CryptoPositionsTable({
  className,
  filterByConnectionId,
  filterByCategory,
  showFilters = true,
  maxRows,
}: CryptoPositionsTableProps) {
  const positions = useVezgoPositions(filterByConnectionId);
  const connections = useVezgoConnections();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("fiatValue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Create a map of connection IDs to connection details
  const connectionMap = useMemo(() => {
    if (!connections) return new Map();
    return new Map(connections.map((c) => [c._id, c]));
  }, [connections]);

  // Filter and sort positions
  const filteredPositions = useMemo(() => {
    if (!positions) return [];

    let filtered = [...positions];

    // Apply category filter (connection must include the category)
    if (filterByCategory || (categoryFilter && categoryFilter !== "all")) {
      const category = filterByCategory || categoryFilter;
      filtered = filtered.filter((p) => {
        const connection = connectionMap.get(p.connectionId);
        return connection?.categories?.includes(category);
      });
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.symbol.toLowerCase().includes(searchLower) ||
          p.name?.toLowerCase().includes(searchLower),
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortField) {
        case "symbol":
          return sortDirection === "asc"
            ? a.symbol.localeCompare(b.symbol)
            : b.symbol.localeCompare(a.symbol);
        case "quantity":
          aVal = a.quantity;
          bVal = b.quantity;
          break;
        case "fiatValue":
          aVal = a.fiatValue ?? 0;
          bVal = b.fiatValue ?? 0;
          break;
        default:
          return 0;
      }

      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });

    // Apply max rows limit
    if (maxRows) {
      filtered = filtered.slice(0, maxRows);
    }

    return filtered;
  }, [
    positions,
    filterByCategory,
    categoryFilter,
    search,
    sortField,
    sortDirection,
    maxRows,
    connectionMap,
  ]);

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
              {filteredPositions.length} of {positions?.length || 0} positions
            </CardDescription>
          </div>
        </div>

        {/* Filters */}
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
            {!filterByCategory && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="exchange">Exchanges</SelectItem>
                  <SelectItem value="wallet">Wallets</SelectItem>
                  <SelectItem value="blockchain">Blockchain</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!positions ? (
          // Loading state
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-lg animate-pulse"
              >
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-3 w-16 bg-muted rounded" />
                </div>
                <div className="h-4 w-20 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : filteredPositions.length === 0 ? (
          // Empty state
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
                    <SortButton field="fiatValue">Value</SortButton>
                  </TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPositions.map((position) => {
                  const connection = connectionMap.get(position.connectionId);
                  const categories = (connection?.categories || [
                    "wallet",
                  ]) as ProviderCategory[];
                  // Get the first category that has an icon
                  const primaryCategory = categories.find(
                    (c) => c in categoryIcons,
                  ) as keyof typeof categoryIcons | undefined;
                  const TypeIcon = primaryCategory
                    ? categoryIcons[primaryCategory]
                    : Coins;

                  return (
                    <TableRow key={position._id}>
                      {/* Token */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                            {position.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={position.imageUrl}
                                alt={position.symbol}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Coins className="h-4 w-4 text-muted-foreground" />
                            )}
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

                      {/* Quantity */}
                      <TableCell>
                        <span className="font-mono text-sm">
                          {formatNumber(position.quantity)}
                        </span>
                      </TableCell>

                      {/* Value */}
                      <TableCell>
                        <span className="font-medium">
                          {position.fiatValue
                            ? formatCurrency(position.fiatValue, "usd")
                            : "-"}
                        </span>
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {position.category}
                        </Badge>
                      </TableCell>

                      {/* Source */}
                      <TableCell>
                        {connection && (
                          <Badge variant="outline" className="gap-1">
                            <TypeIcon className="h-3 w-3" />
                            <span className="truncate max-w-[80px]">
                              {connection.name}
                            </span>
                          </Badge>
                        )}
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
