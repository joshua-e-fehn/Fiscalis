"use client";

/**
 * BitpandaConnectionsCard
 *
 * Manages Bitpanda connections within the Brokers integrations page. Bitpanda
 * is a multi-asset broker (crypto, metals, commodities, stocks, cash) connected
 * via a read-only API key.
 */

import { useMemo } from "react";
import { RefreshCw, Trash2, AlertCircle, Clock, Wallet } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import { BitpandaConnectButton } from "@/components/atomic/atoms/BitpandaConnectButton";
import {
  useBitpandaConnections,
  useBitpandaHoldings,
  useSyncBitpandaConnection,
  useDeleteBitpandaConnection,
} from "@/hooks/convex/bitpanda";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";
import { formatCurrency } from "@/lib/utils/currency";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import type { Id } from "@/convex/_generated/dataModel";

export function BitpandaConnectionsCard() {
  const connections = useBitpandaConnections();
  const holdings = useBitpandaHoldings();
  const { sync } = useSyncBitpandaConnection();
  const { deleteConnection } = useDeleteBitpandaConnection();
  const display = useDisplayCurrency();

  const isLoading = connections === undefined;
  const hasConnections = connections && connections.length > 0;

  // In EUR, as stored; shown in the display currency
  const totalValue = useMemo(
    () =>
      holdings?.reduce(
        (sum, h) => sum + (h.valueInBaseCurrency ?? h.marketValue ?? 0),
        0,
      ) ?? 0,
    [holdings],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Bitpanda</CardTitle>
          <p className="text-sm text-muted-foreground">
            Crypto, metals, commodities, stocks & cash via a read-only API key.
          </p>
        </div>
        {hasConnections && (
          <div className="text-right">
            {/* No figure before the display rate arrives */}
            {display.isLoading ? (
              <Skeleton className="ml-auto h-6 w-24" />
            ) : (
              <p className="text-lg font-semibold">
                {formatCurrency(display.fromEur(totalValue), display.currency)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {holdings?.length ?? 0} holdings
            </p>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {!isLoading && !hasConnections && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Connect your Bitpanda account with a read-only API key to track all
              your holdings.
            </p>
            <BitpandaConnectButton />
          </div>
        )}

        {connections?.map((conn) => (
          <div
            key={conn._id}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div className="flex flex-col">
              <span className="font-medium">
                {conn.label ?? "Bitpanda account"}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {conn.status === "needs_reauth" ? (
                  <>
                    <AlertCircle className="h-3 w-3 text-destructive" />
                    {conn.errorMessage ??
                      "API key rejected — reconnect with a new read-only key"}
                  </>
                ) : conn.status === "error" ? (
                  <>
                    <AlertCircle className="h-3 w-3 text-destructive" />
                    {conn.errorMessage ?? "Sync failed — try again"}
                  </>
                ) : conn.status === "transient_error" ? (
                  <>
                    <Clock className="h-3 w-3 text-yellow-600" />
                    Temporary problem at Bitpanda — will retry automatically
                    {conn.lastSyncAt
                      ? ` · last synced ${new Date(conn.lastSyncAt).toLocaleString()}`
                      : ""}
                  </>
                ) : (
                  <>
                    {conn.status === "syncing" ? "Syncing…" : "Connected"}
                    {conn.lastSyncAt
                      ? ` · last synced ${new Date(conn.lastSyncAt).toLocaleString()}`
                      : ""}
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => sync(conn._id as Id<"bitpandaConnections">)}
                title="Sync now"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() =>
                  deleteConnection(conn._id as Id<"bitpandaConnections">)
                }
                title="Disconnect"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {hasConnections && (
          <div className="pt-1">
            <BitpandaConnectButton buttonVariant="outline" size="sm">
              Add another Bitpanda key
            </BitpandaConnectButton>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default BitpandaConnectionsCard;
