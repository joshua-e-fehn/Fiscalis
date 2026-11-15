import { v } from "convex/values";
import StripeSDK from "stripe";
import { StripeSubscriptions } from "@convex-dev/stripe";
import { action, internalAction, internalQuery, query } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { getUserId, requireUserId } from "./lib/auth";
import { countConnections, loadPlan, requireConnectionSlot } from "./lib/plan";
import { enforceUserRateLimit } from "./lib/rateLimit";
import { userError } from "./lib/userError";
import {
  PRICE_ENV_VARS,
  PRO_PRICES,
  billingReturnUrl,
  intervalOfPrice,
  usageRows,
  type BillingInterval,
} from "../../services/billing/plans";
import { describeError } from "../../services/security/providerError";

/**
 * Billing (ENG-198, ENG-203): Free and Pro through the @convex-dev/stripe
 * component. Stripe state (customers, subscriptions, invoices) lives in the
 * component's tables, written by the signature-verified webhook at
 * /stripe/webhook (http.ts). Every function derives the user from the auth
 * token; the userId Stripe carries in the subscription metadata is set here
 * at checkout, never by the client.
 *
 * Env (Convex): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 * STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY, and SITE_URL (the
 * app's origin, where Checkout and the portal return to). Until they are
 * set, the Billing page shows the plan and upgrade reports
 * billingUnavailable.
 */

const stripe = new StripeSubscriptions(components.stripe, {});

const BILLING_PATH = "/settings/billing";

function configuredPrices(): Record<BillingInterval, string | undefined> {
  return {
    month: process.env[PRICE_ENV_VARS.month] || undefined,
    year: process.env[PRICE_ENV_VARS.year] || undefined,
  };
}

function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Invoices shown on the Billing page; the portal has the full history. */
const INVOICE_LIMIT = 24;

const intervalValidator = v.union(v.literal("month"), v.literal("year"));

// ═══════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════

/** The signed-in user's plan (the user menu's "Upgrade to Pro"). */
export const myPlan = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    const { plan, source } = await loadPlan(ctx, userId);
    return { plan, source };
  },
});

/** Settings > Billing: plan, subscription, recent invoices. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;

    const [{ plan, source, subscription }, customer, invoices] = await Promise.all([
      loadPlan(ctx, userId),
      ctx.runQuery(components.stripe.public.getCustomerByUserId, { userId }),
      ctx.runQuery(components.stripe.public.listInvoicesByUserId, { userId }),
    ]);
    const prices = configuredPrices();

    return {
      plan,
      source,
      subscription: subscription && {
        status: subscription.status,
        interval: intervalOfPrice(subscription.priceId, prices),
        // Stripe counts in seconds
        currentPeriodEnd: subscription.currentPeriodEnd * 1000,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      hasCustomer: customer !== null,
      checkoutAvailable:
        stripeConfigured() &&
        Boolean(prices.month || prices.year) &&
        billingReturnUrl(process.env.SITE_URL, BILLING_PATH) !== null,
      intervals: {
        month: Boolean(prices.month),
        year: Boolean(prices.year),
      },
      prices: PRO_PRICES,
      invoices: invoices
        .sort((a, b) => b.created - a.created)
        .slice(0, INVOICE_LIMIT)
        .map((invoice) => ({
          id: invoice.stripeInvoiceId,
          created: invoice.created * 1000,
          status: invoice.status,
          amountDue: invoice.amountDue / 100,
          amountPaid: invoice.amountPaid / 100,
          // The component keeps no currency; Pro is priced in EUR only
          currency: PRO_PRICES.month.currency,
        })),
    };
  },
});

/** Settings > Limits: the plan's limits and what the user uses of them. */
export const usage = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;

    const [{ plan }, connections, apiKeys] = await Promise.all([
      loadPlan(ctx, userId),
      countConnections(ctx, userId),
      ctx.db
        .query("apiKeys")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);
    const activeKeys = apiKeys.filter((k) => k.revokedAt === undefined).length;
    // Pies are not built yet (lib/config/features.ts "pies")
    return { plan, rows: usageRows(plan, { connections, apiKeys: activeKeys, pies: 0 }) };
  },
});

// ═══════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════

/** The Stripe customer of `userId`, created (once, idempotently) if needed. */
async function customerFor(
  ctx: Parameters<typeof stripe.createCustomer>[0],
  userId: string,
  identity: { email?: string; name?: string },
): Promise<string> {
  // By userId only: matching on email could hand one user another's customer
  const existing = await ctx.runQuery(components.stripe.public.getCustomerByUserId, {
    userId,
  });
  if (existing) return existing.stripeCustomerId;
  const created = await stripe.createCustomer(ctx, {
    email: identity.email,
    name: identity.name,
    metadata: { userId },
    idempotencyKey: userId,
  });
  return created.customerId;
}

