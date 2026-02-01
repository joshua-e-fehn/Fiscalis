"use client";

/**
 * Vezgo Connect Hook
 *
 * This hook provides a way to connect crypto accounts using a custom modal
 * with Vezgo Connect embedded in an iframe.
 *
 * The flow:
 * 1. Call getConnectUrl to get the URL and token from the server
 * 2. Open a modal with the Vezgo Connect iframe
 * 3. Handle callbacks via postMessage from the iframe
 */

import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

interface UseVezgoConnectOptions {
  onSuccess?: (accountId: string) => void;
  onError?: (error: Error) => void;
}

interface ConnectOptions {
  provider?: string;
  providers?: string[];
}

export function useVezgoConnect(options: UseVezgoConnectOptions = {}) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const getConnectUrlAction = useAction(api.actions.vezgo.getConnectUrl);

  // Start the connect flow - gets URL and opens modal
  const connect = useCallback(
    async (connectOptions?: ConnectOptions) => {
      setIsConnecting(true);
      setError(null);

      try {
        // Get connect URL and token from server
        // The redirectUri must be registered in your Vezgo dashboard
        // Origin is required for server-side SDK usage
        const baseUrl =
          typeof window !== "undefined" ? window.location.origin : "";
        const result = await getConnectUrlAction({
          provider: connectOptions?.provider,
          providers: connectOptions?.providers,
          redirectUri: baseUrl, // http://localhost:3000
          origin: baseUrl, // Required for server-side - the origin of the page
        });

        if (!result.connectUrl || !result.connectToken) {
          throw new Error("Failed to get Vezgo connect URL");
        }

        setConnectUrl(result.connectUrl);
        setConnectToken(result.connectToken);
        setIsModalOpen(true);
        setIsConnecting(false);
      } catch (err) {
        setIsConnecting(false);
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        options.onError?.(error);
      }
    },
    [getConnectUrlAction, options],
  );

  // Handle successful connection from modal
  const handleSuccess = useCallback(
    (accountId: string) => {
      setIsModalOpen(false);
      setConnectUrl(null);
      setConnectToken(null);
      options.onSuccess?.(accountId);
    },
    [options],
  );

  // Handle error from modal
  const handleError = useCallback(
    (errorMessage: string) => {
      setIsModalOpen(false);
      setConnectUrl(null);
      setConnectToken(null);
      const err = new Error(errorMessage);
      setError(err);
      options.onError?.(err);
    },
    [options],
  );

  // Handle modal close
  const handleClose = useCallback(() => {
    setIsModalOpen(false);
    setConnectUrl(null);
    setConnectToken(null);
  }, []);

  return {
    connect,
    isConnecting,
    isModalOpen,
    connectUrl,
    connectToken,
    handleSuccess,
    handleError,
    handleClose,
    error,
  };
}
