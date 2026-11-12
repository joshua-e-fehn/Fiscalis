"use client";

/**
 * BrokerAccountsCard Component
 *
 * Displays a single broker connection with its accounts.
 * Uses the unified IntegrationConnectionCard for consistent styling.
 */

import { TrendingUp, Briefcase, LineChart, Coins } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { useDeleteConnection, useSyncAll } from "@/hooks/convex";
import {
  brokerAccountCash,
  brokerAccountTotals,
  brokerAccountValue,
} from "@/../services/portfolio/categorySummary";
import { BASE_CURRENCY } from "@/../services/finance/currency";
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
  balanceCurrency?: string;
  balanceInBaseCurrency?: number;
  cashValueInBaseCurrency?: number;
  cashInvestmentCategory?: string;
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

  // Connection totals in EUR, the way net worth counts them: the balance
  // is never cash, only the explicit cash the sync stored
  const { value: totalValue, cash: totalCash } = brokerAccountTotals(accounts);

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
      currency={BASE_CURRENCY}
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
          .sort((a, b) => brokerAccountValue(b) - brokerAccountValue(a))
          .map((account) => (
            <IntegrationAccountItem
              key={account._id}
              name={account.name}
              type={account.accountType}
              accountNumber={account.accountNumber}
              balance={account.balance || 0}
              // Native amounts; cash only where net worth counts it
              cash={brokerAccountCash(account) > 0 ? account.cash : undefined}
              currency={account.balanceCurrency ?? account.currency}
              icon={getAccountIcon(account.accountType)}
            />
          ))}
      </div>
    </IntegrationConnectionCard>
  );
}
