import { components } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  PLAN_LIMITS,
  canAddConnection,
  planAllows,
  resolvePlan,
  type PlanFeature,
} from "../../../services/billing/plans";
import { userError } from "./userError";

/**
 * Server-side plan enforcement (ENG-199). The plan comes from the Stripe
 * component's subscriptions (written only by the verified webhook and by
 * billing.ts with the user's id from the auth token) and from planGrants;
 * services/billing/plans.ts holds the rules.
 *
 * Actions call these through the internal queries in billing.ts.
 */

type DbCtx = QueryCtx | MutationCtx;

/** The user's plan, where it comes from, and the subscription behind it. */
export async function loadPlan(ctx: DbCtx, userId: string) {
  const [subscriptions, grants] = await Promise.all([
    ctx.runQuery(components.stripe.public.listSubscriptionsByUserId, { userId }),
    ctx.db
      .query("planGrants")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  ]);
  return resolvePlan(subscriptions, grants, Date.now());
}

/** Provider connections that count against the plan (any status). */
export async function countConnections(ctx: DbCtx, userId: string): Promise<number> {
  const [plaid, brokers, bitpanda] = await Promise.all([
    ctx.db
      .query("plaidItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("brokerConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("bitpandaConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  ]);
  return plaid.length + brokers.length + bitpanda.length;
}

/** Throws planConnectionLimit when the user's plan has no connection left. */
export async function requireConnectionSlot(ctx: DbCtx, userId: string): Promise<void> {
  const [{ plan }, used] = await Promise.all([
    loadPlan(ctx, userId),
    countConnections(ctx, userId),
  ]);
  if (!canAddConnection(plan, used)) {
    userError("planConnectionLimit", { max: PLAN_LIMITS[plan].maxConnections ?? 0 });
  }
}

const FEATURE_ERRORS = {
  apiKeys: "planApiKeysRequirePro",
  pies: "planPiesRequirePro",
  teams: "planTeamsRequirePro",
} as const satisfies Record<PlanFeature, string>;

/** Whether the user's plan includes `feature`. */
export async function hasPlanFeature(
  ctx: DbCtx,
  userId: string,
  feature: PlanFeature,
): Promise<boolean> {
  const { plan } = await loadPlan(ctx, userId);
  return planAllows(plan, feature);
}

/** Throws the feature's "requires Pro" error when the plan lacks it. */
export async function requirePlanFeature(
  ctx: DbCtx,
  userId: string,
  feature: PlanFeature,
): Promise<void> {
  if (!(await hasPlanFeature(ctx, userId, feature))) {
    userError(FEATURE_ERRORS[feature]);
  }
}
