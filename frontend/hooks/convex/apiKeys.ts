import { useAction, useMutation, useQuery } from "convex/react";
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
 * `.convex.site` twin of the deployment's `.convex.cloud` URL.
 */
export function netWorthEndpointUrl(): string | null {
  const cloudUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!cloudUrl) return null;
  return `${cloudUrl.replace(/\.convex\.cloud\/?$/, ".convex.site")}/api/v1/net-worth`;
}
