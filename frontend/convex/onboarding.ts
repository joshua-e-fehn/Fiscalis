import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { validateBirthDate } from "../lib/utils/date";
import {
  validateSettings,
  type SettingsInput,
  type SettingsPatch,
} from "../../services/settings/userSettings";

/**
 * Validate a date of birth before storing it: a real YYYY-MM-DD date, not in
 * the future, within a sane human age range. It is canonical profile data and
 * drives the derived age in the Retirement Planner. Returns the trimmed value.
 */
function assertValidBirthDate(birthDate: string): string {
  const result = validateBirthDate(birthDate);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/**
 * Validate general settings fields (services/settings/userSettings.ts):
 * display name length, currency in DISPLAY_CURRENCIES, language en/de, theme.
 */
function assertValidSettings(input: SettingsInput): SettingsPatch {
  const result = validateSettings(input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const languageValidator = v.union(v.literal("en"), v.literal("de"));
const themeValidator = v.union(
  v.literal("light"),
  v.literal("dark"),
  v.literal("system"),
);

/** The mandatory profile step (lib/types/onboarding.ts OnboardingStep.PROFILE). */
const PROFILE_STEP = 2;

/**
 * User-owned tables (each has a by_user index). A row in any of them means the
 * user already used the app (migrations:markExistingUsersOnboarded).
 */
export const USER_DATA_TABLES = [
  "userSettings",
  "plaidItems",
  "brokerConnections",
  "bitpandaConnections",
  "vaultItems",
  "loans",
  "retirementPlans",
  "portfolioSnapshots",
  "apiKeys",
  "worldBankFavorites",
] as const;

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
 * Check if user has completed onboarding. Returns null when the request is
 * not authenticated (yet), so the onboarding gate can wait instead of
 * treating a signed-in user whose Convex token is still loading as new.
 * Users who predate the gate are marked onboarded by
 * migrations:markExistingUsersOnboarded.
 */
export const hasCompletedOnboarding = query({
  args: {},
  handler: async (ctx): Promise<boolean | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

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

    // Count Bitpanda connections
    const bitpandaConnections = await ctx.db
      .query("bitpandaConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return {
      bankingCount: plaidAccounts.length,
      brokerCount: brokerConnections.length + bitpandaConnections.length,
      cryptoCount: bitpandaConnections.length,
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
    if (args.step === PROFILE_STEP) {
      throw new Error("The profile step cannot be skipped");
    }

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
    if (!progress.profileCompleted) {
      throw new Error("Complete your profile before finishing onboarding");
    }

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
 * Save user settings (used in profile step). Writes every field: an omitted
 * display name, date of birth or language is cleared.
 */
export const saveUserSettings = mutation({
  args: {
    displayName: v.optional(v.string()),
    birthDate: v.optional(v.string()), // ISO date (YYYY-MM-DD)
    defaultCurrency: v.string(),
    language: v.optional(languageValidator),
    theme: themeValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const settings = assertValidSettings({
      displayName: args.displayName ?? "",
      defaultCurrency: args.defaultCurrency,
      language: args.language,
      theme: args.theme,
    });
    // An empty value clears the date of birth; anything else must be valid.
    const birthDate = args.birthDate?.trim()
      ? assertValidBirthDate(args.birthDate)
      : undefined;

    const userId = identity.subject;
    const now = Date.now();

    const fields = {
      displayName: settings.displayName,
      birthDate,
      defaultCurrency: settings.defaultCurrency ?? "EUR",
      language: settings.language,
      theme: settings.theme ?? args.theme,
    };

    // Check if settings exist
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...fields, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("userSettings", {
      userId,
      ...fields,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Partially update the user's general settings (Settings > General). Only the
 * given fields change; an empty display name or date of birth clears it.
 * Creates the settings row with defaults (EUR, system theme) if none exists.
 */
export const updateSettings = mutation({
  args: {
    displayName: v.optional(v.string()),
    birthDate: v.optional(v.string()), // ISO date (YYYY-MM-DD), "" clears
    defaultCurrency: v.optional(v.string()),
    language: v.optional(languageValidator),
    theme: v.optional(themeValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const patch: SettingsPatch & { birthDate?: string | undefined } =
      assertValidSettings({
        displayName: args.displayName,
        defaultCurrency: args.defaultCurrency,
        language: args.language,
        theme: args.theme,
      });
    if (args.birthDate !== undefined) {
      patch.birthDate = args.birthDate.trim()
        ? assertValidBirthDate(args.birthDate)
        : undefined;
    }

    const userId = identity.subject;
    const now = Date.now();

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("userSettings", {
      userId,
      ...patch,
      defaultCurrency: patch.defaultCurrency ?? "EUR",
      theme: patch.theme ?? "system",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Set or update just the user's date of birth. Lightweight upsert used when the
 * value is missing (e.g. collected later in the Retirement Planner). Creates a
 * settings row with sensible defaults if none exists yet.
 */
export const setBirthDate = mutation({
  args: { birthDate: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const birthDate = assertValidBirthDate(args.birthDate);

    const userId = identity.subject;
    const now = Date.now();

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        birthDate,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("userSettings", {
      userId,
      birthDate,
      defaultCurrency: "EUR",
      theme: "system",
      createdAt: now,
      updatedAt: now,
    });
  },
});
