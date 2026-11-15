import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getUserId } from "./lib/auth";
import { loadHoldings, type LoadedHolding } from "./lib/netWorth";
import { readableTeamMembers } from "./lib/teams";
import { aggregateNetWorth } from "../../services/portfolio/aggregate";
import { combineSnapshotSeries } from "../../services/teams/teamSnapshots";
import { overviewView, unifiedPositionsView, type UnifiedPosition } from "./portfolio";
import { cashHoldingsView, categoryPositionsView, liabilitiesView } from "./categories";
import { snapshotsOf } from "./portfolioSnapshots";

/**
 * Team workspace reads (ENG-197, docs/adr/0002-teams.md): the dashboard,
 * category, positions and snapshot views over the holdings of a team's
 * sharing members, through the same loader and views as the personal
 * queries (lib/netWorth.ts loadHoldings, portfolio.ts, categories.ts,
 * portfolioSnapshots.ts). Read-only: every row names its owner and
 * carries no edit handle; mutations keep their owner checks.
 *
 * lib/teams.ts readableTeamMembers throws teamNotFound unless the caller
 * is a member, so a non-member reads nothing. Null when signed out.
 */

/** Whose a row is: the member's id in the team and the name others see. */
export interface RowOwner {
  memberId: Id<"teamMembers">;
  displayName: string | null;
  isMe: boolean;
}

interface LoadedTeam {
  team: { _id: Id<"teams">; name: string };
  userIds: string[];
  perMember: { owner: RowOwner; userId: string; holdings: LoadedHolding[] }[];
  holdings: LoadedHolding[];
  /** Owner of a row by its document's userId */
  byUser: Map<string, RowOwner>;
  /** Owner of a row by its holding id (LoadedHolding.id) */
  byHolding: Map<string, RowOwner>;
}

async function loadTeam(ctx: QueryCtx, teamId: Id<"teams">): Promise<LoadedTeam | null> {
  const viewerId = await getUserId(ctx);
  if (!viewerId) return null;
  const { team, members } = await readableTeamMembers(ctx, viewerId, teamId);
  const perMember = await Promise.all(
    members.map(async (m) => ({
      owner: { memberId: m._id, displayName: m.displayName, isMe: m.userId === viewerId },
      userId: m.userId,
      holdings: await loadHoldings(ctx, m.userId),
    })),
  );
  const byUser = new Map(perMember.map((p) => [p.userId, p.owner]));
  const byHolding = new Map(
    perMember.flatMap((p) => p.holdings.map((h) => [h.id as string, p.owner] as const)),
  );
  return {
    team: { _id: team._id, name: team.name },
    userIds: perMember.map((p) => p.userId),
    perMember,
    holdings: perMember.flatMap((p) => p.holdings),
    byUser,
    byHolding,
  };
}

const teamArgs = { teamId: v.id("teams") };

function byUserId<T extends { userId: string }>(team: LoadedTeam, rows: T[]) {
  return rows.map((row) => ({ ...row, owner: team.byUser.get(row.userId) ?? null }));
}

function byHoldingId<T>(team: LoadedTeam, rows: T[], id: (row: T) => string) {
  return rows.map((row) => ({ ...row, owner: team.byHolding.get(id(row)) ?? null }));
}

/** No classification or valuation edits on another member's (or a team) row. */
function readOnly(position: UnifiedPosition): UnifiedPosition {
  const { classification: _classification, valuation, ...rest } = position;
  return valuation
    ? { ...rest, valuation: { kind: valuation.kind, canOverride: false } }
    : rest;
}

// ─── Dashboard ─────────────────────────────────────────────────

/** portfolio.getOverview for the team, with each sharing member's net worth. */
export const getOverview = query({
  args: teamArgs,
  handler: async (ctx, { teamId }) => {
    const team = await loadTeam(ctx, teamId);
    if (!team) return null;
    return {
      ...overviewView(aggregateNetWorth(team.holdings)),
      team: team.team,
      members: team.perMember.map((p) => ({
        ...p.owner,
        netWorth: aggregateNetWorth(p.holdings).netWorth,
      })),
    };
  },
});

/** portfolio.getUnifiedPositions for the team, each row with its owner, read-only. */
export const getUnifiedPositions = query({
  args: {
    ...teamArgs,
    limit: v.optional(v.number()),
    provider: v.optional(
      v.union(v.literal("plaid"), v.literal("snaptrade"), v.literal("bitpanda"), v.literal("manual")),
    ),
  },
  handler: async (ctx, args) => {
    const team = await loadTeam(ctx, args.teamId);
    if (!team) return [];
    const holdings = team.holdings.filter((h) => !args.provider || h.provider === args.provider);
    const positions = await unifiedPositionsView(ctx, team.userIds, holdings, args.limit);
    return byHoldingId(team, positions.map(readOnly), (p) => p._id);
  },
});

/** portfolioSnapshots.getSnapshots for the team: the members' series summed per day. */
export const getSnapshots = query({
  args: { ...teamArgs, limit: v.optional(v.number()), since: v.optional(v.number()) },
  handler: async (ctx, { teamId, limit = 365, since }) => {
    const team = await loadTeam(ctx, teamId);
    if (!team) return [];
    const series = await Promise.all(
      team.userIds.map((userId) => snapshotsOf(ctx, userId, limit, since)),
    );
    return combineSnapshotSeries(series).slice(-limit);
  },
});

// ─── Category pages ────────────────────────────────────────────

/** categories.getCashHoldings for the team, rows with their owners. */
export const getCashHoldings = query({
  args: teamArgs,
  handler: async (ctx, { teamId }) => {
    const team = await loadTeam(ctx, teamId);
    if (!team) return null;
    const view = await cashHoldingsView(
      ctx,
      team.userIds,
      team.holdings,
      aggregateNetWorth(team.holdings),
    );
    return {
      ...view,
      bankAccounts: byUserId(team, view.bankAccounts),
      brokerCash: byUserId(team, view.brokerCash),
      brokerAccountCash: byUserId(team, view.brokerAccountCash),
      manualHoldings: byHoldingId(team, view.manualHoldings, (h) => h.id),
    };
  },
});

/** categories.getLiabilities for the team, rows with their owners. */
export const getLiabilities = query({
  args: teamArgs,
  handler: async (ctx, { teamId }) => {
    const team = await loadTeam(ctx, teamId);
    if (!team) return null;
    const view = liabilitiesView(team.holdings, aggregateNetWorth(team.holdings));
    return { ...view, rows: byHoldingId(team, view.rows, (r) => r.id) };
  },
});

/** categories.getEquities / getBonds / ... for the team, rows with their owners. */
export const getCategoryPositions = query({
  args: {
    ...teamArgs,
    category: v.union(
      v.literal("equities"),
      v.literal("bonds"),
      v.literal("crypto"),
      v.literal("commodities"),
      v.literal("real-estate"),
      v.literal("collectibles"),
    ),
  },
  handler: async (ctx, { teamId, category }) => {
    const team = await loadTeam(ctx, teamId);
    if (!team) return null;
    const view = await categoryPositionsView(
      ctx,
      team.holdings,
      aggregateNetWorth(team.holdings),
      category,
    );
    return {
      ...view,
      positions: byUserId(team, view.positions),
      manualHoldings: byHoldingId(team, view.manualHoldings, (h) => h.id),
    };
  },
});
