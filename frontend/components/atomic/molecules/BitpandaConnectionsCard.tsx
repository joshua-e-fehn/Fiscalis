"use client";

/**
 * BitpandaConnectionsCard
 *
 * Manages Bitpanda connections within the Brokers integrations page. Bitpanda
 * is a multi-asset broker (crypto, metals, commodities, stocks, cash) connected
 * via a read-only API key.
 */

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
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
import { useStoredErrorMessage } from "@/i18n/errors";

export function BitpandaConnectionsCard() {
  const t = useTranslations("integrations.bitpanda");
  const tStatus = useTranslations("integrations.status");
  const tConnection = useTranslations("integrations.connection");
  const tActions = useTranslations("common.actions");
  const format = useFormatter();
  const storedError = useStoredErrorMessage();
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
          <CardTitle>{t("title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
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
              {t("holdings", { count: holdings?.length ?? 0 })}
            </p>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading && (
          <p className="text-sm text-muted-foreground">{tActions("loading")}</p>
        )}

        {!isLoading && !hasConnections && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("emptyDescription")}
            </p>
            <BitpandaConnectButton />
          </div>
        )}

        {connections?.map((conn) => {
          const lastSynced = conn.lastSyncAt ? (
            <span>
              ·{" "}
              {t("lastSynced", {
                date: format.dateTime(conn.lastSyncAt, "full"),
              })}
            </span>
          ) : null;
          return (
            <div
              key={conn._id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex flex-col">
                <span className="font-medium">
                  {conn.label ?? t("fallbackLabel")}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {conn.status === "needs_reauth" ? (
                    <>
                      <AlertCircle className="h-3 w-3 text-destructive" />
                      {storedError(conn.errorMessage) ?? t("keyRejected")}
                    </>
                  ) : conn.status === "error" ? (
                    <>
                      <AlertCircle className="h-3 w-3 text-destructive" />
                      {storedError(conn.errorMessage) ?? t("syncFailed")}
                    </>
                  ) : conn.status === "transient_error" ? (
                    <>
                      <Clock className="h-3 w-3 text-yellow-600" />
                      {t("transient")}
                      {lastSynced}
                    </>
                  ) : (
                    <>
                      {conn.status === "syncing"
                        ? tConnection("syncing")
                        : tStatus("connected")}
                      {lastSynced}
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
                  title={t("syncNow")}
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
                  title={tConnection("disconnect")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}

        {hasConnections && (
          <div className="pt-1">
            <BitpandaConnectButton buttonVariant="outline" size="sm">
              {t("addAnother")}
            </BitpandaConnectButton>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default BitpandaConnectionsCard;
