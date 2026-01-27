"use client";

import {
  useBrokerConnections,
  useBrokerAccounts,
  useConnectionsNeedingAttention,
  useSyncAll,
} from "@/hooks/convex";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Button } from "@/components/ui/shadcn/button";
import { TrendingUp, RefreshCw, Loader2 } from "lucide-react";
import { SnaptradeConnectButton } from "@/components/atomic/atoms/snaptradeConnectButton";
import { BrokerAccountsCard } from "@/components/atomic/molecules/brokerAccountsCard";
import { BrokerReauthCard } from "@/components/atomic/molecules/brokerReauthCard";

export function BrokersCard() {
  const connections = useBrokerConnections();
  const accounts = useBrokerAccounts();
  const connectionsNeedingAttention = useConnectionsNeedingAttention();
  const { syncAll, isLoading: isSyncing } = useSyncAll();

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
      <Card className="mb-8">
        <CardHeader>
          <Skeleton className="h-6 w-2/4" />
          <Skeleton className="h-3 w-1/4" />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-2 w-3/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-1/2 mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Empty state - no accounts and no connections needing attention
  if (!hasAnyContent) {
    // If we have connections but no accounts, offer to sync
    if (needsSync) {
      return (
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-4 mb-4">
                <RefreshCw className="h-10 w-10 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Sync Your Accounts</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                You have {connections?.length} broker connection
                {connections?.length !== 1 ? "s" : ""} but no accounts synced
                yet. Click below to fetch your account data.
              </p>
              <Button onClick={() => syncAll()} disabled={isSyncing} size="lg">
                {isSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync Accounts
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <TrendingUp className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No Brokers Connected</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              Connect your brokerage accounts to track your investments,
              positions, and portfolio performance all in one place.
            </p>
            <SnaptradeConnectButton />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Broker Accounts</CardTitle>
            <CardDescription>
              View and manage your connected brokerage accounts
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncAll()}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">
                {isSyncing ? "Syncing..." : "Refresh All"}
              </span>
            </Button>
            <SnaptradeConnectButton
              variant="outline"
              size="sm"
              buttonText="Add Broker"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Show connections needing re-authentication first */}
        {hasConnectionsNeedingAttention &&
          connectionsNeedingAttention.map((connection) => (
            <BrokerReauthCard key={connection._id} connection={connection} />
          ))}

        {/* Show connected broker accounts */}
        <div className="grid gap-4">
          {hasConnections &&
            connections
              .filter(
                (conn) =>
                  !connectionsNeedingAttention?.some((c) => c._id === conn._id),
              )
              .map((connection) => {
                const connAccounts =
                  accountsByConnection.get(connection._id) || [];
                return (
                  <BrokerAccountsCard
                    key={connection._id}
                    connection={connection}
                    accounts={connAccounts}
                  />
                );
              })}
        </div>
      </CardContent>
    </Card>
  );
}
