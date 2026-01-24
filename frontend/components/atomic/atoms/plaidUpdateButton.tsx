"use client";

import { useState, useCallback, useEffect } from "react";
import { usePlaidLink as usePlaidLinkReact } from "react-plaid-link";
import { Button } from "@/components/ui/shadcn/button";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import {
  usePlaidLink as usePlaidHooks,
  ItemNeedingReauth,
} from "@/hooks/banking";

interface PlaidUpdateButtonProps {
  item: ItemNeedingReauth;
  onSuccess?: () => void;
  variant?: "default" | "outline" | "destructive" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function PlaidUpdateButton({
  item,
  onSuccess,
  variant = "outline",
  size = "sm",
}: PlaidUpdateButtonProps) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const { getUpdateLinkToken, onUpdateSuccess } = usePlaidHooks();

  // Get an update link token
  const handleReconnect = useCallback(async () => {
    if (token || linkOpen || isLoading) return;

    setIsLoading(true);
    try {
      const { linkToken } = await getUpdateLinkToken(item.itemId);
      setToken(linkToken);
    } catch (error) {
      console.error("Failed to get update link token", error);
      setIsLoading(false);
    }
  }, [token, linkOpen, isLoading, getUpdateLinkToken, item.itemId]);

  // Reset states
  const resetStates = useCallback(() => {
    setLinkOpen(false);
    setIsLoading(false);
    setToken(null);
  }, []);

  // Success handler for update mode
  const handleSuccess = useCallback(() => {
    // In update mode, no public_token is returned - just refresh data
    onUpdateSuccess();
    onSuccess?.();
    resetStates();
  }, [onUpdateSuccess, onSuccess, resetStates]);

  // Initialize Plaid Link in update mode
  const { open, ready } = usePlaidLinkReact({
    token,
    onSuccess: handleSuccess,
    onExit: resetStates,
    onEvent: (eventName) => eventName === "OPEN" && setLinkOpen(true),
  });

  // Auto-open when ready
  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  const isDisabled = isLoading || linkOpen || (!!token && !ready);

  return (
    <Button
      onClick={handleReconnect}
      disabled={isDisabled}
      variant={variant}
      size={size}
      className="flex items-center gap-2"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      {linkOpen ? "Reconnecting..." : "Reconnect"}
    </Button>
  );
}

interface ReauthAlertProps {
  items: ItemNeedingReauth[];
}

export function ReauthAlert({ items }: ReauthAlertProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Bank Connection{items.length > 1 ? "s" : ""} Need Attention
          </h4>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
            {items.length === 1
              ? `Your connection to ${items[0].institutionName || "a bank"} needs to be re-authenticated.`
              : `${items.length} bank connections need to be re-authenticated.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {items.map((item) => (
              <div
                key={item.itemId}
                className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-md px-3 py-2 border border-yellow-200 dark:border-yellow-800"
              >
                <span className="text-sm font-medium">
                  {item.institutionName || "Unknown Bank"}
                </span>
                <PlaidUpdateButton item={item} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
