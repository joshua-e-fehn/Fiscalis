"use client";

import { useTranslations } from "next-intl";
import {
  useBrokerConnections,
  useBrokerAccounts,
  useConnectionsNeedingAttention,
  useSyncAll,
} from "@/hooks/convex";
import { Card, CardContent, CardHeader } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Button } from "@/components/ui/shadcn/button";
import { TrendingUp, RefreshCw, Loader2 } from "lucide-react";
import { SnaptradeConnectButton } from "@/components/atomic/atoms/snaptradeConnectButton";
import { BrokerAccountsCard } from "@/components/atomic/molecules/brokerAccountsCard";
import { BrokerReauthCard } from "@/components/atomic/molecules/brokerReauthCard";
import { useSyncContextSafe } from "@/providers/syncProvider";
import { IntegrationEmptyState } from "@/components/atomic/molecules/integrations";

export function BrokersCard() {
  const t = useTranslations("integrations.brokers.empty");
  const tConnection = useTranslations("integrations.connection");
  const connections = useBrokerConnections();
  const accounts = useBrokerAccounts();
  const connectionsNeedingAttention = useConnectionsNeedingAttention();
  const { syncAll, isLoading: isLocalSyncing } = useSyncAll();

  // Get global sync state (may be undefined if outside SyncProvider)
  const syncContext = useSyncContextSafe();
  const isGlobalSnaptradeSyncing = syncContext?.isSnaptradeSyncing ?? false;

  // Combine local and global sync state
  const isSyncing = isLocalSyncing || isGlobalSnaptradeSyncing;

  // Loading state - Convex returns undefined while loading
  const isLoading = connections === undefined || accounts === undefined;

  // Group accounts by connection
  const accountsByConnection = new Map<string, typeof accounts>();
  if (accounts) {
    for (const account of accounts) {
      const connId = account.connectionId;
      if (!accountsByConnection.has(connId)) {
        accountsByConnection.set(connId, []);
      }
      accountsByConnection.get(connId)!.push(account);
    }
  }

  // Check if we have connections but no accounts (need to sync)
  const hasConnections = connections && connections.length > 0;
  const hasAccounts = accounts && accounts.length > 0;
  const needsSync = hasConnections && !hasAccounts;

  // Check for connections needing attention
  const hasConnectionsNeedingAttention =
    connectionsNeedingAttention && connectionsNeedingAttention.length > 0;
  const hasAnyContent = hasAccounts || hasConnectionsNeedingAttention;

  if (isLoading) {
    return (
      <div className="space-y-4">
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
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-16 rounded-lg" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Empty state - no accounts and no connections needing attention
  if (!hasAnyContent) {
    // If we have connections but no accounts, offer to sync
    if (needsSync) {
      return (
        <IntegrationEmptyState
          icon={RefreshCw}
          title={t("syncTitle")}
          description={t("syncDescription", {
            count: connections?.length ?? 0,
          })}
        >
          <Button onClick={() => syncAll()} disabled={isSyncing} size="lg">
            {isSyncing ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {tConnection("syncing")}
              </>
            ) : (
              <>
                <RefreshCw className="me-2 h-4 w-4" />
                {t("syncAccounts")}
              </>
            )}
          </Button>
        </IntegrationEmptyState>
      );
    }

    return (
      <IntegrationEmptyState
        icon={TrendingUp}
        title={t("noBrokersTitle")}
        description={t("noBrokersDescription")}
      >
        <SnaptradeConnectButton />
      </IntegrationEmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {/* Show connections needing re-authentication first */}
      {hasConnectionsNeedingAttention &&
        connectionsNeedingAttention.map((connection) => (
          <BrokerReauthCard key={connection._id} connection={connection} />
        ))}

      {/* Show connected broker accounts */}
      {hasConnections &&
        connections
          .filter(
            (conn) =>
              !connectionsNeedingAttention?.some((c) => c._id === conn._id),
          )
          .map((connection) => {
            const connAccounts = accountsByConnection.get(connection._id) || [];
            return (
              <BrokerAccountsCard
                key={connection._id}
                connection={connection}
                accounts={connAccounts}
              />
            );
          })}
    </div>
  );
}
