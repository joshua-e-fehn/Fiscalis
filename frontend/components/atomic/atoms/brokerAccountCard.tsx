"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import { Badge } from "@/components/ui/shadcn/badge";
import { Wallet, TrendingUp, Briefcase, PiggyBank } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";

// Type for broker account from Convex
interface BrokerAccount {
  _id: Id<"brokerAccounts">;
  connectionId: Id<"brokerConnections">;
  name: string;
  accountNumber?: string;
  accountType?: string;
  balance?: number;
  cash?: number;
  currency: string;
}

interface BrokerAccountCardProps {
  account: BrokerAccount;
}

export function BrokerAccountCard({ account }: BrokerAccountCardProps) {
  const formatCurrency = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: account.currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Get icon based on account type
  const getAccountIcon = () => {
    const type = account.accountType?.toLowerCase() || "";
    if (
      type.includes("retirement") ||
      type.includes("ira") ||
      type.includes("401k") ||
      type.includes("rrsp")
    ) {
      return <PiggyBank className="h-4 w-4" />;
    }
    if (type.includes("margin") || type.includes("trading")) {
      return <TrendingUp className="h-4 w-4" />;
    }
    if (type.includes("business") || type.includes("corporate")) {
      return <Briefcase className="h-4 w-4" />;
    }
    return <Wallet className="h-4 w-4" />;
  };

  // Format account type for display
  const formatAccountType = (type?: string) => {
    if (!type) return "Investment";
    // Convert snake_case or UPPER_CASE to Title Case
    return type
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Mask account number for privacy
  const maskedAccountNumber = account.accountNumber
    ? `••••${account.accountNumber.slice(-4)}`
    : null;

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            {getAccountIcon()}
            {account.name}
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {formatAccountType(account.accountType)}
          </Badge>
        </div>
        {maskedAccountNumber && (
          <CardDescription className="text-xs">
            Account {maskedAccountNumber}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Total Value */}
          <div>
            <div className="text-2xl font-bold">
              {formatCurrency(account.balance)}
            </div>
            <p className="text-xs text-muted-foreground">Total Value</p>
          </div>

          {/* Cash Balance */}
          {account.cash !== undefined && account.cash !== null && (
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm text-muted-foreground">Cash</span>
              <span className="text-sm font-medium">
                {formatCurrency(account.cash)}
              </span>
            </div>
          )}

          {/* Invested (Total - Cash) */}
          {account.balance !== undefined && account.cash !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Invested</span>
              <span className="text-sm font-medium">
                {formatCurrency((account.balance || 0) - (account.cash || 0))}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
