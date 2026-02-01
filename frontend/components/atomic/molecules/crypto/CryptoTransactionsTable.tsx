"use client";

/**
 * CryptoTransactionsTable Component
 *
 * Displays crypto transactions in a sortable, filterable table
 * with details about each transaction including type, amount, fees, and dates.
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
import {
  useVezgoTransactions,
  useVezgoConnections,
  useSyncAllVezgoTransactions,
} from "@/hooks/convex/crypto";
import {
  Search,
  ArrowUpDown,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Repeat,
  Gift,
  Flame,
  CircleDollarSign,
  Coins,
  Calendar,
  ExternalLink,
  Loader2,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/types/investments";
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
  if (value < 0.01 && value > 0) {
    return value.toExponential(2);
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

// Helper function to format date
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Transaction type configuration
const transactionTypeConfig = {
  buy: {
    label: "Buy",
    icon: ArrowDownLeft,
    color: "bg-green-500/10 text-green-600 border-green-500/20",
  },
  sell: {
    label: "Sell",
    icon: ArrowUpRight,
    color: "bg-red-500/10 text-red-600 border-red-500/20",
  },
  transfer_in: {
    label: "Transfer In",
    icon: ArrowDownLeft,
    color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  },
  transfer_out: {
    label: "Transfer Out",
    icon: ArrowUpRight,
    color: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  },
  swap: {
    label: "Swap",
    icon: Repeat,
    color: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  },
  stake: {
    label: "Stake",
    icon: Coins,
    color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  },
  unstake: {
    label: "Unstake",
    icon: Coins,
    color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  },
  reward: {
    label: "Reward",
    icon: Gift,
    color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  airdrop: {
    label: "Airdrop",
    icon: Gift,
    color: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  },
  mint: {
    label: "Mint",
    icon: CircleDollarSign,
    color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  },
  burn: {
    label: "Burn",
    icon: Flame,
    color: "bg-red-700/10 text-red-700 border-red-700/20",
  },
  fee: {
    label: "Fee",
    icon: CircleDollarSign,
    color: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  },
  other: {
    label: "Other",
    icon: History,
    color: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  },
};

interface CryptoTransactionsTableProps {
  className?: string;
  filterByConnectionId?: Id<"vezgoConnections">;
  showFilters?: boolean;
  maxRows?: number;
  showSyncButton?: boolean;
}

type SortField = "date" | "symbol" | "quantity" | "fiatValue";
type SortDirection = "asc" | "desc";

export function CryptoTransactionsTable({
  className,
  filterByConnectionId,
  showFilters = true,
  maxRows,
  showSyncButton = true,
}: CryptoTransactionsTableProps) {
  const transactions = useVezgoTransactions(filterByConnectionId, maxRows);
  const connections = useVezgoConnections();
  const { syncAllTransactions, isLoading: isSyncing } =
    useSyncAllVezgoTransactions();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [connectionFilter, setConnectionFilter] = useState<string>("all");

  // Build connection lookup map
  const connectionMap = useMemo(() => {
    if (!connections) return new Map();
    return new Map(connections.map((c) => [c._id, c]));
  }, [connections]);

  // Filter and sort transactions
  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];

    let filtered = [...transactions];

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (tx) =>
          tx.symbol.toLowerCase().includes(searchLower) ||
          tx.txHash?.toLowerCase().includes(searchLower) ||
          tx.fromAddress?.toLowerCase().includes(searchLower) ||
          tx.toAddress?.toLowerCase().includes(searchLower),
      );
    }

    // Apply type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter((tx) => tx.type === typeFilter);
    }

    // Apply connection filter
    if (connectionFilter !== "all") {
      filtered = filtered.filter((tx) => tx.connectionId === connectionFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "date":
          comparison =
            new Date(a.transactionDate).getTime() -
            new Date(b.transactionDate).getTime();
          break;
        case "symbol":
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case "quantity":
          comparison = a.quantity - b.quantity;
          break;
        case "fiatValue":
          comparison = (a.fiatValue || 0) - (b.fiatValue || 0);
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return maxRows ? filtered.slice(0, maxRows) : filtered;
  }, [
    transactions,
    search,
    typeFilter,
    connectionFilter,
    sortField,
    sortDirection,
    maxRows,
  ]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleSyncTransactions = async () => {
    try {
      await syncAllTransactions();
    } catch (err) {
      console.error("Failed to sync transactions:", err);
    }
  };

  // Get unique transaction types for filter
  const availableTypes = useMemo(() => {
    if (!transactions) return [];
    const types = new Set(transactions.map((tx) => tx.type));
    return Array.from(types).sort();
  }, [transactions]);

  // Loading state
  if (transactions === undefined) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!transactions || transactions.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
          <CardDescription>
            Your crypto transaction history will appear here
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <History className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No transactions found</p>
            {showSyncButton && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleSyncTransactions}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sync Transactions
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Transaction History
            </CardTitle>
            <CardDescription>
              {filteredTransactions.length} transaction
              {filteredTransactions.length !== 1 ? "s" : ""}
              {search || typeFilter !== "all" || connectionFilter !== "all"
                ? " (filtered)"
                : ""}
            </CardDescription>
          </div>
          {showSyncButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncTransactions}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync
            </Button>
          )}
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by symbol, hash, or address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {availableTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {transactionTypeConfig[type]?.label || type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!filterByConnectionId && connections && connections.length > 1 && (
              <Select
                value={connectionFilter}
                onValueChange={setConnectionFilter}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Connection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Connections</SelectItem>
                  {connections.map((conn) => (
                    <SelectItem key={conn._id} value={conn._id}>
                      {conn.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => handleSort("date")}
                  >
                    Date
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => handleSort("symbol")}
                  >
                    Asset
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => handleSort("quantity")}
                  >
                    Amount
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => handleSort("fiatValue")}
                  >
                    Value
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((tx) => {
                const typeConfig =
                  transactionTypeConfig[tx.type] || transactionTypeConfig.other;
                const TypeIcon = typeConfig.icon;
                const connection = connectionMap.get(tx.connectionId);

                return (
                  <TableRow key={tx._id}>
                    {/* Date */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {formatDate(tx.transactionDate)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.transactionDate).toLocaleTimeString(
                              "en-US",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Type */}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("gap-1", typeConfig.color)}
                      >
                        <TypeIcon className="h-3 w-3" />
                        {typeConfig.label}
                      </Badge>
                    </TableCell>

                    {/* Asset */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                          <Coins className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="font-medium">{tx.symbol}</span>
                      </div>
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "font-medium",
                          tx.type === "buy" ||
                            tx.type === "transfer_in" ||
                            tx.type === "reward" ||
                            tx.type === "airdrop"
                            ? "text-green-600"
                            : tx.type === "sell" ||
                                tx.type === "transfer_out" ||
                                tx.type === "fee" ||
                                tx.type === "burn"
                              ? "text-red-600"
                              : "",
                        )}
                      >
                        {tx.type === "buy" ||
                        tx.type === "transfer_in" ||
                        tx.type === "reward" ||
                        tx.type === "airdrop"
                          ? "+"
                          : tx.type === "sell" ||
                              tx.type === "transfer_out" ||
                              tx.type === "fee" ||
                              tx.type === "burn"
                            ? "-"
                            : ""}
                        {formatNumber(tx.quantity)}
                      </span>
                      {tx.fee && (
                        <p className="text-xs text-muted-foreground">
                          Fee: {formatNumber(tx.fee)} {tx.feeCurrency || ""}
                        </p>
                      )}
                    </TableCell>

                    {/* Value */}
                    <TableCell className="text-right">
                      {tx.fiatValue ? (
                        <span className="font-medium">
                          {formatCurrency(tx.fiatValue, "usd")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    {/* Source */}
                    <TableCell>
                      {connection ? (
                        <span className="text-sm text-muted-foreground">
                          {connection.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    {/* Details */}
                    <TableCell className="text-right">
                      {tx.txHash ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            // Try to construct explorer URL based on chain
                            const chain = tx.chain?.toLowerCase();
                            let explorerUrl = "";
                            if (chain === "ethereum" || chain === "eth") {
                              explorerUrl = `https://etherscan.io/tx/${tx.txHash}`;
                            } else if (chain === "bitcoin" || chain === "btc") {
                              explorerUrl = `https://blockchair.com/bitcoin/transaction/${tx.txHash}`;
                            } else if (chain === "solana" || chain === "sol") {
                              explorerUrl = `https://solscan.io/tx/${tx.txHash}`;
                            } else if (
                              chain === "polygon" ||
                              chain === "matic"
                            ) {
                              explorerUrl = `https://polygonscan.com/tx/${tx.txHash}`;
                            } else if (chain === "bsc" || chain === "binance") {
                              explorerUrl = `https://bscscan.com/tx/${tx.txHash}`;
                            }
                            if (explorerUrl) {
                              window.open(explorerUrl, "_blank");
                            }
                          }}
                          title="View on explorer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
