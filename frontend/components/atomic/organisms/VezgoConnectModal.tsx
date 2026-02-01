"use client";

/**
 * VezgoConnectModal Component
 *
 * A modal that displays the Vezgo Connect widget in an iframe,
 * with a blurred background similar to Plaid/SnapTrade modals.
 */

import { useEffect, useState, useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface VezgoConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectUrl: string;
  connectToken: string;
  onSuccess: (accountId: string) => void;
  onError: (error: string) => void;
}

export function VezgoConnectModal({
  isOpen,
  onClose,
  connectUrl,
  connectToken,
  onSuccess,
  onError,
}: VezgoConnectModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build the full URL with token
  const fullUrl = `${connectUrl}&token=${connectToken}`;

  // Debug: log the URL being used and parse redirect_uri
  useEffect(() => {
    if (isOpen && connectUrl && connectToken) {
      console.log("Vezgo Connect URL:", fullUrl);
      try {
        const url = new URL(connectUrl);
        console.log(
          "Vezgo redirect_uri in URL:",
          url.searchParams.get("redirect_uri"),
        );
      } catch (e) {
        console.log("Could not parse URL");
      }
    }
  }, [isOpen, connectUrl, connectToken, fullUrl]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
    }
  }, [isOpen]);

  // Listen for messages from the Vezgo iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Vezgo Connect sends messages from connect.vezgo.com
      if (!event.origin.includes("vezgo.com")) return;

      const { data } = event;

      console.log("Vezgo message:", data);

      // Any message from Vezgo means it's loaded
      setIsLoading(false);

      // Handle different message types from Vezgo
      if (data?.type === "close" || data?.event === "close") {
        onClose();
      } else if (data?.type === "success" || data?.account || data?.accountId) {
        const accountId = data?.accountId || data?.account?.id || data?.account;
        if (accountId) {
          onSuccess(accountId);
        }
      } else if (data?.type === "error" || data?.error) {
        onError(data?.error?.message || data?.error || "Connection failed");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onClose, onSuccess, onError]);

  // Handle iframe load event
  const handleIframeLoad = () => {
    // Give Vezgo a moment to initialize, then hide loading
    setTimeout(() => setIsLoading(false), 500);
  };

  if (!isOpen) return null;

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogPrimitive.Portal>
        {/* Custom overlay with blur */}
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />

        {/* Dialog content */}
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]",
            "w-full max-w-[480px] rounded-xl shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "duration-200",
          )}
        >
          {/* Visually hidden title for accessibility */}
          <VisuallyHidden>
            <DialogPrimitive.Title>
              Connect Crypto Account
            </DialogPrimitive.Title>
          </VisuallyHidden>

          <div className="relative w-full h-[680px] rounded-xl overflow-hidden bg-background">
            {/* Close button */}
            <DialogPrimitive.Close
              className="absolute right-3 top-3 z-20 rounded-full p-1.5 bg-background/80 hover:bg-background opacity-70 hover:opacity-100 transition-opacity"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>

            {/* Loading state */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Loading Vezgo Connect...
                  </p>
                </div>
              </div>
            )}

            {/* Vezgo Connect iframe - using GET method with token in URL */}
            <iframe
              ref={iframeRef}
              src={fullUrl}
              className="w-full h-full border-0 rounded-xl"
              onLoad={handleIframeLoad}
              allow="clipboard-write"
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default VezgoConnectModal;
