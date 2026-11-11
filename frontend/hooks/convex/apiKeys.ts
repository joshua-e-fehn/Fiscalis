import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";

/** The signed-in user's API keys (never includes secrets or hashes). */
export function useApiKeys() {
  return useQuery(api.apiKeys.list);
}

/** Create an API key. The returned `key` is shown once and never again. */
export function useCreateApiKey() {
  return useAction(api.apiKeys.create);
}

/** Revoke one of the signed-in user's API keys. */
export function useRevokeApiKey() {
  return useMutation(api.apiKeys.revoke);
}

/**
 * Public URL of the net worth endpoint. Convex serves HTTP actions from the
 * `.convex.site` twin of the deployment's `.convex.cloud` URL; local or
 * self-hosted backends must set NEXT_PUBLIC_CONVEX_SITE_URL explicitly.
 * Returns null rather than guessing a wrong URL.
 */
export function netWorthEndpointUrl(): string | null {
  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (siteUrl) return `${siteUrl.replace(/\/$/, "")}/api/v1/net-worth`;

  const cloudUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const match = cloudUrl?.match(/^(https:\/\/[^/]+)\.convex\.cloud\/?$/);
  return match ? `${match[1]}.convex.site/api/v1/net-worth` : null;
}

/** User-facing message from a Convex call error. */
export function apiKeyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") {
    return err.data;
  }
  return fallback;
}
