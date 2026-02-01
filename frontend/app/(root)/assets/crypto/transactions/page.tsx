"use client";

/**
 * Crypto Assets Transactions Page
 *
 * Complete transaction history across all connected crypto accounts.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import {
  useVezgoTransactions,
  useVezgoConnections,
} from "@/hooks/convex/crypto";
import {
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  ArrowRight,
  History,
} from "lucide-react";
import Link from "next/link";

// Simple time ago function
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function CryptoAssetsTransactionsPage() {
  const transactions = useVezgoTransactions(undefined, 100);
  const connections = useVezgoConnections();
  const hasConnections = connections && connections.length > 0;

  // Format currency
  const formatValue = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Get transaction icon
  const getTransactionIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case "buy":
      case "deposit":
      case "receive":
        return <ArrowDownLeft className="h-4 w-4 text-green-500" />;
      case "sell":
      case "withdraw":
      case "send":
        return <ArrowUpRight className="h-4 w-4 text-red-500" />;
      default:
        return <RefreshCw className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (!hasConnections) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Transaction History
            </CardTitle>
            <CardDescription>
              Connect your crypto accounts to view your transaction history
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <p className="mb-4">
                No crypto accounts connected yet. Connect your exchanges and
                wallets to see your transaction history.
              </p>
              <Button variant="outline" asChild>
                <Link href="/integrations/crypto">
                  Connect Crypto
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
          <CardDescription>
            All transactions across your connected crypto accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions && transactions.length > 0 ? (
            <div className="space-y-4">
              {transactions.map((tx, index) => (
                <div
                  key={tx._id || index}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-muted">
                      {getTransactionIcon(tx.type)}
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        <span className="capitalize">{tx.type}</span>
                        <span className="text-muted-foreground">
                          {tx.symbol}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {tx._creationTime
                          ? formatTimeAgo(tx._creationTime)
                          : "Unknown date"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {tx.quantity?.toFixed(6)} {tx.symbol}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatValue(tx.fiatValue)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>
                No transactions found. Your transaction history will appear here
                once synced.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
