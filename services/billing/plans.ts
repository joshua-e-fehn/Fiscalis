/**
 * Plans and limits (ENG-199): every user is on Free or Pro. Pro comes from
 * an active Stripe subscription (the @convex-dev/stripe component's tables,
 * frontend/convex/billing.ts) or from a plan grant (planGrants: the
 * grandfathered first users, complimentary accounts). Limits are enforced
 * server-side in frontend/convex/lib/plan.ts; the app only displays them.
 *
 * Prices are placeholders until the owner finalises them; the amounts here
 * are for display only, Stripe charges the Price objects named by the
 * STRIPE_PRICE_PRO_* env vars.
 *
 * Framework-free: imported by Convex functions, the app and vitest.
 */

export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Gated features, beyond the connection count. */
export type PlanFeature = "apiKeys" | "pies";

export interface PlanLimits {
  /** Provider connections (bank, broker and crypto links); null = unlimited. */
  maxConnections: number | null;
  /** Public REST API keys (Settings > API Keys). */
  apiKeys: boolean;
  /** Portfolio > Investment Strategies > Pies. */
  pies: boolean;
}

export const PLAN_LIMITS: Readonly<Record<Plan, PlanLimits>> = {
  free: { maxConnections: 2, apiKeys: false, pies: false },
  pro: { maxConnections: null, apiKeys: true, pies: true },
};

/** Display prices of Pro (placeholders, see the file comment). */
export const PRO_PRICES: Readonly<
  Record<BillingInterval, { amount: number; currency: "EUR" }>
> = {
  month: { amount: 6, currency: "EUR" },
  year: { amount: 60, currency: "EUR" },
};

/** The Convex env var holding the Stripe Price id of each interval. */
export const PRICE_ENV_VARS: Readonly<Record<BillingInterval, string>> = {
  month: "STRIPE_PRICE_PRO_MONTHLY",
  year: "STRIPE_PRICE_PRO_YEARLY",
};

/**
 * Subscription statuses that keep Pro. past_due keeps it while Stripe
 * retries the payment (Smart Retries); once Stripe gives up the
 * subscription becomes canceled or unpaid and the user drops to Free.
 */
const PRO_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);

export function isProSubscriptionStatus(status: string): boolean {
  return PRO_STATUSES.has(status);
}

export interface SubscriptionLike {
  status: string;
  /** Unix seconds (Stripe's unit). */
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  priceId: string;
}

export interface PlanGrantLike {
  plan: Plan;
  /** Epoch ms; absent = no end. */
  expiresAt?: number;
}

export type PlanSource = "subscription" | "grant" | "default";

export interface ResolvedPlan<S extends SubscriptionLike = SubscriptionLike> {
  plan: Plan;
  source: PlanSource;
  /** The subscription that gives Pro, else the newest one (for display). */
  subscription: S | null;
}

/**
 * The user's plan: a Pro subscription wins (it is what the user pays for
 * and manages), then an unexpired grant, then Free.
 */
export function resolvePlan<S extends SubscriptionLike>(
  subscriptions: readonly S[],
  grants: readonly PlanGrantLike[],
  nowMs: number,
): ResolvedPlan<S> {
  const byPeriodEnd = [...subscriptions].sort(
    (a, b) => b.currentPeriodEnd - a.currentPeriodEnd,
  );
  const paying = byPeriodEnd.find((s) => isProSubscriptionStatus(s.status));
  if (paying) return { plan: "pro", source: "subscription", subscription: paying };

  const latest = byPeriodEnd[0] ?? null;
  const granted = grants.some(
    (g) => g.plan === "pro" && (g.expiresAt === undefined || g.expiresAt > nowMs),
  );
  if (granted) return { plan: "pro", source: "grant", subscription: latest };
  return { plan: "free", source: "default", subscription: latest };
}

/** Whether `plan` may use `feature`. */
export function planAllows(plan: Plan, feature: PlanFeature): boolean {
  return PLAN_LIMITS[plan][feature];
}

/** Whether a user on `plan` with `used` connections may add another. */
export function canAddConnection(plan: Plan, used: number): boolean {
  const max = PLAN_LIMITS[plan].maxConnections;
  return max === null || used < max;
}

/** The billing interval of a Stripe Price id, from the configured ids. */
export function intervalOfPrice(
  priceId: string,
  configured: Partial<Record<BillingInterval, string | undefined>>,
): BillingInterval | null {
  for (const interval of BILLING_INTERVALS) {
    if (configured[interval] && configured[interval] === priceId) return interval;
  }
  return null;
}

/** Where Stripe sends the user back to: an absolute URL under `siteUrl`. */
export function billingReturnUrl(
  siteUrl: string | undefined,
  path: string,
): string | null {
  // A site-relative path only: "//host" or "https://host" would leave the site
  if (!siteUrl || !path.startsWith("/") || path.startsWith("//")) return null;
  let base: URL;
  try {
    base = new URL(siteUrl);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.hostname !== "localhost") return null;
  return new URL(path, base.origin).toString();
}

export interface UsageRow {
  key: "connections" | "apiKeys" | "pies";
  used: number;
  /** null = unlimited; 0 = not on this plan. */
  limit: number | null;
}

/** The Settings > Limits table: usage against the plan's limits. */
export function usageRows(
  plan: Plan,
  used: { connections: number; apiKeys: number; pies: number },
): UsageRow[] {
  const limits = PLAN_LIMITS[plan];
  return [
    { key: "connections", used: used.connections, limit: limits.maxConnections },
    { key: "apiKeys", used: used.apiKeys, limit: limits.apiKeys ? null : 0 },
    { key: "pies", used: used.pies, limit: limits.pies ? null : 0 },
  ];
}

/** Share of a limit used, 0..1, or null when unlimited or not on the plan. */
export function usageShare(row: UsageRow): number | null {
  if (row.limit === null || row.limit === 0) return null;
  return Math.min(1, row.used / row.limit);
}
