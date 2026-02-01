"use client";

/**
 * Vezgo Native Connect Hook
 *
 * This hook uses the Vezgo SDK's native connect() method from the client-side,
 * which handles all the OAuth flow including redirect_uri automatically.
 *
 * We pre-create the iframe element to customize the overlay styling with a blur backdrop.
 * See: https://vezgo.com/docs/customize-connect-widget
 */

import { useState, useCallback, useRef, useEffect } from "react";
import Vezgo from "vezgo-sdk-js";

interface UseVezgoNativeConnectOptions {
  onSuccess?: (accountId: string) => void;
  onError?: (error: Error) => void;
}

interface ConnectOptions {
  provider?: string;
  providers?: string[];
}

// Inject styles for the Vezgo container
function injectStyles() {
  if (document.getElementById("vezgo-custom-styles")) return;

  const style = document.createElement("style");
  style.id = "vezgo-custom-styles";
  style.textContent = `
    #vezgo-overlay {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 99999 !important;
      display: none;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }
    
    #vezgo-overlay.visible {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    
    #vezgo-iframe-container {
      position: relative;
      width: 480px;
      max-width: 90vw;
      height: 680px;
      max-height: 90vh;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      background: hsl(240, 10%, 10%);
      overflow: hidden;
    }
    
    #vezgo-loader {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: hsl(240, 5%, 65%);
      z-index: 1;
    }
    
    #vezgo-loader.hidden {
      display: none !important;
    }
    
    #vezgo-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid hsl(240, 5%, 25%);
      border-top-color: hsl(240, 5%, 65%);
      border-radius: 50%;
      animation: vezgo-spin 1s linear infinite;
    }
    
    @keyframes vezgo-spin {
      to { transform: rotate(360deg); }
    }
    
    iframe[name='vezgo-connect-widget'] {
      width: 100% !important;
      height: 100% !important;
      border: none !important;
      border-radius: 12px !important;
      background: transparent !important;
      position: relative !important;
      z-index: 2 !important;
    }
  `;
  document.head.appendChild(style);
}

// Create the Vezgo iframe container with custom styling
function ensureVezgoContainer(): {
  overlay: HTMLDivElement;
  iframe: HTMLIFrameElement;
  loader: HTMLDivElement;
} {
  injectStyles();

  let overlay = document.getElementById(
    "vezgo-overlay",
  ) as HTMLDivElement | null;
  let iframeContainer = document.getElementById(
    "vezgo-iframe-container",
  ) as HTMLDivElement | null;
  let iframe = document.querySelector(
    "iframe[name='vezgo-connect-widget']",
  ) as HTMLIFrameElement | null;
  let loader = document.getElementById("vezgo-loader") as HTMLDivElement | null;

  if (!overlay) {
    // Create overlay (backdrop)
    overlay = document.createElement("div");
    overlay.id = "vezgo-overlay";

    // Create iframe container (the modal box)
    iframeContainer = document.createElement("div");
    iframeContainer.id = "vezgo-iframe-container";

    // Create loader inside the container
    loader = document.createElement("div");
    loader.id = "vezgo-loader";
    loader.innerHTML = `
      <div id="vezgo-spinner"></div>
      <span style="font-size: 14px;">Loading Vezgo Connect...</span>
    `;
    iframeContainer.appendChild(loader);

    // Create iframe with the special name Vezgo looks for
    iframe = document.createElement("iframe");
    iframe.name = "vezgo-connect-widget";
    iframe.setAttribute("allow", "clipboard-write");

    // Hide loader when iframe loads content
    iframe.addEventListener("load", () => {
      const loaderEl = document.getElementById("vezgo-loader");
      if (loaderEl) {
        loaderEl.classList.add("hidden");
      }
    });

    iframeContainer.appendChild(iframe);
    overlay.appendChild(iframeContainer);
    document.body.appendChild(overlay);
  }

  return {
    overlay: overlay!,
    iframe: iframe!,
    loader:
      loader || (document.getElementById("vezgo-loader") as HTMLDivElement),
  };
}

