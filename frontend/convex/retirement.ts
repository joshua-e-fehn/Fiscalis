import { v } from "convex/values";
import {
	DEFAULT_CONSERVATIVE_RETURN,
	DEFAULT_INFLATION_RATE,
	DEFAULT_OPTIMISTIC_RETURN,
	DEFAULT_WITHDRAWAL_RATE,
	firstRetirementInputError,
	type RetirementInputs,
} from "../../services/finance/retirementService";
import { validateBirthDate } from "../lib/utils/date";
import { mutation, query } from "./_generated/server";
import { getOwnedDoc } from "./lib/auth";
import {
	retirementFundingTreatmentValidator,
	retirementPensionSourceValidator,
} from "./schema";

// ═══════════════════════════════════════════════════════════════
// RETIREMENT PLANNER ("Rentenplaner") — persistence layer
// ═══════════════════════════════════════════════════════════════
//
// This module only stores/serves the user's plan. The financial computation
// lives in services/finance/retirementService.ts and is composed client-side
// (see hooks/convex/retirement.ts → useRetirementResults). Defaults and input
// validation are imported from that same pure service (relative path: the
// `@/` alias is not configured for Convex), so the wizard UI and the server
// accept exactly the same inputs.

/** Wizard steps are 1 (intro) … 8 (results) — RetirementStep in lib/types/retirement.ts. */
const MIN_STEP = 1;
const MAX_STEP = 8;

function assertValidStep(step: number) {
	if (!Number.isInteger(step) || step < MIN_STEP || step > MAX_STEP) {
		throw new Error(
			`Step must be a whole number between ${MIN_STEP} and ${MAX_STEP}`,
		);
	}
}

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
		// null unlinks the residence mortgage.
		primaryResidenceLoanId: v.optional(v.union(v.id("loans"), v.null())),
		fundableRealEstateEquity: v.optional(v.number()),
		fundingTreatments: v.optional(
			v.record(v.string(), retirementFundingTreatmentValidator),
		),

		pensionSources: v.optional(v.array(retirementPensionSourceValidator)),
		pensionDeductionRate: v.optional(v.number()),
		withdrawalTaxRate: v.optional(v.number()),
		indexContributions: v.optional(v.boolean()),

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

		if (args.currentStep !== undefined) assertValidStep(args.currentStep);

		const existing = await ctx.db
			.query("retirementPlans")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.first();

		// Validate the plan as it will be stored (provided fields merged over the
		// existing plan or the create defaults) with the same rules as the wizard.
		// A save that activates the plan must leave it complete and valid as a
		// whole; any other save only checks the fields it sends (plus the
		// cross-field errors they cause), so a value stored under older, looser
		// rules can't block the rest of the wizard.
		const status = args.status ?? existing?.status ?? "draft";
		const merged: RetirementInputs = {
			currentAge: args.currentAge ?? existing?.currentAge ?? 0,
			retirementAge: args.retirementAge ?? existing?.retirementAge ?? 67,
			monthlyExpensesToday:
				args.monthlyExpensesToday ?? existing?.monthlyExpensesToday ?? 0,
			ownsPrimaryResidence:
				args.ownsPrimaryResidence ?? existing?.ownsPrimaryResidence ?? false,
			fundableRealEstateEquity:
				args.fundableRealEstateEquity ?? existing?.fundableRealEstateEquity,
			fundingTreatments:
				args.fundingTreatments ?? existing?.fundingTreatments,
			pensionSources: args.pensionSources ?? existing?.pensionSources ?? [],
			pensionDeductionRate:
				args.pensionDeductionRate ?? existing?.pensionDeductionRate,
			withdrawalTaxRate: args.withdrawalTaxRate ?? existing?.withdrawalTaxRate,
			indexContributions:
				args.indexContributions ?? existing?.indexContributions,
			inflationRate:
				args.inflationRate ?? existing?.inflationRate ?? DEFAULT_INFLATION_RATE,
			withdrawalRate:
				args.withdrawalRate ??
				existing?.withdrawalRate ??
				DEFAULT_WITHDRAWAL_RATE,
			optimisticReturn:
				args.optimisticReturn ??
				existing?.optimisticReturn ??
				DEFAULT_OPTIMISTIC_RETURN,
			conservativeReturn:
				args.conservativeReturn ??
				existing?.conservativeReturn ??
				DEFAULT_CONSERVATIVE_RETURN,
		};
		const firstError = firstRetirementInputError(merged, {
			requireValidTimeline: status === "active",
			fields:
				args.status === "active"
					? undefined
					: (Object.keys(merged) as (keyof RetirementInputs)[]).filter(
							(k) => args[k] !== undefined,
						),
		});
		if (firstError) throw new Error(firstError);

		// The plan's date of birth is only a snapshot (userSettings is canonical),
		// so an invalid one is dropped rather than failing the whole save.
		const birthDateCheck =
			args.birthDate !== undefined ? validateBirthDate(args.birthDate) : null;
		const birthDate = birthDateCheck?.ok ? birthDateCheck.value : undefined;

		// The residence mortgage must be one of the user's own loans.
		if (args.primaryResidenceLoanId) {
			const loan = await getOwnedDoc(ctx, userId, args.primaryResidenceLoanId);
			if (!loan) throw new Error("Loan not found");
		}
		const primaryResidenceLoanId = args.primaryResidenceLoanId ?? undefined;

		if (!existing) {
			const id = await ctx.db.insert("retirementPlans", {
				userId,
				currentStep: args.currentStep ?? 1,
				status,
				birthDate,
				...merged,
				primaryResidenceLoanId,
				createdAt: now,
				updatedAt: now,
			});
			return id;
		}

		// Patch only provided fields.
		const updates: Record<string, unknown> = { updatedAt: now };
		if (args.currentStep !== undefined) updates.currentStep = args.currentStep;
		if (args.status !== undefined) updates.status = args.status;
		if (birthDate !== undefined) updates.birthDate = birthDate;
		if (args.currentAge !== undefined) updates.currentAge = args.currentAge;
		if (args.retirementAge !== undefined)
			updates.retirementAge = args.retirementAge;
		if (args.monthlyExpensesToday !== undefined)
			updates.monthlyExpensesToday = args.monthlyExpensesToday;
		if (args.ownsPrimaryResidence !== undefined)
			updates.ownsPrimaryResidence = args.ownsPrimaryResidence;
		// null → undefined removes the field (unlinks the mortgage).
		if (args.primaryResidenceLoanId !== undefined)
			updates.primaryResidenceLoanId = primaryResidenceLoanId;
		if (args.fundableRealEstateEquity !== undefined)
			updates.fundableRealEstateEquity = args.fundableRealEstateEquity;
		if (args.fundingTreatments !== undefined)
			updates.fundingTreatments = args.fundingTreatments;
		if (args.pensionSources !== undefined)
			updates.pensionSources = args.pensionSources;
		if (args.pensionDeductionRate !== undefined)
			updates.pensionDeductionRate = args.pensionDeductionRate;
		if (args.withdrawalTaxRate !== undefined)
			updates.withdrawalTaxRate = args.withdrawalTaxRate;
		if (args.indexContributions !== undefined)
			updates.indexContributions = args.indexContributions;
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
		assertValidStep(args.step);

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
