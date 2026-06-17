"use client";

import { useCallback } from "react";
import { RefreshCw, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/shadcn/tooltip";
import { cn } from "@/lib/utils";
import { useSyncContext } from "@/providers/syncProvider";

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
  const { isGlobalSyncing, globalSyncStatus, globalSyncMessage, syncAll } =
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
    if (globalSyncMessage) return globalSyncMessage;
    return "Sync all accounts";
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
            <span className="sr-only">Sync all accounts</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{getTooltipText()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