function showVezgoOverlay() {
  const overlay = document.getElementById("vezgo-overlay");
  const loader = document.getElementById("vezgo-loader");
  if (overlay) {
    overlay.classList.add("visible");
  }
  if (loader) {
    loader.classList.remove("hidden");
  }
}

function hideVezgoOverlay() {
  const overlay = document.getElementById("vezgo-overlay");
  if (overlay) {
    overlay.classList.remove("visible");
  }
}

export function useVezgoNativeConnect(
  options: UseVezgoNativeConnectOptions = {},
) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const vezgoRef = useRef<ReturnType<typeof Vezgo.init> | null>(null);

  // Initialize Vezgo SDK on mount and create custom iframe container
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_VEZGO_CLIENT_ID;

    if (!clientId) {
      console.error("NEXT_PUBLIC_VEZGO_CLIENT_ID is not set");
      return;
    }

    // Create custom container with blur backdrop
    ensureVezgoContainer();

    vezgoRef.current = Vezgo.init({
      clientId,
      authEndpoint: "/api/vezgo/auth",
    });
  }, []);

  // Start the connect flow
  const connect = useCallback(
    async (connectOptions?: ConnectOptions) => {
      if (!vezgoRef.current) {
        const err = new Error("Vezgo SDK not initialized");
        setError(err);
        options.onError?.(err);
        return;
      }

      setIsConnecting(true);
      setError(null);

      // Show overlay with loading spinner
      showVezgoOverlay();

      try {
        // Login (for client-side, loginName is optional)
        const user = vezgoRef.current.login();

        // Use the native connect() method which will use our pre-created iframe
        user
          .connect({
            provider: connectOptions?.provider,
            providers: connectOptions?.providers,
            lang: "en",
            theme: "dark",
          })
          .onConnection((account: unknown) => {
            console.log("Vezgo connected - full account object:", account);

            // Extract account ID - Vezgo may return it as 'id' or the whole object might be the ID
            const accountObj = account as
              | { id?: string; account_id?: string }
              | string;
            let accountId: string;

            if (typeof accountObj === "string") {
              accountId = accountObj;
            } else if (accountObj?.id) {
              accountId = accountObj.id;
            } else if (accountObj?.account_id) {
              accountId = accountObj.account_id;
            } else {
              console.error(
                "Vezgo: Could not extract account ID from:",
                account,
              );
              const error = new Error(
                "Failed to extract account ID from Vezgo response",
              );
              setError(error);
              options.onError?.(error);
              setIsConnecting(false);
              hideVezgoOverlay();
              return;
            }

            console.log("Vezgo account ID:", accountId);
            setIsConnecting(false);
            hideVezgoOverlay();
            options.onSuccess?.(accountId);
          })
          .onError((err: unknown) => {
            // Vezgo fires onError when user closes without connecting
            // with {error_type: 400, message: 'Connection closed'}
            // This is not a real error, just user cancellation
            const errObj = err as {
              error_type?: number;
              message?: string;
            } | null;
            const isUserCancellation =
              !err ||
              errObj?.message === "Connection closed" ||
              errObj?.message?.toLowerCase().includes("closed") ||
              errObj?.message?.toLowerCase().includes("cancelled") ||
              errObj?.message?.toLowerCase().includes("canceled");

            if (isUserCancellation) {
              console.log("Vezgo: User closed without connecting");
            } else {
              console.error("Vezgo connection error:", err);
              const error =
                err instanceof Error
                  ? err
                  : new Error(errObj?.message || String(err));
              setError(error);
              options.onError?.(error);
            }

            setIsConnecting(false);
            hideVezgoOverlay();
          })
          .onEvent((name: string, data: unknown) => {
            console.log("Vezgo event:", name, data);
            if (name === "close") {
              setIsConnecting(false);
              hideVezgoOverlay();
            }
          });
      } catch (err) {
        setIsConnecting(false);
        hideVezgoOverlay();
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        options.onError?.(error);
      }
    },
    [options],
  );

  return {
    connect,
    isConnecting,
    error,
  };
}
