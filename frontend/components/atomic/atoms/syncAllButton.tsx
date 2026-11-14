"use client";

import { useCallback } from "react";
import { RefreshCw, Check, AlertCircle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/shadcn/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/shadcn/tooltip";
import { cn } from "@/lib/utils";
import { useSyncContext, type SyncOutcome } from "@/providers/syncProvider";
import type {
  SyncedProvider,
  SyncProviderId,
} from "@/../services/portfolio/syncOutcome";

/** The tooltip for a finished run: what synced, what failed. */
function useSyncOutcomeText() {
  const t = useTranslations("navigation.sync");
  const tErrors = useTranslations("common.errors");
  const format = useFormatter();

  return (outcome: SyncOutcome): string => {
    const name = (provider: SyncProviderId) => t(`providers.${provider}`);
    const list = (items: string[]) =>
      format.list(items, { type: "conjunction" });
    const synced = (items: SyncedProvider[]) =>
      list(
        items.map(({ provider, count }) =>
          t("providerCount", { provider: name(provider), count }),
        ),
      );

    switch (outcome.status) {
      case "success":
        return outcome.synced.length > 0
          ? t("synced", { providers: synced(outcome.synced) })
          : t("complete");
      case "partial":
        return t("partial", {
          synced: synced(outcome.synced),
          failed: list(outcome.failed.map(name)),
        });
      case "error":
        if (outcome.retryAfterMinutes !== undefined) {
          return tErrors("rateLimited", {
            minutes: outcome.retryAfterMinutes,
          });
        }
        return outcome.failed.length > 0
          ? t("failedProviders", { providers: list(outcome.failed.map(name)) })
          : t("failed");
    }
  };
}

/**
 * Sync All Button - syncs all financial providers and creates a portfolio snapshot
 *
 * Features:
 * - Syncs Plaid (banking), Snaptrade (brokers), and Bitpanda
 * - Creates a portfolio snapshot after sync
 * - Handles partial failures gracefully
 * - Shows visual feedback for sync status
 * - Shares sync state with integration pages via SyncContext
 */
export function SyncAllButton() {
  const t = useTranslations("navigation.sync");
  const outcomeText = useSyncOutcomeText();
  const { isGlobalSyncing, globalSyncStatus, globalSyncOutcome, syncAll } =
    useSyncContext();

  const handleSync = useCallback(async () => {
    await syncAll();
  }, [syncAll]);

  const getIcon = () => {
    switch (globalSyncStatus) {
      case "syncing":
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      case "success":
        return <Check className="h-4 w-4 text-green-500" />;
      case "partial":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <RefreshCw className="h-4 w-4" />;
    }
  };

  const getTooltipText = () => {
    if (globalSyncStatus === "syncing") return t("syncing");
    if (globalSyncOutcome) return outcomeText(globalSyncOutcome);
    return t("syncAll");
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSync}
            disabled={isGlobalSyncing}
            className={cn(
              "h-8 w-8",
              globalSyncStatus === "success" && "text-green-500",
              globalSyncStatus === "partial" && "text-yellow-500",
              globalSyncStatus === "error" && "text-red-500",
            )}
          >
            {getIcon()}
            <span className="sr-only">{t("syncAll")}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{getTooltipText()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
