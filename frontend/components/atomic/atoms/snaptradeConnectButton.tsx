"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/shadcn/button";
import { Loader2, CheckCircle2, TrendingUp, Plus } from "lucide-react";
import { useSnaptradeConnect, useBrokerConnections } from "@/hooks/convex";

// Use the window message hook from snaptrade-react for handling messages
import { useWindowMessage } from "snaptrade-react";

interface SnaptradeConnectButtonProps {
  /** Optional: Pre-select a specific broker by slug */
  broker?: string;
  /** Optional: Custom button text */
  buttonText?: string;
  /** Optional: Variant for different button styles */
  variant?: "default" | "outline" | "ghost" | "secondary";
  /** Optional: Size of the button */
  size?: "default" | "sm" | "lg" | "icon";
  /** Optional: Whether to show the Plus icon (default: true) */
  showIcon?: boolean;
  /** Optional: Callback when connection is successful */
  onSuccess?: (connectionId: string, brokerName: string) => void;
  /** Optional: Callback when connection fails */
  onError?: (error: Error) => void;
}

export function SnaptradeConnectButton({
  broker,
  buttonText,
  variant = "default",
  size = "default",
  showIcon = true,
  onSuccess,
  onError,
}: SnaptradeConnectButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const connections = useBrokerConnections();
  const { connectUrl, isLoading, startConnect, completeConnect, reset } =
    useSnaptradeConnect();

  // Handle successful connection from SnapTrade
  const handleSuccess = useCallback(
    async (authorizationId: string) => {
      setIsProcessing(true);
      try {
        const result = await completeConnect(authorizationId);
        setIsModalOpen(false);

        // Show success message briefly
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);

        onSuccess?.(result.connectionId, result.brokerName || "Broker");
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to complete connection";
        console.error("SnapTrade connection error:", errorMsg);
        onError?.(err instanceof Error ? err : new Error(errorMsg));
        setIsModalOpen(false);
      } finally {
        setIsProcessing(false);
      }
    },
    [completeConnect, onSuccess, onError],
  );

  // Handle error from SnapTrade
  const handleError = useCallback(
    (errorData: {
      errorCode?: string;
      statusCode?: string;
      detail?: string;
    }) => {
      const errorMsg =
        errorData.detail ||
        `Connection failed (${errorData.errorCode || "unknown"})`;
      console.error("SnapTrade error:", errorMsg);
      onError?.(new Error(errorMsg));
      setIsModalOpen(false);
    },
    [onError],
  );

  // Handle user closing the modal (via SnapTrade's X button)
  const handleExit = useCallback(() => {
    setIsModalOpen(false);
    setIsProcessing(false);
    reset();
  }, [reset]);

  // Set up window message listener for SnapTrade iframe
  useWindowMessage({
    handleSuccess,
    handleError,
    handleExit,
    close: handleExit,
  });

  // Handle opening the connect modal
  const handleConnectBroker = useCallback(async () => {
    try {
      await startConnect({ broker });
      setIsModalOpen(true);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to start connection";
      console.error("Failed to start SnapTrade connection:", errorMsg);
      onError?.(err instanceof Error ? err : new Error(errorMsg));
    }
  }, [startConnect, broker, onError]);

  // Determine button state
  const connectionsLoading = connections === undefined;
  const isDisabled = isLoading || connectionsLoading || isModalOpen;
  const hasConnections = connections && connections.length > 0;

  // Default button text based on state
  const defaultButtonText = hasConnections
    ? "Connect Another Broker"
    : "Connect Your Broker";
  const displayText = buttonText || defaultButtonText;

  // Show success state
  if (showSuccess) {
    return (
      <Button
        variant="outline"
        size={size}
        className="flex items-center gap-2 text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
      >
        <CheckCircle2 className="h-4 w-4" />
        Broker Connected!
      </Button>
    );
  }

  return (
    <>
      <Button
        onClick={handleConnectBroker}
        disabled={isDisabled}
        variant={variant}
        size={size}
        className="flex items-center gap-2"
      >
        {isLoading || isModalOpen ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : showIcon ? (
          <Plus className="h-4 w-4" />
        ) : null}
        {isLoading
          ? "Preparing..."
          : isModalOpen
            ? "Connecting..."
            : displayText}
      </Button>

      {/* SnapTrade Connection Portal - Full screen overlay like Plaid */}
      {isModalOpen && connectUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          {isProcessing ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-3xl shadow-2xl">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">
                Connecting your broker account...
              </p>
            </div>
          ) : (
            <div
              className="bg-white rounded-3xl overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] ring-1 ring-black/5 p-4"
              style={{
                width: "min(400px, calc(100vw - 32px))",
                height: "min(680px, calc(100vh - 32px))",
              }}
            >
              <iframe
                ref={iframeRef}
                id="snaptrade-connection-portal"
                src={connectUrl}
                title="SnapTrade Connection Portal"
                className="w-full h-full border-0 rounded-2xl"
                allow="clipboard-write"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
