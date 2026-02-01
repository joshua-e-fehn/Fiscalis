"use client";

/**
 * CryptoLargestHoldingsCard Component
 *
 * Displays the largest cryptocurrency holdings grouped by category,
 * similar to how cash & money markets shows holdings by account type.
 * Categories: Bitcoin & Ethereum, Altcoins, Stablecoins, DeFi
 */

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { useVezgoPositions } from "@/hooks/convex/crypto";
import { PiggyBank } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, currencySymbols } from "@/lib/types/investments";
import { useMemo } from "react";

interface CryptoLargestHoldingsCardProps {
  className?: string;
  maxHoldingsPerCategory?: number;
}

interface HoldingSummary {
  symbol: string;
  name: string;
  balance: number;
  fiatValue: number;
}

interface CategoryData {
  id: string;
  name: string;
  color: string;
  holdings: HoldingSummary[];
  totalValue: number;
  holdingsCount: number;
}

// Define which symbols belong to which category
const BTC_ETH_SYMBOLS = new Set([
  "BTC",
  "WBTC",
  "BTCB",
  "TBTC",
  "RENBTC",
  "SBTC",
  "HBTC",
  "ETH",
  "WETH",
  "STETH",
  "RETH",
  "CBETH",
  "BETH",
  "SETH2",
  "METH",
]);

const STABLECOIN_SYMBOLS = new Set([
  "USDT",
  "USDC",
  "DAI",
  "BUSD",
  "TUSD",
  "USDP",
  "GUSD",
  "FRAX",
  "LUSD",
  "USDD",
  "PYUSD",
  "EURC",
  "EURT",
  "EURS",
  "AGEUR",
  "FDUSD",
  "CUSD",
  "UST",
  "MIM",
  "DOLA",
  "CRVUSD",
  "GHO",
]);

// Category colors
const CATEGORY_COLORS = {
  "btc-eth": "#F7931A", // Bitcoin orange
  altcoins: "#8B5CF6", // Purple
  stablecoins: "#22C55E", // Green
  defi: "#3B82F6", // Blue
};

function categorizeToken(symbol: string, category?: string): string {
  const upperSymbol = symbol.toUpperCase();

  // Check if it's BTC or ETH related
  if (BTC_ETH_SYMBOLS.has(upperSymbol)) {
    return "btc-eth";
  }

  // Check if it's a stablecoin
  if (STABLECOIN_SYMBOLS.has(upperSymbol) || category === "stablecoin") {
    return "stablecoins";
  }

  // Check if it's DeFi (based on category from Vezgo)
  if (category === "defi") {
    return "defi";
  }

  // Everything else is an altcoin
  return "altcoins";
}

export function CryptoLargestHoldingsCard({
  className,
  maxHoldingsPerCategory = 3,
}: CryptoLargestHoldingsCardProps) {
  const positions = useVezgoPositions();

  // Calculate holdings breakdown by category
  const categories = useMemo<CategoryData[]>(() => {
    if (!positions || positions.length === 0) {
      return [];
    }

    // Group positions by symbol first, then by category
    const tokenMap = new Map<string, HoldingSummary & { category: string }>();

    positions.forEach((position) => {
      const symbol = position.symbol.toUpperCase();
      const existing = tokenMap.get(symbol);
      const fiatValue = position.fiatValue ?? 0;
      const categoryId = categorizeToken(symbol, position.category);

      if (existing) {
        existing.balance += position.quantity;
        existing.fiatValue += fiatValue;
      } else {
        tokenMap.set(symbol, {
          symbol: symbol,
          name: position.name ?? symbol,
          balance: position.quantity,
          fiatValue: fiatValue,
          category: categoryId,
        });
      }
    });

    // Group by category
    const categoryMap: Record<string, HoldingSummary[]> = {
      "btc-eth": [],
      altcoins: [],
      stablecoins: [],
      defi: [],
    };

    tokenMap.forEach((token) => {
      categoryMap[token.category].push({
        symbol: token.symbol,
        name: token.name,
        balance: token.balance,
        fiatValue: token.fiatValue,
      });
    });

    // Sort holdings in each category by value
    Object.values(categoryMap).forEach((holdings) => {
      holdings.sort((a, b) => b.fiatValue - a.fiatValue);
    });

    // Build category data array
    const result: CategoryData[] = [
      {
        id: "btc-eth",
        name: "Bitcoin & Ethereum",
        color: CATEGORY_COLORS["btc-eth"],
        holdings: categoryMap["btc-eth"],
        totalValue: categoryMap["btc-eth"].reduce(
          (sum, h) => sum + h.fiatValue,
          0,
        ),
        holdingsCount: categoryMap["btc-eth"].length,
      },
      {
        id: "altcoins",
        name: "Altcoins",
        color: CATEGORY_COLORS["altcoins"],
        holdings: categoryMap["altcoins"],
        totalValue: categoryMap["altcoins"].reduce(
          (sum, h) => sum + h.fiatValue,
          0,
        ),
        holdingsCount: categoryMap["altcoins"].length,
      },
      {
        id: "stablecoins",
        name: "Stablecoins",
        color: CATEGORY_COLORS["stablecoins"],
        holdings: categoryMap["stablecoins"],
        totalValue: categoryMap["stablecoins"].reduce(
          (sum, h) => sum + h.fiatValue,
          0,
        ),
        holdingsCount: categoryMap["stablecoins"].length,
      },
      {
        id: "defi",
        name: "DeFi",
        color: CATEGORY_COLORS["defi"],
        holdings: categoryMap["defi"],
        totalValue: categoryMap["defi"].reduce(
          (sum, h) => sum + h.fiatValue,
          0,
        ),
        holdingsCount: categoryMap["defi"].length,
      },
    ];

    // Filter out empty categories
    return result.filter((cat) => cat.holdings.length > 0);
  }, [positions]);

  const isLoading = positions === undefined;

  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Largest Holdings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-6 w-full bg-muted animate-pulse rounded" />
                <div className="h-6 w-full bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (categories.length === 0) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Largest Holdings
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-32">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <PiggyBank className="h-6 w-6 text-muted-foreground" />
          </div>
          <span className="text-sm text-muted-foreground">No holdings yet</span>
        </CardContent>
      </Card>
    );
  }

  const formatValue = (value: number) =>
    new Intl.NumberFormat("de-CH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Largest Holdings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {categories.map((category) => (
          <div key={category.id}>
            {/* Category header */}
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <span className="text-sm font-medium">{category.name}</span>
              <span className="text-xs text-muted-foreground">
                ({category.holdingsCount} holding
                {category.holdingsCount !== 1 ? "s" : ""})
              </span>
            </div>

            {/* Holdings list */}
            <div className="space-y-1 pl-5">
              {category.holdings
                .slice(0, maxHoldingsPerCategory)
                .map((holding, index) => (
                  <div
                    key={holding.symbol}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-4">
                        {index + 1}.
                      </span>
                      <span>
                        <span className="font-medium">{holding.symbol}</span>
                        <span className="text-muted-foreground mx-1">•</span>
                        <span className="text-muted-foreground">
                          {holding.name}
                        </span>
                      </span>
                    </div>
                    <span className="font-medium">
                      {currencySymbols.eur}
                      {formatValue(holding.fiatValue)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
