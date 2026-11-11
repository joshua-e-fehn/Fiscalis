import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { computeNetWorth } from "./lib/netWorth";
import {
  MAX_ACTIVE_API_KEYS_PER_USER,
  apiKeyDisplayPrefix,
  computeApiKeyExpiry,
  consumeRateLimit,
  generateApiKey,
  hashApiKey,
  isApiKeyUsable,
  normalizeApiKeyName,
} from "../../services/apiKeys/apiKeyService";
import { roundMoney } from "../../services/finance/financeService";
import { netWorthApiBreakdown } from "../../services/portfolio/aggregate";

/**
 * API keys for the public, user-scoped REST API (see convex/http.ts).
 *
 * - Keys are created in an action so the secret comes from the runtime CSPRNG,
 *   not the seeded PRNG of queries/mutations.
 * - Only `keyHash` (SHA-256) is persisted; the plaintext leaves the server once,
 *   as the return value of `create`.
 * - Every public function derives the user from the Clerk identity; no
 *   function accepts a userId from the client.
 */

const expiresInDaysValidator = v.union(
  v.literal(30),
  v.literal(90),
  v.literal(365),
  v.null(),
);

// ═══════════════════════════════════════════════════════════════
// USER-FACING (Clerk-authenticated)
// ═══════════════════════════════════════════════════════════════

/**
 * Create a key for the signed-in user. Returns the plaintext key — the only
 * time it is ever available.
 */
export const create = action({
  args: { name: v.string(), expiresInDays: expiresInDaysValidator },
  returns: v.object({
    id: v.id("apiKeys"),
    key: v.string(),
    keyPrefix: v.string(),
  }),
  handler: async (
    ctx,
    { name, expiresInDays },
  ): Promise<{ id: Id<"apiKeys">; key: string; keyPrefix: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    let normalizedName: string;
    try {
      normalizedName = normalizeApiKeyName(name);
    } catch (err) {
      // ConvexError so the message survives prod error redaction.
      throw new ConvexError((err as Error).message);
    }

    const key = generateApiKey();
    const keyPrefix = apiKeyDisplayPrefix(key);
    const id: Id<"apiKeys"> = await ctx.runMutation(internal.apiKeys.insert, {
      userId: identity.subject,
      name: normalizedName,
      keyHash: await hashApiKey(key),
      keyPrefix,
      expiresInDays,
    });
    return { id, key, keyPrefix };
  },
});

/** The signed-in user's keys, without hashes or limiter state. */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("apiKeys"),
      name: v.string(),
      keyPrefix: v.string(),
      scopes: v.array(v.literal("networth:read")),
      createdAt: v.number(),
      expiresAt: v.optional(v.number()),
      revokedAt: v.optional(v.number()),
      lastUsedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();

    return keys.map((k) => ({
      _id: k._id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
      revokedAt: k.revokedAt,
      lastUsedAt: k.lastUsedAt,
    }));
  },
});

/** Revoke one of the signed-in user's keys. Takes effect on the next request. */
export const revoke = mutation({
  args: { keyId: v.id("apiKeys") },
  returns: v.null(),
  handler: async (ctx, { keyId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const key = await ctx.db.get(keyId);
    // Same error whether the key is missing or someone else's: no ownership oracle.
    if (!key || key.userId !== identity.subject) {
      throw new ConvexError("API key not found");
    }
    if (key.revokedAt === undefined) {
      await ctx.db.patch(keyId, { revokedAt: Date.now() });
    }
    return null;
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL
// ═══════════════════════════════════════════════════════════════

export const insert = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    expiresInDays: expiresInDaysValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const active = existing.filter((k) =>
      isApiKeyUsable(k, "networth:read", now),
    );
    if (active.length >= MAX_ACTIVE_API_KEYS_PER_USER) {
      throw new ConvexError(
        `You can have at most ${MAX_ACTIVE_API_KEYS_PER_USER} active API keys. Revoke one first.`,
      );
    }

    return await ctx.db.insert("apiKeys", {
      userId: args.userId,
      name: args.name,
      keyHash: args.keyHash,
      keyPrefix: args.keyPrefix,
      scopes: ["networth:read"],
      createdAt: now,
      expiresAt: computeApiKeyExpiry(now, args.expiresInDays),
    });
  },
});

/**
 * Authenticate a key hash, apply the per-key rate limit, record usage and
 * return the owner's net worth — all in one transaction, so a revoke that
 * commits first is always honoured.
 */
export const readNetWorthWithKey = internalMutation({
  args: { keyHash: v.string() },
  handler: async (ctx, { keyHash }) => {
    const now = Date.now();
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", keyHash))
      .unique();

    if (!key || !isApiKeyUsable(key, "networth:read", now)) {
      return { status: "unauthorized" as const };
    }

    const limit = consumeRateLimit(
      { windowStart: key.rateWindowStart, windowCount: key.rateWindowCount },
      now,
    );
    if (!limit.allowed) {
      return {
        status: "rate_limited" as const,
        retryAfterSeconds: limit.retryAfterSeconds,
      };
    }
    await ctx.db.patch(key._id, {
      lastUsedAt: now,
      rateWindowStart: limit.windowStart,
      rateWindowCount: limit.windowCount,
    });

    const { netWorth, totalAssets, totalLiabilities, asOf, byCategory } =
      await computeNetWorth(ctx, key.userId);

    return {
      status: "ok" as const,
      body: {
        object: "net_worth" as const,
        netWorth: roundMoney(netWorth),
        totalAssets: roundMoney(totalAssets),
        totalLiabilities: roundMoney(totalLiabilities),
        currency: "EUR" as const,
        // When the request was served; dataAsOf says how fresh the data is
        asOf: new Date(now).toISOString(),
        dataAsOf: asOf === null ? null : new Date(asOf).toISOString(),
        categories: netWorthApiBreakdown({ byCategory }),
      },
    };
  },
});
