"use client";

/**
 * BankAccountsCard Component
 *
 * Displays a single bank institution with its connected accounts.
 * Uses the unified IntegrationConnectionCard for consistent styling.
 */

import {
  Landmark,
  CreditCard,
  Wallet,
  PiggyBank,
  Building2,
} from "lucide-react";
import { useDeletePlaidItem, useRefreshAccounts } from "@/hooks/convex";
import { useSyncContextSafe } from "@/providers/syncProvider";
import {
  bankAccountTotals,
  type BankAccountTotalsLike,
} from "@/../services/portfolio/categorySummary";
import {
  IntegrationConnectionCard,
  IntegrationAccountItem,
  DISCONNECT_FAILED_MESSAGE,
} from "@/components/atomic/molecules/integrations";

// Type for Convex account data, with the stored EUR value the totals read
interface ConvexAccount extends BankAccountTotalsLike {
  _id: string;
  accountId: string;
  itemId: string;
  name: string;
  officialName?: string;
  type: string;
  subtype?: string;
  mask?: string;
  currentBalance?: number;
  availableBalance?: number;
  currency: string;
  lastSynced?: number;
}

interface BankAccountsCardProps {
  itemId: string;
  institutionName: string;
  institutionLogo?: string; // Base64-encoded PNG from Plaid
  institutionPrimaryColor?: string; // Hex color code from Plaid
  accounts: ConvexAccount[];
}

// Get icon for account type
function getAccountIcon(type: string, subtype?: string) {
  const t = type.toLowerCase();
  const s = subtype?.toLowerCase() || "";

  if (t === "credit" || s.includes("credit")) {
    return <CreditCard className="h-4 w-4" />;
  }
  if (s.includes("savings") || s.includes("money market")) {
    return <PiggyBank className="h-4 w-4" />;
  }
  if (t === "investment" || s.includes("brokerage")) {
    return <Building2 className="h-4 w-4" />;
  }
  return <Wallet className="h-4 w-4" />;
}

export function BankAccountsCard({
  itemId,
  institutionName,
  institutionLogo,
  institutionPrimaryColor,
  accounts,
}: BankAccountsCardProps) {
  const deleteItem = useDeletePlaidItem();
  const refreshAccounts = useRefreshAccounts();

  // Get global sync state (may be undefined if outside SyncProvider)
  const syncContext = useSyncContextSafe();
  const isGlobalPlaidSyncing = syncContext?.isPlaidSyncing ?? false;

  // Combine local and global sync state
  const isSyncing = refreshAccounts.isLoading || isGlobalPlaidSyncing;

  if (!accounts || accounts.length === 0) {
    return null;
  }

  // A failed revoke at Plaid keeps the bank (ENG-225); the hook keeps the
  // error, shown on the card, so the user can retry
  const handleDisconnect = async () => {
    await deleteItem.mutate(itemId).catch(() => undefined);
  };

  const handleSync = async () => {
    await refreshAccounts.mutate(itemId);
  };

  // The institution's net balance in EUR from each account's stored EUR
  // value, debts subtracted (as on the Bank Accounts page and in net
  // worth), so accounts in different currencies add up
  const totalBalanceEur = bankAccountTotals(accounts).net;

  // Get the most recent sync time from accounts
  const lastSyncAt =
    accounts.reduce((latest, acc) => {
      if (acc.lastSynced && acc.lastSynced > latest) {
        return acc.lastSynced;
      }
      return latest;
    }, 0) || undefined;

  // Prepare logo - Plaid sends base64 encoded PNGs
  const logoUrl = institutionLogo
    ? `data:image/png;base64,${institutionLogo}`
    : undefined;

  // Fallback icon with institution color
  const fallbackIcon = (
    <Landmark
      className="h-5 w-5"
      style={{
        color: institutionPrimaryColor || "hsl(var(--primary))",
      }}
    />
  );

  return (
    <IntegrationConnectionCard
      name={institutionName}
      logo={logoUrl}
      fallbackIcon={fallbackIcon}
      status="connected"
      totalValueEur={totalBalanceEur}
      lastSyncAt={lastSyncAt}
      errorMessage={deleteItem.error ? DISCONNECT_FAILED_MESSAGE : undefined}
      secondaryInfo={`${accounts.length} account${accounts.length !== 1 ? "s" : ""}`}
      onSync={handleSync}
      onDisconnect={handleDisconnect}
      isSyncing={isSyncing}
      isDisconnecting={deleteItem.isLoading}
    >
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {[...accounts]
          .sort((a, b) => {
            const balanceA = a.currentBalance || a.availableBalance || 0;
            const balanceB = b.currentBalance || b.availableBalance || 0;
            return balanceB - balanceA; // Descending order
          })
          .map((account) => (
            <IntegrationAccountItem
              key={account._id}
              name={account.name}
              type={account.subtype || account.type}
              accountNumber={account.mask ? `****${account.mask}` : undefined}
              balance={account.currentBalance || account.availableBalance || 0}
              currency={account.currency}
              icon={getAccountIcon(account.type, account.subtype)}
            />
          ))}
      </div>
    </IntegrationConnectionCard>
  );
}
