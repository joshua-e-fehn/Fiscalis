"use client";

/**
 * Crypto Hooks
 *
 * Hooks for Vezgo crypto integrations (exchanges, wallets, DeFi, NFTs)
 * and aggregated category summaries for the dashboard.
 */

import { useMemo, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  CategorySummary,
  SubcategoryData,
  PortfolioDataPoint,
} from "@/lib/types/investments";
import {
  cryptoSubcategoryUI,
  cryptoDisplayGroups,
  makeSubcategoryBase,
} from "@/lib/config/categoryUI";
import { createElement } from "react";

// ═══════════════════════════════════════════════════════════════
// VEZGO USER HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get Vezgo user registration status
 */
export function useVezgoUser() {
  return useQuery(api.crypto.getVezgoUser);
}

/**
 * Hook to register user with Vezgo
 * This must be called before connecting any crypto accounts
 */
export function useRegisterVezgo() {
  const registerAction = useAction(api.actions.vezgo.registerUser);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const register = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await registerAction({});
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [registerAction]);

  return { register, isLoading, error };
}

/**
 * Hook to delete Vezgo user and all connections
 */
export function useDeleteVezgoUser() {
  const deleteAction = useAction(api.actions.vezgo.deleteUser);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteUser = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await deleteAction({});
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [deleteAction]);

  return { deleteUser, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════
// CONNECTION HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get all crypto connections
 */
export function useVezgoConnections() {
  return useQuery(api.crypto.getConnections);
}

/**
 * Hook to get connections filtered by category
 * A connection can have multiple categories
 */
export function useVezgoConnectionsByCategory(
  category: "exchange" | "wallet" | "blockchain",
) {
  return useQuery(api.crypto.getConnectionsByCategory, { category });
}

/**
 * Hook to get a single connection
 */
export function useVezgoConnection(
  connectionId: Id<"vezgoConnections"> | undefined,
) {
  return useQuery(
    api.crypto.getConnection,
    connectionId ? { connectionId } : "skip",
  );
}

/**
 * Hook to get connections that need attention
 */
export function useVezgoConnectionsNeedingAttention() {
  return useQuery(api.crypto.getConnectionsNeedingAttention);
}

/**
 * Hook to create Vezgo Connect URL
 * This URL is used to open the Vezgo Connect popup
 */
export function useCreateVezgoConnectUrl() {
  const createUrlAction = useAction(api.actions.vezgo.getConnectUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);

  const createUrl = useCallback(
    async (params: {
      provider?: string;
      providers?: string[];
      redirectUri: string;
      origin: string;
    }) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await createUrlAction(params);
        setConnectUrl(result.connectUrl);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [createUrlAction],
  );

  const reset = useCallback(() => {
    setConnectUrl(null);
    setError(null);
  }, []);

  return { createUrl, connectUrl, isLoading, error, reset };
}

/**
 * Hook to handle Vezgo Connect callback
 * Called after successful account connection
 */
export function useHandleVezgoCallback() {
  const handleCallbackAction = useAction(api.actions.vezgo.handleCallback);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleCallback = useCallback(
    async (accountId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await handleCallbackAction({ accountId });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [handleCallbackAction],
  );

  return { handleCallback, isLoading, error };
}

/**
 * Hook to delete a crypto connection
 */
export function useDeleteVezgoConnection() {
  const deleteAction = useAction(api.actions.vezgo.deleteConnection);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteConnection = useCallback(
    async (connectionId: Id<"vezgoConnections">) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await deleteAction({ connectionId });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [deleteAction],
  );

  return { deleteConnection, isLoading, error };
}

/**
 * Combined hook for the full connect flow
 * Handles registration, URL creation, and popup management
 *
 * Note: Vezgo Connect (v1.0.0+) requires POST method with token in form data.
 * We open a popup with an about:blank page, then submit a form to it.
 */
export function useConnectCrypto() {
  const { register } = useRegisterVezgo();
  const { createUrl } = useCreateVezgoConnectUrl();
  const { handleCallback } = useHandleVezgoCallback();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connect = useCallback(
    async (options?: { provider?: string; providers?: string[] }) => {
      setIsLoading(true);
      setError(null);

      try {
        // Step 1: Ensure user is registered
        await register();

        // Step 2: Get connect URL and token
        const redirectUri = `${window.location.origin}/crypto/callback`;
        const origin = window.location.origin;
        const { connectUrl, connectToken } = await createUrl({
          ...options,
          redirectUri,
          origin,
        });

        // Step 3: Open popup first (must be in response to user action)
        const popupName = "vezgo-connect";
        const popup = window.open(
          "about:blank",
          popupName,
          "width=500,height=700,scrollbars=yes,resizable=yes",
        );

        if (!popup) {
          throw new Error(
            "Failed to open popup. Please allow popups for this site.",
          );
        }

        // Step 4: Create and submit form to the popup via POST
        // This is required by Vezgo Connect v1.0.0+
        const form = document.createElement("form");
        form.method = "POST";
        form.action = connectUrl;
        form.target = popupName;

        const tokenInput = document.createElement("input");
        tokenInput.type = "hidden";
        tokenInput.name = "token";
        tokenInput.value = connectToken;
        form.appendChild(tokenInput);

        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);

        // Step 5: Listen for callback message
        return new Promise<{ success: boolean; connectionId?: string }>(
          (resolve, reject) => {
            const handleMessage = async (event: MessageEvent) => {
              // Verify origin
              if (event.origin !== window.location.origin) return;

              if (event.data?.type === "vezgo-callback") {
                window.removeEventListener("message", handleMessage);
                popup?.close();

                try {
                  const result = await handleCallback(event.data.accountId);
                  setIsLoading(false);
                  resolve({
                    success: true,
                    connectionId: result.connectionId,
                  });
                } catch (err) {
                  setIsLoading(false);
                  const error =
                    err instanceof Error ? err : new Error(String(err));
                  setError(error);
                  reject(error);
                }
              } else if (event.data?.type === "vezgo-error") {
                window.removeEventListener("message", handleMessage);
                popup?.close();
                setIsLoading(false);
                const error = new Error(
                  event.data.error || "Connection failed",
                );
                setError(error);
                reject(error);
              }
            };

            window.addEventListener("message", handleMessage);

            // Check if popup was closed without completing
            const checkClosed = setInterval(() => {
              if (popup?.closed) {
                clearInterval(checkClosed);
                window.removeEventListener("message", handleMessage);
                setIsLoading(false);
                resolve({ success: false });
              }
            }, 500);

            // Cleanup after timeout (5 minutes)
            setTimeout(
              () => {
                clearInterval(checkClosed);
                window.removeEventListener("message", handleMessage);
                if (!popup?.closed) {
                  popup?.close();
                }
                setIsLoading(false);
                reject(new Error("Connection timeout"));
              },
              5 * 60 * 1000,
            );
          },
        );
      } catch (err) {
        setIsLoading(false);
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      }
    },
    [register, createUrl, handleCallback],
  );

  return { connect, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════
// POSITION HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get all crypto positions
 */
export function useVezgoPositions(connectionId?: Id<"vezgoConnections">) {
  return useQuery(api.crypto.getPositions, { connectionId });
}

/**
 * Hook to get positions filtered by category
 */
export function useVezgoPositionsByCategory(
  category: "cryptocurrency" | "token" | "stablecoin" | "defi" | "nft",
) {
  return useQuery(api.crypto.getPositionsByCategory, { category });
}

/**
 * Hook to get total crypto portfolio value
 */
export function useVezgoTotalValue() {
  return useQuery(api.crypto.getTotalValue);
}

// ═══════════════════════════════════════════════════════════════
// TRANSACTION HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get crypto transactions
 */
export function useVezgoTransactions(
  connectionId?: Id<"vezgoConnections">,
  limit?: number,
) {
  return useQuery(api.crypto.getTransactions, { connectionId, limit });
}

// ═══════════════════════════════════════════════════════════════
// SYNC HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to sync a single connection
 */
export function useSyncVezgoConnection() {
  const syncAction = useAction(api.actions.vezgo.syncConnection);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sync = useCallback(
    async (connectionId: Id<"vezgoConnections">) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await syncAction({ connectionId });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [syncAction],
  );

  return { sync, isLoading, error };
}

/**
 * Hook to sync all connections
 */
export function useSyncAllVezgoConnections() {
  const syncAction = useAction(api.actions.vezgo.syncAllConnections);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const syncAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await syncAction({});
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [syncAction]);

  return { syncAll, isLoading, error };
}

/**
 * Hook to sync transactions for a single connection
 */
export function useSyncVezgoTransactions() {
  const syncAction = useAction(api.actions.vezgo.syncTransactions);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const syncTransactions = useCallback(
    async (connectionId: Id<"vezgoConnections">) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await syncAction({ connectionId });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [syncAction],
  );

  return { syncTransactions, isLoading, error };
}

/**
 * Hook to sync all transactions for all connections
 */
export function useSyncAllVezgoTransactions() {
  const syncAction = useAction(api.actions.vezgo.syncAllTransactions);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const syncAllTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await syncAction({});
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [syncAction]);

  return { syncAllTransactions, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get available Vezgo providers
 */
export function useVezgoProviders() {
  const getProvidersAction = useAction(api.actions.vezgo.getProviders);
  const [providers, setProviders] = useState<
    Array<{
      name: string;
      displayName: string;
      type?: string;
      logo?: string;
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getProvidersAction({});
      setProviders(result.providers);
      return result.providers;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [getProvidersAction]);

  return { providers, fetchProviders, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY SUMMARY HOOK (for Dashboard)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// CRYPTO CATEGORIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Symbols that belong to Bitcoin & Ethereum category
 * Includes wrapped versions and liquid staking derivatives
 */
const BTC_ETH_SYMBOLS = new Set([
  // Bitcoin & wrapped versions
  "BTC",
  "WBTC",
  "BTCB",
  "TBTC",
  "RENBTC",
  "SBTC",
  "HBTC",
  // Ethereum & wrapped/staked versions
  "ETH",
  "WETH",
  "STETH",
  "RETH",
  "CBETH",
  "BETH",
  "SETH2",
  "METH",
]);

/**
 * Known stablecoin symbols
 * Used as fallback when Vezgo doesn't categorize as "stablecoin"
 */
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

/**
 * Categorize a crypto position based on Vezgo category and symbol
 *
 * Rules:
 * 1. If Vezgo category is "defi" → DeFi
 * 2. If Vezgo category is "stablecoin" OR symbol is a known stablecoin → Stablecoins
 * 3. If Vezgo category is "nft" → null (belongs to collectibles, ignore)
 * 4. For everything else, check if BTC/ETH symbol → else Altcoin
 */
function categorizeCryptoPosition(
  symbol: string,
  vezgoCategory?: string,
): "btc-eth" | "altcoins" | "stablecoins" | "defi" | null {
  const upperSymbol = symbol.toUpperCase();

  // NFTs don't belong to crypto page (they go to collectibles)
  if (vezgoCategory === "nft") {
    return null;
  }

  // DeFi positions stay as DeFi
  if (vezgoCategory === "defi") {
    return "defi";
  }

  // Stablecoins: check Vezgo category OR symbol
  if (vezgoCategory === "stablecoin" || STABLECOIN_SYMBOLS.has(upperSymbol)) {
    return "stablecoins";
  }

  // Check if it's BTC/ETH
  if (BTC_ETH_SYMBOLS.has(upperSymbol)) {
    return "btc-eth";
  }

  // Everything else is an altcoin
  return "altcoins";
}

// Helper to convert Vezgo positions to Holding type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPositionsToHoldings(
  positions: any[],
  subcategoryId: string,
  totalValue: number,
): import("@/lib/types/investments").Holding[] {
  return positions.slice(0, 5).map((p, idx) => ({
    id: p._id || `${subcategoryId}-${idx}`,
    name: p.name || p.symbol,
    subcategoryId,
    value: p.fiatValue || 0,
    costBasis: null,
    profitLoss: null,
    profitLossPercent: null,
    allocationPercent:
      totalValue > 0 ? ((p.fiatValue || 0) / totalValue) * 100 : 0,
  }));
}

/**
 * Hook to get the crypto category summary
 * Aggregates data from Vezgo positions for the category dashboard
 *
 * Categorization rules:
 * 1. DeFi (Vezgo category) → DeFi subcategory
 * 2. Stablecoin (Vezgo category) → Stablecoins subcategory
 * 3. NFT (Vezgo category) → Ignored (belongs to collectibles)
 * 4. Everything else → Check if BTC/ETH symbol, else Altcoin
 */
export function useCryptoSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  const { userId } = useAuth();
  const positions = useVezgoPositions();
  const totalValue = useVezgoTotalValue();

  const summary = useMemo<CategorySummary | null>(() => {
    if (!userId) return null;

    // Get the display group override for BTC+ETH merged card
    const btcEthGroup = cryptoDisplayGroups[0]; // "btc-eth" group

    // Group positions by our categorization logic
    const btcEthPositions: typeof positions = [];
    const altcoinPositions: typeof positions = [];
    const stablecoinPositions: typeof positions = [];
    const defiPositions: typeof positions = [];

    // Categorize each position
    for (const position of positions || []) {
      const category = categorizeCryptoPosition(
        position.symbol,
        position.category,
      );

      switch (category) {
        case "btc-eth":
          btcEthPositions.push(position);
          break;
        case "altcoins":
          altcoinPositions.push(position);
          break;
        case "stablecoins":
          stablecoinPositions.push(position);
          break;
        case "defi":
          defiPositions.push(position);
          break;
        // null = NFT, skip it (belongs to collectibles)
      }
    }

    // Calculate subcategory totals
    const btcEthTotal = btcEthPositions.reduce(
      (sum, p) => sum + (p.fiatValue || 0),
      0,
    );
    const altcoinTotal = altcoinPositions.reduce(
      (sum, p) => sum + (p.fiatValue || 0),
      0,
    );
    const stablecoinTotal = stablecoinPositions.reduce(
      (sum, p) => sum + (p.fiatValue || 0),
      0,
    );
    const defiTotal = defiPositions.reduce(
      (sum, p) => sum + (p.fiatValue || 0),
      0,
    );

    // Calculate total excluding NFTs
    const cryptoTotal =
      btcEthTotal + altcoinTotal + stablecoinTotal + defiTotal;

    const subcategories: SubcategoryData[] = [
      {
        id: "btc-eth",
        name: btcEthGroup.title,
        href: btcEthGroup.href,
        icon: createElement(btcEthGroup.icon, { className: "h-4 w-4" }),
        color: btcEthGroup.color,
        totalValue: btcEthTotal,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: mapPositionsToHoldings(
          btcEthPositions,
          "btc-eth",
          btcEthTotal,
        ),
        holdingsCount: btcEthPositions.length,
        implemented: true,
      },
      {
        ...makeSubcategoryBase("altcoins", cryptoSubcategoryUI.altcoins),
        totalValue: altcoinTotal,
        topHoldings: mapPositionsToHoldings(
          altcoinPositions,
          "altcoins",
          altcoinTotal,
        ),
        holdingsCount: altcoinPositions.length,
        implemented: true,
      },
      {
        ...makeSubcategoryBase("stablecoins", cryptoSubcategoryUI.stablecoins),
        totalValue: stablecoinTotal,
        topHoldings: mapPositionsToHoldings(
          stablecoinPositions,
          "stablecoins",
          stablecoinTotal,
        ),
        holdingsCount: stablecoinPositions.length,
        implemented: true,
      },
      {
        ...makeSubcategoryBase("defi", cryptoSubcategoryUI.defi),
        totalValue: defiTotal,
        topHoldings: mapPositionsToHoldings(defiPositions, "defi", defiTotal),
        holdingsCount: defiPositions.length,
        implemented: true,
      },
    ];

    const historyDataPoints: PortfolioDataPoint[] = [];

    return {
      totalValue: cryptoTotal,
      totalCost: null,
      profitLoss: null,
      profitLossPercent: null,
      ytdProfitLoss: null,
      ytdProfitLossPercent: null,
      valueAtYearStart: null,
      subcategories,
      historyDataPoints,
    };
  }, [userId, positions, totalValue]);

  return {
    summary,
    isLoading: positions === undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// POSITION ALLOCATION HOOK (for Allocation Charts)
// ═══════════════════════════════════════════════════════════════

// Color palette for top positions
const positionColors = [
  "#F7931A", // Bitcoin Orange
  "#627EEA", // Ethereum Blue
  "#14F195", // Solana Green
  "#E84142", // Avalanche Red
  "#8247E5", // Polygon Purple
  "#00D1FF", // Cosmos Blue
  "#FF007A", // Uniswap Pink
  "#2775CA", // USDC Blue
  "#26A17B", // Tether Green
  "#FF9500", // Binance Yellow
];

export interface PositionAllocation {
  symbol: string;
  name: string;
  value: number;
  percentage: number;
  color: string;
}

/**
 * Hook to get positions aggregated by symbol for allocation charts
 * Returns top positions sorted by value with colors assigned
 */
export function useCryptoPositionAllocations(maxPositions: number = 8): {
  allocations: PositionAllocation[];
  totalValue: number;
  isLoading: boolean;
} {
  const positions = useVezgoPositions();

  const result = useMemo(() => {
    if (!positions || positions.length === 0) {
      return { allocations: [], totalValue: 0 };
    }

    // Aggregate positions by symbol
    const symbolMap = new Map<string, { name: string; value: number }>();

    for (const position of positions) {
      const symbol = position.symbol.toUpperCase();
      const existing = symbolMap.get(symbol);
      const value = position.fiatValue || 0;

      if (existing) {
        existing.value += value;
      } else {
        symbolMap.set(symbol, {
          name: position.name || symbol,
          value,
        });
      }
    }

    // Convert to array and sort by value descending
    const sorted = Array.from(symbolMap.entries())
      .map(([symbol, data]) => ({ symbol, ...data }))
      .sort((a, b) => b.value - a.value);

    // Calculate total value
    const totalValue = sorted.reduce((sum, p) => sum + p.value, 0);

    // Filter out items under 2% and combine into "Other"
    const THRESHOLD_PERCENT = 2;
    const significantPositions: typeof sorted = [];
    let otherValue = 0;

    for (const position of sorted) {
      const percentage =
        totalValue > 0 ? (position.value / totalValue) * 100 : 0;
      if (
        percentage >= THRESHOLD_PERCENT &&
        significantPositions.length < maxPositions - 1
      ) {
        significantPositions.push(position);
      } else {
        otherValue += position.value;
      }
    }

    // Add "Other" category if there are small positions
    let topPositions = significantPositions;
    if (otherValue > 0) {
      topPositions.push({
        symbol: "OTHER",
        name: "Other (<2%)",
        value: otherValue,
      });
    }

    // Assign colors and calculate percentages
    const allocations: PositionAllocation[] = topPositions.map((p, index) => ({
      symbol: p.symbol,
      name: p.name,
      value: p.value,
      percentage: totalValue > 0 ? (p.value / totalValue) * 100 : 0,
      color: positionColors[index % positionColors.length],
    }));

    return { allocations, totalValue };
  }, [positions, maxPositions]);

  return {
    allocations: result.allocations,
    totalValue: result.totalValue,
    isLoading: positions === undefined,
  };
}
