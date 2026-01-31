import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ═══════════════════════════════════════════════════════════════
// ONBOARDING QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get the current user's onboarding progress
 */
export const getOnboardingProgress = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return progress;
  },
});

/**
 * Check if user has completed onboarding
 */
export const hasCompletedOnboarding = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const userId = identity.subject;

    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return progress?.onboardingCompleted ?? false;
  },
});

/**
 * Get user settings for profile step
 */
export const getUserSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return settings;
  },
});

/**
 * Get connection counts for summary
 */
export const getConnectionSummary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        bankingCount: 0,
        brokerCount: 0,
        cryptoCount: 0,
      };
    }

    const userId = identity.subject;

    // Count Plaid accounts (banking)
    const plaidAccounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Count broker connections
    const brokerConnections = await ctx.db
      .query("brokerConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "connected"))
      .collect();

    // Count Vezgo connections (crypto)
    const vezgoConnections = await ctx.db
      .query("vezgoConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    return {
      bankingCount: plaidAccounts.length,
      brokerCount: brokerConnections.length,
      cryptoCount: vezgoConnections.length,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// ONBOARDING MUTATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize onboarding progress for new user
 */
export const initializeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const now = Date.now();

    // Check if already exists
    const existing = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      return existing._id;
    }

    // Create new progress record
    const id = await ctx.db.insert("onboardingProgress", {
      userId,
      currentStep: 1,
      completedSteps: [],
      skippedSteps: [],
      profileCompleted: false,
      bankingConnected: false,
      brokersConnected: false,
      cryptoConnected: false,
      onboardingCompleted: false,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Update current step and mark previous as completed
 */
export const updateOnboardingStep = mutation({
  args: {
    step: v.number(),
    markPreviousCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const now = Date.now();

    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!progress) throw new Error("Onboarding not initialized");

    const updates: Partial<{
      currentStep: number;
      completedSteps: number[];
      updatedAt: number;
    }> = {
      currentStep: args.step,
      updatedAt: now,
    };

    // Mark previous step as completed if requested
    if (args.markPreviousCompleted && args.step > 1) {
      const prevStep = args.step - 1;
      if (!progress.completedSteps.includes(prevStep)) {
        updates.completedSteps = [...progress.completedSteps, prevStep];
      }
    }

    await ctx.db.patch(progress._id, updates);
    return progress._id;
  },
});

/**
 * Skip a step
 */
export const skipStep = mutation({
  args: {
    step: v.number(),
    nextStep: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const now = Date.now();

    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!progress) throw new Error("Onboarding not initialized");

    const skippedSteps = progress.skippedSteps.includes(args.step)
      ? progress.skippedSteps
      : [...progress.skippedSteps, args.step];

    await ctx.db.patch(progress._id, {
      currentStep: args.nextStep,
      skippedSteps,
      updatedAt: now,
    });

    return progress._id;
  },
});

/**
 * Mark profile setup as completed
 */
export const completeProfileStep = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const now = Date.now();

    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!progress) throw new Error("Onboarding not initialized");

    const completedSteps = progress.completedSteps.includes(2)
      ? progress.completedSteps
      : [...progress.completedSteps, 2];

    await ctx.db.patch(progress._id, {
      profileCompleted: true,
      completedSteps,
      updatedAt: now,
    });

    return progress._id;
  },
});

/**
 * Update connection status
 */
export const updateConnectionStatus = mutation({
  args: {
    connectionType: v.union(
      v.literal("banking"),
      v.literal("brokers"),
      v.literal("crypto"),
    ),
    connected: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const now = Date.now();

    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!progress) throw new Error("Onboarding not initialized");

    const updateField = `${args.connectionType}Connected` as
      | "bankingConnected"
      | "brokersConnected"
      | "cryptoConnected";

    const stepMap = {
      banking: 3,
      brokers: 4,
      crypto: 5,
    };

    const step = stepMap[args.connectionType];
    const completedSteps =
      args.connected && !progress.completedSteps.includes(step)
        ? [...progress.completedSteps, step]
        : progress.completedSteps;

    await ctx.db.patch(progress._id, {
      [updateField]: args.connected,
      completedSteps,
      updatedAt: now,
    });

    return progress._id;
  },
});

/**
 * Complete onboarding
 */
export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const now = Date.now();

    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!progress) throw new Error("Onboarding not initialized");

    await ctx.db.patch(progress._id, {
      onboardingCompleted: true,
      completedAt: now,
      currentStep: 6,
      completedSteps: [...new Set([...progress.completedSteps, 6])],
      updatedAt: now,
    });

    return progress._id;
  },
});

/**
 * Save user settings (used in profile step)
 */
export const saveUserSettings = mutation({
  args: {
    displayName: v.optional(v.string()),
    defaultCurrency: v.string(),
    language: v.optional(v.string()),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const now = Date.now();

    // Check if settings exist
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: args.displayName,
        defaultCurrency: args.defaultCurrency,
        language: args.language,
        theme: args.theme,
        updatedAt: now,
      });
      return existing._id;
    } else {
      const id = await ctx.db.insert("userSettings", {
        userId,
        displayName: args.displayName,
        defaultCurrency: args.defaultCurrency,
        language: args.language,
        theme: args.theme,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    }
  },
});
