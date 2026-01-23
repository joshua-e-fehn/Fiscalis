"use client";

import { useState, useCallback, useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@/components/ui/shadcn/button";
import { Loader2, CheckCircle2 } from "lucide-react";
import { usePlaidLink as usePlaidHooks, useAccounts } from "@/hooks/banking";

export function PlaidLinkButton() {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const { getLinkToken, exchangeToken } = usePlaidHooks();
  const { data: accounts, isLoading: accountsLoading } = useAccounts();

  // Get a link token and open Plaid
  const handleConnectBank = useCallback(async () => {
    if (token || linkOpen || isLoading) return;

    setIsLoading(true);
    try {
      const { linkToken } = await getLinkToken();
      setToken(linkToken);
    } catch (error) {
      console.error("Failed to get link token", error);
      setIsLoading(false);
    }
  }, [token, linkOpen, isLoading, getLinkToken]);

  // Reset all states
  const resetStates = useCallback(() => {
    setLinkOpen(false);
    setIsLoading(false);
    setToken(null);
  }, []);

  // Success handler
  const onSuccess = useCallback(
    async (public_token: string, metadata: any) => {
      try {
        await exchangeToken({
          publicToken: public_token,
          institutionId: metadata.institution?.institution_id,
          institutionName: metadata.institution?.name,
        });

        // Show temporary success message
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      } catch (error) {
        console.error("Error linking account", error);
      } finally {
        resetStates();
      }
    },
    [exchangeToken, resetStates]
  );

  // Initialize Plaid Link
  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit: resetStates,
    onEvent: (eventName) => eventName === "OPEN" && setLinkOpen(true),
  });

  // Auto-open when ready
  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  // Determine button state and text
  const isDisabled =
    isLoading || accountsLoading || linkOpen || (!!token && !ready);
  const buttonText = linkOpen
    ? "Connecting..."
    : accounts?.length
    ? "Connect Another Bank"
    : "Connect Your Bank";

  // Show success state if needed
  if (showSuccess) {
    return (
      <Button
        variant="outline"
        className="flex items-center gap-2 text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
      >
        <CheckCircle2 className="h-4 w-4" />
        Bank Connected Successfully
      </Button>
    );
  }

  return (
    <Button
      onClick={handleConnectBank}
      disabled={isDisabled}
      className="flex items-center gap-2"
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {buttonText}
    </Button>
  );
}
