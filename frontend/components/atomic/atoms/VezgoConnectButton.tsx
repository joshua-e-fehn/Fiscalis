"use client";

/**
 * VezgoConnectButton Component
 *
 * A button component that initiates the Vezgo Connect flow to link
 * crypto exchanges, wallets, or blockchain addresses.
 *
 * Features:
 * - Uses Vezgo SDK's native connect() method (handles OAuth automatically)
 * - Handles connection callbacks
 * - Shows loading states
 * - Customizable appearance and behavior
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/shadcn/button";
import { useVezgoNativeConnect } from "@/hooks/useVezgoNativeConnect";
import { useHandleVezgoCallback } from "@/hooks/convex/crypto";
import {
  Bitcoin,
  Loader2,
  Wallet,
  Building2,
  Link2,
  Plus,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/shadcn/tooltip";

interface VezgoConnectButtonProps {
  /**
   * Pre-select a specific provider (e.g., "coinbase", "binance")
   */
  provider?: string;
  /**
   * Callback fired on successful connection
   */
  onSuccess?: (connectionId: string, providerName?: string) => void;
  /**
   * Callback fired on error
   */
  onError?: (error: Error) => void;
  /**
   * Callback fired when connection already exists
   */
  onAlreadyExists?: (connectionId: string, providerName?: string) => void;
  /**
   * Button variant
   */
  variant?: "exchange" | "wallet" | "blockchain" | "default";
  /**
   * Button size
   */
  size?: "sm" | "default" | "lg";
  /**
   * Additional class names
   */
  className?: string;
  /**
   * Custom button text
   */
  children?: React.ReactNode;
  /**
   * Disable the button
   */
  disabled?: boolean;
}

const variantIcons = {
  exchange: Building2,
  wallet: Wallet,
  blockchain: Link2,
  default: Bitcoin,
};

const variantLabels = {
  exchange: "Connect Exchange",
  wallet: "Connect Wallet",
  blockchain: "Add Address",
  default: "Connect Crypto",
};

export function VezgoConnectButton({
  provider,
  onSuccess,
  onError,
  onAlreadyExists,
  variant = "default",
  size = "default",
  className,
  children,
  disabled = false,
}: VezgoConnectButtonProps) {
  const { handleCallback } = useHandleVezgoCallback();
  const [internalError, setInternalError] = useState<Error | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Handle the Vezgo connection result
  const handleVezgoSuccess = useCallback(
    async (accountId: string) => {
      setIsProcessing(true);
      try {
        const result = await handleCallback(accountId);
        if (result.alreadyExists) {
          onAlreadyExists?.(result.connectionId, result.providerName);
        } else {
          onSuccess?.(result.connectionId, result.providerName);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setInternalError(error);
        onError?.(error);
      } finally {
        setIsProcessing(false);
      }
    },
    [handleCallback, onSuccess, onAlreadyExists, onError],
  );

  // Use the native Vezgo connect hook
  const {
    connect,
    isConnecting,
    error: connectError,
  } = useVezgoNativeConnect({
    onSuccess: handleVezgoSuccess,
    onError: (err) => {
      setInternalError(err);
      onError?.(err);
    },
  });

  const Icon = variantIcons[variant];
  const label = children ?? variantLabels[variant];

  const isLoading = isConnecting || isProcessing;
  const error = internalError || connectError;

  const handleConnect = useCallback(() => {
    setInternalError(null);
    connect({ provider });
  }, [connect, provider]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size={size}
            className={cn(
              "gap-2",
              variant === "exchange" &&
                "hover:border-orange-500/50 hover:text-orange-500",
              variant === "wallet" &&
                "hover:border-purple-500/50 hover:text-purple-500",
              variant === "blockchain" &&
                "hover:border-blue-500/50 hover:text-blue-500",
              className,
            )}
            onClick={handleConnect}
            disabled={disabled || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : error ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
            <span>{isLoading ? "Connecting..." : label}</span>
            {!isLoading && !children && (
              <Plus className="h-3 w-3 ml-1 opacity-60" />
            )}
          </Button>
        </TooltipTrigger>
        {error && (
          <TooltipContent side="bottom" className="text-destructive">
            <p>{error.message}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact version for use in cards or lists
 */
export function VezgoConnectButtonCompact({
  provider,
  onSuccess,
  onError,
  onAlreadyExists,
  className,
  disabled = false,
}: Omit<VezgoConnectButtonProps, "variant" | "size" | "children">) {
  const { handleCallback } = useHandleVezgoCallback();
  const [isProcessing, setIsProcessing] = useState(false);

  // Handle the Vezgo connection result
  const handleVezgoSuccess = useCallback(
    async (accountId: string) => {
      setIsProcessing(true);
      try {
        const result = await handleCallback(accountId);
        if (result.alreadyExists) {
          onAlreadyExists?.(result.connectionId, result.providerName);
        } else {
          onSuccess?.(result.connectionId, result.providerName);
        }
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsProcessing(false);
      }
    },
    [handleCallback, onSuccess, onAlreadyExists, onError],
  );

  const { connect, isConnecting } = useVezgoNativeConnect({
    onSuccess: handleVezgoSuccess,
    onError,
  });

  const isLoading = isConnecting || isProcessing;

  const handleConnect = useCallback(() => {
    connect({ provider });
  }, [connect, provider]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", className)}
      onClick={handleConnect}
      disabled={disabled || isLoading}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Plus className="h-4 w-4" />
      )}
    </Button>
  );
}

export default VezgoConnectButton;
