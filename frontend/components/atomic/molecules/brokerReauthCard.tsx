"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { useErrorMessage } from "@/i18n/errors";

interface BrokerReauthCardProps {
  connection: Doc<"brokerConnections">;
}

export function BrokerReauthCard({ connection }: BrokerReauthCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const t = useTranslations("integrations.brokers");
  const tStatus = useTranslations("integrations.status");
  const tActions = useTranslations("common.actions");
  const toErrorMessage = useErrorMessage();
  const brokerName = connection.brokerName || t("connection.unknownBroker");

  const { createUrl, isLoading: isCreatingUrl, reset } = useCreateConnectUrl();
  const { handleCallback, isLoading: isProcessingCallback } =
    useHandleCallback();

  // Handle window messages from SnapTrade iframe
  const handleSuccess = async (authorizationId: string) => {
    try {
      await handleCallback(authorizationId);
      setSucceeded(true);
      setTimeout(() => {
        setIsModalOpen(false);
        setSucceeded(false);
        setConnectUrl(null);
        reset();
      }, 2000);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  };

  const handleError = (errorData: {
    errorCode?: string;
    statusCode?: string;
    detail?: string;
  }) => {
    // SnapTrade's detail is English provider text: logged, not shown
    console.error("SnapTrade error:", errorData.detail ?? errorData.errorCode);
    setErrorMessage(t("reauth.failed"));
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
    setSucceeded(false);

    try {
      // Repair this connection: the server passes its SnapTrade
      // authorization ID as SnapTrade's `reconnect` parameter
      const result = await createUrl({ connectionId: connection._id });

      if (result?.connectUrl) {
        setConnectUrl(result.connectUrl);
        setIsModalOpen(true);
      } else {
        setErrorMessage(t("reauth.failed"));
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
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
                  alt={brokerName}
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
                <CardTitle className="text-base">{brokerName}</CardTitle>
                <CardDescription className="text-xs">
                  {t("reauth.needsAttention")}
                </CardDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-yellow-500 text-yellow-600"
            >
              <AlertTriangle className="h-3 w-3 me-1" />
              {tStatus("reauthRequired")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t("reauth.description")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReauthenticate}
              disabled={isCreatingUrl}
              className="ms-4 shrink-0"
            >
              {isCreatingUrl ? (
                <>
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                  {tActions("loading")}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 me-2" />
                  {t("reauth.reconnect")}
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
              {t("reauth.dialogTitle", { name: brokerName })}
            </DialogTitle>
            <DialogDescription>
              {t("reauth.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 px-6 pb-6 relative">
            {succeeded ? (
              <div className="flex flex-col items-center justify-center h-full">
                <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                <p className="text-lg font-medium text-green-700 dark:text-green-400">
                  {t("reauth.success")}
                </p>
              </div>
            ) : isProcessingCallback ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">
                  {t("reauth.completing")}
                </p>
              </div>
            ) : errorMessage ? (
              <div className="flex flex-col items-center justify-center h-full">
                <X className="h-16 w-16 text-destructive mb-4" />
                <p className="text-lg font-medium text-destructive mb-2">
                  {t("reauth.failedTitle")}
                </p>
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  {errorMessage}
                </p>
                <Button
                  variant="outline"
                  onClick={handleReauthenticate}
                  className="mt-4"
                >
                  {tActions("retry")}
                </Button>
              </div>
            ) : connectUrl ? (
              <iframe
                src={connectUrl}
                className="w-full h-full border-0 rounded-lg"
                allow="camera *"
                title={t("reauth.portalTitle")}
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