/** Stripe Checkout for Pro; the client redirects to the returned URL. */
export const createCheckoutSession = action({
  args: { interval: intervalValidator },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;

    const priceId = configuredPrices()[args.interval];
    const successUrl = billingReturnUrl(process.env.SITE_URL, `${BILLING_PATH}?checkout=success`);
    const cancelUrl = billingReturnUrl(process.env.SITE_URL, `${BILLING_PATH}?checkout=canceled`);
    if (!stripeConfigured() || !priceId || !successUrl || !cancelUrl) {
      userError("billingUnavailable");
    }

    const plan = await ctx.runQuery(internal.billing.planForUser, { userId });
    if (plan.source === "subscription") userError("billingAlreadySubscribed");

    await enforceUserRateLimit(ctx, "billingSession", userId);

    try {
      const customerId = await customerFor(ctx, userId, {
        email: identity.email,
        name: identity.name,
      });
      const session = await stripe.createCheckoutSession(ctx, {
        priceId,
        customerId,
        mode: "subscription",
        successUrl,
        cancelUrl,
        metadata: { userId },
        subscriptionMetadata: { userId },
        params: { allow_promotion_codes: true, client_reference_id: userId },
      });
      if (!session.url) throw new Error("Checkout session has no URL");
      return { url: session.url };
    } catch (error) {
      console.error("Stripe checkout failed:", describeError(error));
      userError("billingProviderError");
    }
  },
});

/** Stripe Customer Portal: change or cancel the plan, payment method, invoices. */
export const createPortalSession = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx): Promise<{ url: string }> => {
    const userId = await requireUserId(ctx);
    const returnUrl = billingReturnUrl(process.env.SITE_URL, BILLING_PATH);
    if (!stripeConfigured() || !returnUrl) userError("billingUnavailable");

    const customer = await ctx.runQuery(components.stripe.public.getCustomerByUserId, {
      userId,
    });
    if (!customer) userError("billingNoCustomer");

    await enforceUserRateLimit(ctx, "billingSession", userId);

    try {
      const session = await stripe.createCustomerPortalSession(ctx, {
        customerId: customer.stripeCustomerId,
        returnUrl,
      });
      if (!session.url) throw new Error("Portal session has no URL");
      return { url: session.url };
    } catch (error) {
      console.error("Stripe portal failed:", describeError(error));
      userError("billingProviderError");
    }
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL
// ═══════════════════════════════════════════════════════════════

/** The plan of `userId`, for actions. */
export const planForUser = internalQuery({
  args: { userId: v.string() },
  returns: v.object({
    plan: v.union(v.literal("free"), v.literal("pro")),
    source: v.union(v.literal("subscription"), v.literal("grant"), v.literal("default")),
  }),
  handler: async (ctx, { userId }) => {
    const { plan, source } = await loadPlan(ctx, userId);
    return { plan, source };
  },
});

/**
 * Throws planConnectionLimit when `userId` cannot add a provider
 * connection: the connect actions call it before reaching the provider.
 */
export const assertConnectionSlot = internalQuery({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await requireConnectionSlot(ctx, userId);
    return null;
  },
});

/**
 * Account deletion (account.ts): deletes the user's Stripe customer, which
 * cancels their subscriptions at once (no further charges). The
 * customer.deleted and customer.subscription.deleted webhooks then update
 * the component's tables. Invoices stay at Stripe, which must keep them
 * for tax law. Returns failed: true when Stripe could not be reached.
 */
export const deleteStripeCustomer = internalAction({
  args: { userId: v.string() },
  returns: v.object({ failed: v.boolean() }),
  handler: async (ctx, { userId }): Promise<{ failed: boolean }> => {
    const customer = await ctx.runQuery(components.stripe.public.getCustomerByUserId, {
      userId,
    });
    if (!customer) return { failed: false };
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      console.error("Account deletion: STRIPE_SECRET_KEY is not set");
      return { failed: true };
    }
    try {
      await new StripeSDK(secret).customers.del(customer.stripeCustomerId);
      return { failed: false };
    } catch (error) {
      // Already deleted at Stripe: nothing left to cancel
      if (error instanceof StripeSDK.errors.StripeInvalidRequestError && error.code === "resource_missing") {
        return { failed: false };
      }
      console.error("Account deletion: Stripe customer not deleted:", describeError(error));
      return { failed: true };
    }
  },
});
