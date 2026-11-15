"use client";

/**
 * Workspace-aware reads (ENG-197): the dashboard, category, positions and
 * snapshot hooks call these instead of useQuery. In Personal they read the
 * user's own queries; in a team workspace the matching convex/teamViews.ts
 * query (the read-only aggregate of the team's sharing members, rows with
 * an `owner`). The other query is skipped, so only one runs. While a
 * remembered team is still resolving both are skipped (loading).
 */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWorkspaceTarget } from "@/providers/workspaceProvider";

/** Stable empty result, so consumers' memo dependencies do not churn. */
const NO_TRANSACTIONS: never[] = [];

export function useOverviewQuery() {
  const { teamId, pending } = useWorkspaceTarget();
  const personal = useQuery(api.portfolio.getOverview, teamId || pending ? "skip" : {});
  const team = useQuery(api.teamViews.getOverview, teamId ? { teamId } : "skip");
  return pending ? undefined : teamId ? team : personal;
}

type PositionsArgs = {
  limit?: number;
  provider?: "plaid" | "snaptrade" | "bitpanda" | "manual";
};

export function useUnifiedPositionsQuery(args: PositionsArgs) {
  const { teamId, pending } = useWorkspaceTarget();
  const personal = useQuery(api.portfolio.getUnifiedPositions, teamId || pending ? "skip" : args);
  const team = useQuery(
    api.teamViews.getUnifiedPositions,
    teamId ? { ...args, teamId } : "skip",
  );
  return pending ? undefined : teamId ? team : personal;
}

type SnapshotArgs = { limit?: number; since?: number };

export function useSnapshotsQuery(args: SnapshotArgs | "skip") {
  const { teamId, pending } = useWorkspaceTarget();
  const personal = useQuery(
    api.portfolioSnapshots.getSnapshots,
    teamId || pending || args === "skip" ? "skip" : args,
  );
  const team = useQuery(
    api.teamViews.getSnapshots,
    teamId && args !== "skip" ? { ...args, teamId } : "skip",
  );
  return pending ? undefined : teamId ? team : personal;
}

export function useCashHoldingsQuery() {
  const { teamId, pending } = useWorkspaceTarget();
  const personal = useQuery(api.categories.getCashHoldings, teamId || pending ? "skip" : {});
  const team = useQuery(api.teamViews.getCashHoldings, teamId ? { teamId } : "skip");
  return pending ? undefined : teamId ? team : personal;
}

export function useLiabilitiesQuery() {
  const { teamId, pending } = useWorkspaceTarget();
  const personal = useQuery(api.categories.getLiabilities, teamId || pending ? "skip" : {});
  const team = useQuery(api.teamViews.getLiabilities, teamId ? { teamId } : "skip");
  return pending ? undefined : teamId ? team : personal;
}

const CATEGORY_QUERIES = {
  equities: api.categories.getEquities,
  bonds: api.categories.getBonds,
  crypto: api.categories.getCrypto,
  commodities: api.categories.getCommodities,
  "real-estate": api.categories.getRealEstate,
  collectibles: api.categories.getCollectibles,
} as const;

export type PositionCategory = keyof typeof CATEGORY_QUERIES;

/** categories.getEquities / getBonds / ... or the team's view of the category. */
export function useCategoryPositionsQuery(category: PositionCategory) {
  const { teamId, pending } = useWorkspaceTarget();
  const personal = useQuery(CATEGORY_QUERIES[category], teamId || pending ? "skip" : {});
  const team = useQuery(
    api.teamViews.getCategoryPositions,
    teamId ? { teamId, category } : "skip",
  );
  return pending ? undefined : teamId ? team : personal;
}

/** Crypto transactions are personal only: a team workspace shows none. */
export function useCryptoTransactionsQuery(limit: number | undefined) {
  const { teamId, pending } = useWorkspaceTarget();
  const personal = useQuery(api.categories.getCryptoTransactions, teamId || pending ? "skip" : { limit });
  return pending ? undefined : teamId ? NO_TRANSACTIONS : personal;
}
