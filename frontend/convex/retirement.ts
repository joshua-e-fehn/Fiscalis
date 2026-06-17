import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ═══════════════════════════════════════════════════════════════
// RETIREMENT PLANNER ("Rentenplaner") — persistence layer
// ═══════════════════════════════════════════════════════════════
//
// This module only stores/serves the user's plan. The financial computation
// lives in services/finance/retirementService.ts and is composed client-side
// (see hooks/convex/retirement.ts → useRetirementResults), so the math stays in
// a single, unit-tested place and Convex never needs to import out-of-tree code.

// Defaults — KEEP IN SYNC with services/finance/retirementService.ts.
const DEFAULT_INFLATION_RATE = 0.02;
const DEFAULT_WITHDRAWAL_RATE = 0.04;
const DEFAULT_OPTIMISTIC_RETURN = 0.0718; // doubles every ~10 years: 2^(1/10) − 1
const DEFAULT_CONSERVATIVE_RETURN = 0.05;

const pensionSourceValidator = v.object({
	label: v.string(),
	monthlyAmount: v.number(),
});

// ───────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────

/** Get the current user's retirement plan, or null if none exists yet. */
export const getRetirementPlan = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;

		return await ctx.db
			.query("retirementPlans")
			.withIndex("by_user", (q) => q.eq("userId", identity.subject))
			.first();
	},
});

// ───────────────────────────────────────────────────────────────
// Mutations
// ───────────────────────────────────────────────────────────────

/**
 * Upsert the user's single retirement plan. All input fields are optional so
 * the wizard can save incrementally; provided fields are merged over existing
 * values (or over sensible defaults when first created).
 */
export const saveRetirementPlan = mutation({
	args: {
		currentStep: v.optional(v.number()),
		status: v.optional(v.union(v.literal("draft"), v.literal("active"))),

		birthDate: v.optional(v.string()),
		currentAge: v.optional(v.number()),
		retirementAge: v.optional(v.number()),

		monthlyExpensesToday: v.optional(v.number()),

		ownsPrimaryResidence: v.optional(v.boolean()),
		fundableRealEstateEquity: v.optional(v.number()),

		pensionSources: v.optional(v.array(pensionSourceValidator)),

		inflationRate: v.optional(v.number()),
		withdrawalRate: v.optional(v.number()),
		optimisticReturn: v.optional(v.number()),
		conservativeReturn: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;
		const now = Date.now();

		// Validation (only when both bounds are known / fields are provided).
		if (
			args.currentAge !== undefined &&
			(args.currentAge < 0 || args.currentAge > 120)
		) {
			throw new Error("currentAge must be between 0 and 120");
		}
		if (
			args.retirementAge !== undefined &&
			(args.retirementAge < 0 || args.retirementAge > 120)
		) {
			throw new Error("retirementAge must be between 0 and 120");
		}
		if (
			args.monthlyExpensesToday !== undefined &&
			args.monthlyExpensesToday < 0
		) {
			throw new Error("monthlyExpensesToday cannot be negative");
		}
		if (
			args.fundableRealEstateEquity !== undefined &&
			args.fundableRealEstateEquity < 0
		) {
			throw new Error("fundableRealEstateEquity cannot be negative");
		}
		for (const rate of [
			args.inflationRate,
			args.withdrawalRate,
			args.optimisticReturn,
			args.conservativeReturn,
		]) {
			if (rate !== undefined && (rate < 0 || rate > 1)) {
				throw new Error("Rates must be between 0 and 1");
			}
		}

		const existing = await ctx.db
			.query("retirementPlans")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.first();

		const ownsHome = args.ownsPrimaryResidence;

		if (!existing) {
			const id = await ctx.db.insert("retirementPlans", {
				userId,
				currentStep: args.currentStep ?? 1,
				status: args.status ?? "draft",
				birthDate: args.birthDate,
				currentAge: args.currentAge ?? 0,
				retirementAge: args.retirementAge ?? 67,
				monthlyExpensesToday: args.monthlyExpensesToday ?? 0,
				ownsPrimaryResidence: ownsHome ?? false,
				primaryResidenceExcluded: ownsHome ?? false,
				fundableRealEstateEquity: args.fundableRealEstateEquity,
				pensionSources: args.pensionSources ?? [],
				inflationRate: args.inflationRate ?? DEFAULT_INFLATION_RATE,
				withdrawalRate: args.withdrawalRate ?? DEFAULT_WITHDRAWAL_RATE,
				optimisticReturn: args.optimisticReturn ?? DEFAULT_OPTIMISTIC_RETURN,
				conservativeReturn:
					args.conservativeReturn ?? DEFAULT_CONSERVATIVE_RETURN,
				createdAt: now,
				updatedAt: now,
			});
			return id;
		}

		// Patch only provided fields.
		const updates: Record<string, unknown> = { updatedAt: now };
		if (args.currentStep !== undefined) updates.currentStep = args.currentStep;
		if (args.status !== undefined) updates.status = args.status;
		if (args.birthDate !== undefined) updates.birthDate = args.birthDate;
		if (args.currentAge !== undefined) updates.currentAge = args.currentAge;
		if (args.retirementAge !== undefined)
			updates.retirementAge = args.retirementAge;
		if (args.monthlyExpensesToday !== undefined)
			updates.monthlyExpensesToday = args.monthlyExpensesToday;
		if (ownsHome !== undefined) {
			updates.ownsPrimaryResidence = ownsHome;
			// Owner-occupied home is always excluded from the funding base.
			updates.primaryResidenceExcluded = ownsHome;
		}
		if (args.fundableRealEstateEquity !== undefined)
			updates.fundableRealEstateEquity = args.fundableRealEstateEquity;
		if (args.pensionSources !== undefined)
			updates.pensionSources = args.pensionSources;
		if (args.inflationRate !== undefined)
			updates.inflationRate = args.inflationRate;
		if (args.withdrawalRate !== undefined)
			updates.withdrawalRate = args.withdrawalRate;
		if (args.optimisticReturn !== undefined)
			updates.optimisticReturn = args.optimisticReturn;
		if (args.conservativeReturn !== undefined)
			updates.conservativeReturn = args.conservativeReturn;

		await ctx.db.patch(existing._id, updates);
		return existing._id;
	},
});

/** Lightweight step persistence between wizard screens. */
export const updateRetirementStep = mutation({
	args: { step: v.number() },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const plan = await ctx.db
			.query("retirementPlans")
			.withIndex("by_user", (q) => q.eq("userId", identity.subject))
			.first();

		if (!plan) throw new Error("Retirement plan not initialized");

		await ctx.db.patch(plan._id, {
			currentStep: args.step,
			updatedAt: Date.now(),
		});
		return plan._id;
	},
});

/** Delete the user's plan (start over). */
export const resetRetirementPlan = mutation({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const plan = await ctx.db
			.query("retirementPlans")
			.withIndex("by_user", (q) => q.eq("userId", identity.subject))
			.first();

		if (plan) await ctx.db.delete(plan._id);
		return null;
	},
});
