"use client";

/**
 * CryptoConnectionsCard Component
 *
 * Displays a list of connected crypto exchanges and wallets.
 * Uses the unified IntegrationConnectionCard for consistent styling.
 *
 * Connections can have multiple categories (exchange, wallet, blockchain)
 * displayed in order: exchange → wallet → blockchain
 */

import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Card, CardHeader } from "@/components/ui/shadcn/card";
import {
  useVezgoConnections,
  useVezgoPositions,
  useDeleteVezgoConnection,
  useSyncVezgoConnection,
} from "@/hooks/convex/crypto";
import { VezgoConnectButton } from "@/components/atomic/atoms/VezgoConnectButton";
import { useSyncContextSafe } from "@/providers/syncProvider";
import { Building2, Wallet, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import {
  IntegrationConnectionCard,
  IntegrationEmptyState,
  type IntegrationStatus,
} from "@/components/atomic/molecules/integrations";

type ProviderCategory = "exchange" | "wallet" | "blockchain";

const categoryIcons = {
  exchange: Building2,
  wallet: Wallet,
  blockchain: Link2,
};

const categoryLabels: Record<ProviderCategory, string> = {
  exchange: "exchange",
  wallet: "wallet",
  blockchain: "blockchain",
};

// Display order for categories
const CATEGORY_ORDER: ProviderCategory[] = ["exchange", "wallet", "blockchain"];

/**
 * Format categories for display, maintaining order: exchange → wallet → blockchain
 */
function formatCategories(categories: ProviderCategory[]): string {
  return CATEGORY_ORDER.filter((cat) => categories.includes(cat))
    .map((cat) => categoryLabels[cat])
    .join(", ");
}

/**
 * Get the primary icon for a connection based on its categories
 */
function getPrimaryIcon(categories: ProviderCategory[]) {
  for (const cat of CATEGORY_ORDER) {
    if (categories.includes(cat)) {
      return categoryIcons[cat];
    }
  }
  return Wallet;
}

interface CryptoConnectionsCardProps {
  className?: string;
  /** Filter by category - shows connections that include this category */
  filterByCategory?: ProviderCategory;
}

export function CryptoConnectionsCard({
  className,
  filterByCategory,
}: CryptoConnectionsCardProps) {
  const connections = useVezgoConnections();
  const positions = useVezgoPositions();
  const { deleteConnection, isLoading: isDeleting } =
    useDeleteVezgoConnection();
  const { sync, isLoading: isLocalSyncing } = useSyncVezgoConnection();

  // Get global sync state (may be undefined if outside SyncProvider)
  const syncContext = useSyncContextSafe();
  const isGlobalVezgoSyncing = syncContext?.isVezgoSyncing ?? false;

  // Combine local and global sync state
  const isSyncing = isLocalSyncing || isGlobalVezgoSyncing;

  // Filter by category if specified (connection must include this category)
  const filteredConnections = filterByCategory
    ? connections?.filter((c) => c.categories?.includes(filterByCategory))
    : connections;

  // Calculate total value per connection from positions
  const connectionValues = useMemo(() => {
    if (!positions) return new Map<string, number>();

    const values = new Map<string, number>();
    for (const position of positions) {
      const connectionId = position.connectionId;
      const currentValue = values.get(connectionId) ?? 0;
      values.set(connectionId, currentValue + (position.fiatValue ?? 0));
    }
    return values;
  }, [positions]);

  // Map Vezgo status to integration status
  const mapStatus = (status: string): IntegrationStatus => {
    if (status === "active") return "active";
    if (status === "syncing") return "syncing";
    if (status === "error") return "error";
    if (status === "disconnected") return "disconnected";
    return "connected";
  };

  // Get label for empty state based on filter category
  const getEmptyStateLabel = () => {
    switch (filterByCategory) {
      case "exchange":
        return { title: "No Exchanges Connected", type: "exchanges" };
      case "wallet":
        return { title: "No Wallets Connected", type: "wallets" };
      case "blockchain":
        return {
          title: "No Blockchain Addresses",
          type: "blockchain addresses",
        };
      default:
        return { title: "No Accounts Connected", type: "crypto accounts" };
    }
  };

  // Loading state
  if (!connections) {
    return (
      <div className={cn("space-y-4", className)}>
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  // Empty state
  if (!filteredConnections || filteredConnections.length === 0) {
    const { title, type } = getEmptyStateLabel();
    const Icon = filterByCategory ? categoryIcons[filterByCategory] : Wallet;

    return (
      <IntegrationEmptyState
        icon={Icon}
        title={title}
        description={`Connect your ${type} to automatically track your crypto portfolio and transactions.`}
        className={className}
      >
        <VezgoConnectButton variant="default" />
      </IntegrationEmptyState>
    );
  }

  // Connections list
  return (
    <div className={cn("space-y-4", className)}>
      {filteredConnections.map((connection) => {
        const categories = (connection.categories || [
          "wallet",
        ]) as ProviderCategory[];
        const PrimaryIcon = getPrimaryIcon(categories);
        const totalValue = connectionValues.get(connection._id) ?? 0;

        return (
          <IntegrationConnectionCard
            key={connection._id}
            name={connection.name}
            logo={connection.logo}
            fallbackIcon={
              <PrimaryIcon className="h-5 w-5 text-muted-foreground" />
            }
            status={mapStatus(connection.status)}
            totalValue={totalValue}
            currency="USD"
            lastSyncAt={connection.lastSyncAt}
            errorMessage={connection.errorMessage}
            secondaryInfo={formatCategories(categories)}
            onSync={() => sync(connection._id)}
            onDisconnect={() => deleteConnection(connection._id)}
            isSyncing={isSyncing}
            isDisconnecting={isDeleting}
          />
        );
      })}
    </div>
  );
}

export default CryptoConnectionsCard;
