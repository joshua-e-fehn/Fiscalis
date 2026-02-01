"use client";

/**
 * CryptoHoldingsCard Component
 *
 * Displays portfolio summary and holdings breakdown with
 * visual charts and token distribution.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  useVezgoPositions,
  useVezgoConnections,
  useVezgoTotalValue,
} from "@/hooks/convex/crypto";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Coins,
  PiggyBank,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/types/investments";
import { useMemo } from "react";

interface CryptoHoldingsCardProps {
  className?: string;
  showBreakdown?: boolean;
  maxTokens?: number;
}

interface TokenSummary {
  symbol: string;
  name: string;
  balance: number;
  fiatValue: number;
  percentage: number;
  logo?: string;
}

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

export function CryptoHoldingsCard({
  className,
  showBreakdown = true,
  maxTokens = 5,
}: CryptoHoldingsCardProps) {
  const positions = useVezgoPositions();
  const connections = useVezgoConnections();
  const totalValueData = useVezgoTotalValue();

  // Calculate token breakdown from positions
  const tokenBreakdown = useMemo(() => {
    if (!positions || positions.length === 0) return [];

    // Aggregate positions by symbol
    const tokenMap = new Map<string, TokenSummary>();

    positions.forEach((position) => {
      const existing = tokenMap.get(position.symbol);
      const fiatValue = position.fiatValue ?? 0;

      if (existing) {
        existing.balance += position.quantity;
        existing.fiatValue += fiatValue;
      } else {
        tokenMap.set(position.symbol, {
          symbol: position.symbol,
          name: position.name ?? position.symbol,
          balance: position.quantity,
          fiatValue: fiatValue,
          percentage: 0,
          logo: position.imageUrl,
        });
      }
    });

    // Calculate total and percentages
    const tokens = Array.from(tokenMap.values());
    const total = tokens.reduce((sum, t) => sum + t.fiatValue, 0);

    tokens.forEach((token) => {
      token.percentage = total > 0 ? (token.fiatValue / total) * 100 : 0;
    });

    // Sort by value and return top tokens
    return tokens.sort((a, b) => b.fiatValue - a.fiatValue).slice(0, maxTokens);
  }, [positions, maxTokens]);

  // Calculate summary stats
  const totalPositions = positions?.length ?? 0;
  const totalConnections = connections?.length ?? 0;
  const uniqueTokens = useMemo(() => {
    if (!positions) return 0;
    return new Set(positions.map((p) => p.symbol)).size;
  }, [positions]);

  const portfolioValue = totalValueData?.totalValue ?? 0;
  const isLoading = positions === undefined;

  return (
    <Card className={cn("h-fit", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Portfolio Value</CardTitle>
            <CardDescription>
              {totalPositions} position
              {totalPositions !== 1 ? "s" : ""} across {totalConnections}{" "}
              account
              {totalConnections !== 1 ? "s" : ""}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          // Loading state
          <div className="space-y-4">
            <div className="animate-pulse">
              <div className="h-8 w-32 bg-muted rounded mb-2" />
              <div className="h-4 w-24 bg-muted rounded" />
            </div>
            {showBreakdown && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 animate-pulse"
                  >
                    <div className="h-8 w-8 rounded-full bg-muted" />
                    <div className="flex-1 space-y-1">
                      <div className="h-4 w-20 bg-muted rounded" />
                      <div className="h-2 w-full bg-muted rounded" />
                    </div>
                    <div className="h-4 w-16 bg-muted rounded" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : portfolioValue === 0 ? (
          // Empty state
          <div className="text-center py-6 space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <PiggyBank className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No holdings yet</p>
              <p className="text-xs text-muted-foreground">
                Connect your accounts to see your portfolio value
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Total Value */}
            <div>
              <div className="text-3xl font-bold tracking-tight">
                {formatCurrency(portfolioValue, "usd")}
              </div>
            </div>

            {/* Token Breakdown */}
            {showBreakdown && tokenBreakdown.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Top Holdings</span>
                  <span className="text-xs text-muted-foreground">
                    {uniqueTokens} tokens
                  </span>
                </div>

                {tokenBreakdown.map((token) => (
                  <div key={token.symbol} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                          {token.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={token.logo}
                              alt={token.symbol}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Coins className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <span className="font-medium">{token.symbol}</span>
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            {formatNumber(token.balance)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-medium">
                          {formatCurrency(token.fiatValue, "usd")}
                        </span>
                        <span className="text-muted-foreground text-xs ml-1">
                          ({token.percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${token.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}

                {/* Show "Others" if there are more tokens */}
                {uniqueTokens > maxTokens && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <span>+{uniqueTokens - maxTokens} more tokens</span>
                    <span>
                      {formatCurrency(
                        portfolioValue -
                          tokenBreakdown.reduce(
                            (sum, t) => sum + t.fiatValue,
                            0,
                          ),
                        "usd",
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default CryptoHoldingsCard;
