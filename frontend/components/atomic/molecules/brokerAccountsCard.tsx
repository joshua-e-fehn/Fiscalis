"use client";

/**
 * BrokerAccountsCard Component
 *
 * Displays a single broker connection with its accounts.
 * Uses the unified IntegrationConnectionCard for consistent styling.
 */

import { TrendingUp, Briefcase, LineChart, Coins } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import {
  useDeleteConnection,
  useSyncAll,
  useBrokerPositions,
} from "@/hooks/convex";
import { useSyncContextSafe } from "@/providers/syncProvider";
import {
  IntegrationConnectionCard,
  IntegrationAccountItem,
} from "@/components/atomic/molecules/integrations";

// Type for broker connection from Convex
interface BrokerConnection {
  _id: Id<"brokerConnections">;
  brokerName: string;
  brokerSlug: string;
  brokerLogo?: string;
  status:
    | "connected"
    | "disconnected"
    | "error"
    | "pending"
    | "syncing"
    | "reauth_required";
  lastSyncAt?: number;
  errorMessage?: string;
}

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

interface BrokerAccountsCardProps {
  connection: BrokerConnection;
  accounts: BrokerAccount[];
}

// Get icon for account type
function getAccountIcon(accountType?: string) {
  const t = accountType?.toLowerCase() || "";

  if (t.includes("margin") || t.includes("trading")) {
    return <LineChart className="h-4 w-4" />;
  }
  if (t.includes("retirement") || t.includes("ira") || t.includes("401")) {
    return <Briefcase className="h-4 w-4" />;
  }
  if (t.includes("crypto")) {
    return <Coins className="h-4 w-4" />;
  }
  return <TrendingUp className="h-4 w-4" />;
}

export function BrokerAccountsCard({
  connection,
  accounts,
}: BrokerAccountsCardProps) {
  const { deleteConnection, isLoading: isDeleting } = useDeleteConnection();
  const { syncAll, isLoading: isLocalSyncing } = useSyncAll();
  const positions = useBrokerPositions(); // Get all positions to determine which accounts have them

  // Get global sync state (may be undefined if outside SyncProvider)
  const syncContext = useSyncContextSafe();
  const isGlobalSnaptradeSyncing = syncContext?.isSnaptradeSyncing ?? false;

  // Combine local and global sync state
  const isSyncing = isLocalSyncing || isGlobalSnaptradeSyncing;

  if (!accounts || accounts.length === 0) {
    return null;
  }

  const handleDisconnect = async () => {
    await deleteConnection(connection._id);
  };

  const handleSync = async () => {
    await syncAll();
  };

  // Build a set of account IDs that have positions
  const accountsWithPositions = new Set(
    positions?.map((p) => p.accountId) ?? [],
  );

  // Helper to get effective cash for an account
  // Same logic as cash page: if cash > 0 use it, else if no positions treat balance as cash
  const getEffectiveCash = (acc: BrokerAccount) => {
    if ((acc.cash ?? 0) > 0) return acc.cash ?? 0;
    // If no positions and balance > 0, treat balance as cash
    if (!accountsWithPositions.has(acc._id) && (acc.balance ?? 0) > 0) {
      return acc.balance ?? 0;
    }
    return 0;
  };

  // Calculate total portfolio value for this connection
  const totalValue = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

  // Calculate total cash across all accounts using the same logic as cash page
  const totalCash = accounts.reduce(
    (sum, acc) => sum + getEffectiveCash(acc),
    0,
  );
  const currency = accounts[0]?.currency || "USD";

  // Map connection status to integration status
  const mapStatus = (status: BrokerConnection["status"]) => {
    if (status === "connected") return "active";
    return status;
  };

  // Fallback icon
  const fallbackIcon = <TrendingUp className="h-5 w-5 text-primary" />;

  return (
    <IntegrationConnectionCard
      name={connection.brokerName}
      logo={connection.brokerLogo}
      fallbackIcon={fallbackIcon}
      status={mapStatus(connection.status)}
      totalValue={totalValue}
      totalCash={totalCash}
      currency={currency}
      lastSyncAt={connection.lastSyncAt}
      errorMessage={connection.errorMessage}
      secondaryInfo={`${accounts.length} account${accounts.length !== 1 ? "s" : ""}`}
      onSync={handleSync}
      onDisconnect={handleDisconnect}
      isSyncing={isSyncing}
      isDisconnecting={isDeleting}
    >
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {[...accounts]
          .sort((a, b) => (b.balance || 0) - (a.balance || 0)) // Descending order
          .map((account) => (
            <IntegrationAccountItem
              key={account._id}
              name={account.name}
              type={account.accountType}
              accountNumber={account.accountNumber}
              balance={account.balance || 0}
              cash={getEffectiveCash(account)}
              currency={account.currency}
              icon={getAccountIcon(account.accountType)}
            />
          ))}
      </div>
    </IntegrationConnectionCard>
  );
}
