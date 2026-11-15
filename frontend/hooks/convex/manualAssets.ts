import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";

/**
 * Manual assets (convex/manualAssets.ts): property, vehicles, private
 * equity, collectibles and the rest no provider reports. Their values in
 * net worth and the category pages come from the shared loader
 * (portfolio.getUnifiedPositions, categories.get*); these hooks read one
 * asset for the edit form and write them.
 */

/** One manual asset for the edit form; undefined while loading or skipped. */
export function useManualAsset(assetId: Id<"manualAssets"> | undefined) {
  return useQuery(api.manualAssets.get, assetId ? { assetId } : "skip");
}

export function useCreateManualAsset() {
  return useMutation(api.manualAssets.create);
}

export function useUpdateManualAsset() {
  return useMutation(api.manualAssets.update);
}

export function useRemoveManualAsset() {
  return useMutation(api.manualAssets.remove);
}
