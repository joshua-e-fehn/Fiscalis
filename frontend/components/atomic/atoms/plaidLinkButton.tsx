"use client";

import { useState, useCallback, useEffect } from "react";
import {
  usePlaidLink,
  type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/shadcn/button";
import { useErrorMessage } from "@/i18n/errors";
import { Loader2, CheckCircle2, Plus } from "lucide-react";
import {
  useCreateLinkToken,
  useExchangeToken,
  usePlaidAccounts,
} from "@/hooks/convex";

interface PlaidLinkButtonProps {
  /** Custom button text, already translated (overrides the default) */
  buttonText?: string;
  /** Whether to show the Plus icon on the left (default: true) */
  showIcon?: boolean;
  /** Button variant */
  variant?: "default" | "outline" | "ghost" | "secondary";
}

export function PlaidLinkButton({
  buttonText,
  showIcon = true,
  variant = "default",
}: PlaidLinkButtonProps = {}) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const t = useTranslations("integrations.banking.link");
  const toErrorMessage = useErrorMessage();

  const createLinkToken = useCreateLinkToken();
  const exchangeTokenHook = useExchangeToken();
  const accounts = usePlaidAccounts();

  // Get a link token and open Plaid
  const handleConnectBank = useCallback(async () => {
    if (token || linkOpen || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await createLinkToken.mutate();
      setToken(result.linkToken);
    } catch (error) {
      console.error("Failed to get link token", error);
      setErrorMessage(toErrorMessage(error));
      setIsLoading(false);
    }
  }, [token, linkOpen, isLoading, createLinkToken, toErrorMessage]);

  // Reset all states
  const resetStates = useCallback(() => {
    setLinkOpen(false);
    setIsLoading(false);
    setToken(null);
  }, []);

  // Success handler
  const onSuccess = useCallback(
    async (public_token: string, metadata: PlaidLinkOnSuccessMetadata) => {
      try {
        await exchangeTokenHook.mutate({
          publicToken: public_token,
          institutionId: metadata.institution?.institution_id,
          institutionName: metadata.institution?.name,
        });

        // Show temporary success message
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      } catch (error) {
        console.error("Error linking account", error);
        setErrorMessage(toErrorMessage(error));
      } finally {
        resetStates();
      }
    },
    [exchangeTokenHook, resetStates, toErrorMessage],
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
  const accountsLoading = accounts === undefined;
  const isDisabled =
    isLoading || accountsLoading || linkOpen || (!!token && !ready);
  const defaultText = linkOpen
    ? t("connecting")
    : accounts && accounts.length > 0
      ? t("connectAnother")
      : t("connectFirst");
  const displayText = buttonText ?? defaultText;

  // Show success state if needed
  if (showSuccess) {
    return (
      <Button
        variant="outline"
        className="flex items-center gap-2 text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
      >
        <CheckCircle2 className="h-4 w-4" />
        {t("connected")}
      </Button>
    );
  }

  const button = (
    <Button
      onClick={handleConnectBank}
      disabled={isDisabled}
      variant={variant}
      className="flex items-center gap-2"
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {!isLoading && showIcon && <Plus className="h-4 w-4" />}
      {displayText}
    </Button>
  );

  // The layout only changes while there is an error to show
  if (!errorMessage) return button;

  return (
    <div className="flex flex-col items-center gap-1">
      {button}
      <p role="alert" className="max-w-xs text-xs text-destructive">
        {errorMessage}
      </p>
    </div>
  );
}
