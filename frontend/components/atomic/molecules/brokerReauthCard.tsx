"use client";

import Image from "next/image";
import { useState } from "react";
import { useCreateConnectUrl, useHandleCallback } from "@/hooks/convex";
import { useWindowMessage } from "snaptrade-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import { Button } from "@/components/ui/shadcn/button";
import { Badge } from "@/components/ui/shadcn/badge";
import {
  AlertTriangle,
  RefreshCw,
  Loader2,
  X,
  CheckCircle2,
} from "lucide-react";
import { Doc } from "@/convex/_generated/dataModel";

interface BrokerReauthCardProps {
  connection: Doc<"brokerConnections">;
}

export function BrokerReauthCard({ connection }: BrokerReauthCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { createUrl, isLoading: isCreatingUrl, reset } = useCreateConnectUrl();
  const { handleCallback, isLoading: isProcessingCallback } =
    useHandleCallback();

  // Handle window messages from SnapTrade iframe
  const handleSuccess = async (authorizationId: string) => {
    try {
      await handleCallback(authorizationId);
      setSuccessMessage("Successfully re-authenticated!");
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccessMessage(null);
        setConnectUrl(null);
        reset();
      }, 2000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to complete callback",
      );
    }
  };

  const handleError = (errorData: {
    errorCode?: string;
    statusCode?: string;
    detail?: string;
  }) => {
    setErrorMessage(errorData.detail || "Connection failed");
  };

  const handleExit = () => {
    setIsModalOpen(false);
    setConnectUrl(null);
    setErrorMessage(null);
    reset();
  };

  // Register window message handler
  useWindowMessage({
    handleSuccess,
    handleError,
    handleExit,
    close: handleExit,
  });

  const handleReauthenticate = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Repair this connection: the server passes its SnapTrade
      // authorization ID as SnapTrade's `reconnect` parameter
      const result = await createUrl({ connectionId: connection._id });

      if (result?.connectUrl) {
        setConnectUrl(result.connectUrl);
        setIsModalOpen(true);
      } else {
        setErrorMessage("Failed to create reconnection URL");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to start reconnection",
      );
    }
  };

  return (
    <>
      <Card className="mb-4 border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-900/10">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {connection.brokerLogo ? (
                <Image
                  src={connection.brokerLogo}
                  alt={connection.brokerName || "Broker"}
                  width={40}
                  height={40}
                  unoptimized
                  loading="eager"
                  className="h-10 w-10 rounded-lg object-contain"
                />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
              )}
              <div>
                <CardTitle className="text-base">
                  {connection.brokerName || "Unknown Broker"}
                </CardTitle>
                <CardDescription className="text-xs">
                  Connection needs attention
                </CardDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-yellow-500 text-yellow-600"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              Re-auth Required
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              This connection has expired or needs to be re-authenticated.
              Please reconnect to continue syncing your data.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReauthenticate}
              disabled={isCreatingUrl}
              className="ml-4 shrink-0"
            >
              {isCreatingUrl ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reconnect
                </>
              )}
            </Button>
          </div>

          {errorMessage && !isModalOpen && (
            <div className="mt-3 p-2 bg-destructive/10 text-destructive text-sm rounded-md">
              {errorMessage}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Re-authentication Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px] h-[700px] flex flex-col p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Reconnect {connection.brokerName || "Broker"}
            </DialogTitle>
            <DialogDescription>
              Re-authenticate your connection to continue syncing data.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 px-6 pb-6 relative">
            {successMessage ? (
              <div className="flex flex-col items-center justify-center h-full">
                <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                <p className="text-lg font-medium text-green-700 dark:text-green-400">
                  {successMessage}
                </p>
              </div>
            ) : isProcessingCallback ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">
                  Completing re-authentication...
                </p>
              </div>
            ) : errorMessage ? (
              <div className="flex flex-col items-center justify-center h-full">
                <X className="h-16 w-16 text-destructive mb-4" />
                <p className="text-lg font-medium text-destructive mb-2">
                  Connection Failed
                </p>
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  {errorMessage}
                </p>
                <Button
                  variant="outline"
                  onClick={handleReauthenticate}
                  className="mt-4"
                >
                  Try Again
                </Button>
              </div>
            ) : connectUrl ? (
              <iframe
                src={connectUrl}
                className="w-full h-full border-0 rounded-lg"
                allow="camera *"
                title="SnapTrade Reconnection"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
