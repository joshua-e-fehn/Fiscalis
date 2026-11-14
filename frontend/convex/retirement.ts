import { ConvexError, v } from "convex/values";
import {
	DEFAULT_CONSERVATIVE_RETURN,
	DEFAULT_INFLATION_RATE,
	DEFAULT_OPTIMISTIC_RETURN,
	DEFAULT_WITHDRAWAL_RATE,
	computeRetirementResults,
	firstRetirementInputError,
	mortgageAccountHoldings,
	planToInputs,
	type ResidenceMortgage,
	type RetirementFundingBase,
	type RetirementInputs,
	residenceMortgageFromAccount,
	residenceMortgageFromLoan,
	retirementFundingBase,
	retirementValuationDay,
} from "../../services/finance/retirementService";
import {
	fundingBaseIn,
	LEGACY_PLAN_CURRENCY,
	planCurrencyOf,
	retirementAmountsIn,
	type RetirementPlanAmounts,
} from "../../services/finance/retirementCurrency";
import { convertBetween } from "../../services/finance/currency";
import {
	toDisplayCurrency,
	type DisplayCurrency,
} from "../../services/finance/displayCurrency";
import { aggregateNetWorth } from "../../services/portfolio/aggregate";
import { validateBirthDate } from "../lib/utils/date";
import type { Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { getOwnedDoc, getUserId } from "./lib/auth";
import { loadFxRates } from "./fxRates";
import { loadHoldings } from "./lib/netWorth";
import {
	retirementFundingTreatmentValidator,
	retirementPensionSourceValidator,
} from "./schema";

// ═══════════════════════════════════════════════════════════════
// RETIREMENT PLANNER ("Rentenplaner") — persistence layer
// ═══════════════════════════════════════════════════════════════
//
// This module stores the user's plan and computes its results. The financial
// computation lives in services/finance/retirementService.ts; the funding base
// is the net worth's own aggregate (lib/netWorth.ts loadHoldings →
// aggregateNetWorth, FX-normalised), so the plan and the dashboard always
// agree. Defaults and input validation are imported from that same pure
// service (relative path: the `@/` alias is not configured for Convex), so the
// wizard UI and the server accept exactly the same inputs.

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
// Currency
// ───────────────────────────────────────────────────────────────
//
// A plan's typed amounts are stored in the plan's currency (absent = EUR,
// services/finance/retirementCurrency.ts); the net worth is EUR. Queries
// take the viewer's display currency and answer in it: the plan's amounts
// and the funding base are converted at the latest mirrored rates. Saving
// in another currency rebases the stored amounts once and switches the
// plan's currency.

/** The display currency a query or mutation is asked to work in. */
const currencyArg = v.optional(v.string());

/** A requested currency code, validated; undefined when none was given. */
function requestedCurrency(
	code: string | undefined,
): DisplayCurrency | undefined {
	if (code === undefined) return undefined;
	const currency = toDisplayCurrency(code);
	if (!currency) throw new ConvexError(`Unsupported currency: ${code}`);
	return currency;
}

/**
 * Units of `to` per unit of `from`, at the latest mirrored rates (the
 * fallback table when the mirror has none). 1 for the same currency, with
 * no reads.
 */
async function currencyFactor(
	ctx: { db: QueryCtx["db"] },
	from: DisplayCurrency,
	to: DisplayCurrency,
): Promise<number> {
	if (from === to) return 1;
	const foreign = [from, to].filter((code) => code !== "EUR");
	const rates = await loadFxRates(ctx, { currencies: foreign });
	const unitsPerEur = Object.fromEntries(
		Object.entries(rates).map(([code, rate]) => [code, 1 / rate.eurPerUnit]),
	);
	const factor = convertBetween(1, from, to, unitsPerEur);
	if (factor === null || !(factor > 0)) {
		throw new ConvexError(`No exchange rate from ${from} to ${to}`);
	}
	return factor;
}

/**
 * A stored plan's amounts rebased into `target`, or null when the plan is
 * already in it (or no target was given).
 */
async function rebasedAmounts(
	ctx: { db: QueryCtx["db"] },
	plan: RetirementPlanAmounts & { currency?: string },
	target: DisplayCurrency | undefined,
): Promise<RetirementPlanAmounts | null> {
	const stored = planCurrencyOf(plan);
	if (target === undefined || target === stored) return null;
	return retirementAmountsIn(
		plan,
		await currencyFactor(ctx, stored, target),
	);
}

// ───────────────────────────────────────────────────────────────
// Funding base
// ───────────────────────────────────────────────────────────────

/** How the plan links the mortgage on the home the user lives in. */
interface ResidenceMortgageLink {
	primaryResidenceLoanId?: Id<"loans">;
	primaryResidenceAccountId?: Id<"plaidAccounts">;
	primaryResidenceMortgageRate?: number;
	primaryResidenceMortgagePayment?: number;
}

/**
 * The funding base: the net worth's per-category assets and liabilities plus
 * the linked residence mortgage. A tracked loan is projected by its own
 * schedule and payments (only one the liabilities count, D1); a Plaid
 * mortgage account from the plan's optional rate and repayment, both from
 * `today` (`YYYY-MM-DD`).
 *
 * Everything is in the currency `unitsPerEur` converts EUR into (units per
 * 1 EUR), the one the link's repayment is given in.
 */
async function loadFundingBase(
	ctx: QueryCtx,
	userId: string,
	link: ResidenceMortgageLink,
	today: string,
	unitsPerEur: number,
): Promise<RetirementFundingBase> {
	const holdings = await loadHoldings(ctx, userId);
	let mortgage: ResidenceMortgage | null = null;
	if (link.primaryResidenceLoanId) {
		const holding = holdings.find(
			(h) => h.source === "loan" && h.id === link.primaryResidenceLoanId,
		);
		if (holding?.source === "loan") {
			const loan = holding.doc;
			const payments = await ctx.db
				.query("loanPayments")
				.withIndex("by_loan", (q) => q.eq("loanId", loan._id))
				.collect();
			mortgage = residenceMortgageFromLoan(
				loan,
				payments,
				today,
				(loan.currentBalance > 0
					? holding.valueBase / loan.currentBalance
					: 1) * unitsPerEur,
			);
		}
	} else if (link.primaryResidenceAccountId) {
		const account = mortgageAccountHoldings(holdings).find(
			(h) => h.id === link.primaryResidenceAccountId,
		);
		if (account) {
			mortgage = residenceMortgageFromAccount(
				account.valueBase * unitsPerEur,
				{
					annualInterestRate: link.primaryResidenceMortgageRate,
					monthlyPayment: link.primaryResidenceMortgagePayment,
				},
				true,
				today,
			);
		}
	}
	return fundingBaseIn(
		retirementFundingBase(aggregateNetWorth(holdings), mortgage),
		unitsPerEur,
	);
}

// ───────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────

/**
 * Get the current user's retirement plan, or null if none exists yet. With
 * `currency`, its amounts are converted into it (in memory; saving in that
 * currency rebases them) and `currency` is that one; `storedCurrency` is
 * the currency the amounts are stored in.
 */
export const getRetirementPlan = query({
	args: { currency: currencyArg },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;

		const plan = await ctx.db
			.query("retirementPlans")
			.withIndex("by_user", (q) => q.eq("userId", identity.subject))
			.first();
		if (!plan) return null;
		const storedCurrency = planCurrencyOf(plan);
		const currency = requestedCurrency(args.currency) ?? storedCurrency;
		return {
			...plan,
			...(await rebasedAmounts(ctx, plan, currency)),
			currency,
			storedCurrency,
		};
	},
});

/**
 * The valuation day argument of the date-dependent queries: the viewer's
 * local `YYYY-MM-DD`. A query result is cached per argument set and the
 * clock is not a dependency, so the day must be an argument for the age,
 * horizon and mortgage projection to advance (retirementValuationDay).
 */
const valuationDayArg = v.optional(v.string());

/**
 * The stored plan's results on `today`, computed from the user's current net
 * worth, in `currency` (default: the plan's), which the result carries.
 * null when signed out or without a plan.
 */
export const getResults = query({
	args: { today: valuationDayArg, currency: currencyArg },
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		if (!userId) return null;
		const plan = await ctx.db
			.query("retirementPlans")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.first();
		if (!plan) return null;
		const settings = await ctx.db
			.query("userSettings")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.first();
		const currency =
			requestedCurrency(args.currency) ?? planCurrencyOf(plan);
		const inCurrency = {
			...plan,
			...(await rebasedAmounts(ctx, plan, currency)),
		};
		const day = retirementValuationDay(args.today);
		const results = computeRetirementResults(
			planToInputs(inCurrency, settings?.birthDate, day.date),
			await loadFundingBase(
				ctx,
				userId,
				inCurrency,
				day.iso,
				await currencyFactor(ctx, "EUR", currency),
			),
			day.date,
		);
		return { ...results, currency };
	},
});

/**
 * The funding base for a residence-mortgage link on `today`, for the
 * wizard's preview of unsaved inputs, in `currency` (default EUR; the
 * link's repayment is in it too). null when signed out.
 */
export const getFundingBase = query({
	args: {
		today: valuationDayArg,
		currency: currencyArg,
		primaryResidenceLoanId: v.optional(v.id("loans")),
		primaryResidenceAccountId: v.optional(v.id("plaidAccounts")),
		primaryResidenceMortgageRate: v.optional(v.number()),
		primaryResidenceMortgagePayment: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		if (!userId) return null;
		const { today, currency, ...link } = args;
		return await loadFundingBase(
			ctx,
			userId,
			link,
			retirementValuationDay(today).iso,
			await currencyFactor(
				ctx,
				"EUR",
				requestedCurrency(currency) ?? LEGACY_PLAN_CURRENCY,
			),
		);
	},
});

/**
 * Bank (Plaid) mortgage accounts the residence can be linked to, with
 * their balance in `currency` (default EUR).
 */
export const getResidenceMortgageAccounts = query({
	args: { currency: currencyArg },
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		if (!userId) return [];
		const unitsPerEur = await currencyFactor(
			ctx,
			"EUR",
			requestedCurrency(args.currency) ?? LEGACY_PLAN_CURRENCY,
		);
		return mortgageAccountHoldings(await loadHoldings(ctx, userId)).map(
			(h) => ({
				_id: h.id as Id<"plaidAccounts">,
				name: h.name,
				/** Amount owed today, in `currency` */
				balance: h.valueBase * unitsPerEur,
			}),
		);
	},
});

// ───────────────────────────────────────────────────────────────
// Mutations
// ───────────────────────────────────────────────────────────────

/**
 * Upsert the user's single retirement plan. All input fields are optional so
 * the wizard can save incrementally; provided fields are merged over existing
 * values (or over sensible defaults when first created).
 *
 * `currency` is the currency the provided amounts are in. When it differs
 * from the stored plan's, the stored amounts are first rebased into it at
 * the latest rate (once: they are stored in it from then on). Without it,
 * amounts are taken as in the plan's own currency.
 */
export const saveRetirementPlan = mutation({
	args: {
		currency: currencyArg,
		currentStep: v.optional(v.number()),
		status: v.optional(v.union(v.literal("draft"), v.literal("active"))),

		birthDate: v.optional(v.string()),
		currentAge: v.optional(v.number()),
		retirementAge: v.optional(v.number()),

		monthlyExpensesToday: v.optional(v.number()),

		ownsPrimaryResidence: v.optional(v.boolean()),
		// null unlinks the residence mortgage.
		primaryResidenceLoanId: v.optional(v.union(v.id("loans"), v.null())),
		// Or a Plaid mortgage account (null unlinks); linking one unlinks the
		// other. Rate and repayment: null clears.
		primaryResidenceAccountId: v.optional(
			v.union(v.id("plaidAccounts"), v.null()),
		),
		primaryResidenceMortgageRate: v.optional(v.union(v.number(), v.null())),
		primaryResidenceMortgagePayment: v.optional(
			v.union(v.number(), v.null()),
		),
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

		const stored = await ctx.db
			.query("retirementPlans")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.first();
		const currency = requestedCurrency(args.currency);
		const rebased = stored
			? await rebasedAmounts(ctx, stored, currency)
			: null;
		// The stored plan as it reads in `currency`
		const existing = stored && { ...stored, ...rebased };

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
			primaryResidenceMortgageRate:
				args.primaryResidenceMortgageRate === null
					? undefined
					: (args.primaryResidenceMortgageRate ??
						existing?.primaryResidenceMortgageRate),
			primaryResidenceMortgagePayment:
				args.primaryResidenceMortgagePayment === null
					? undefined
					: (args.primaryResidenceMortgagePayment ??
						existing?.primaryResidenceMortgagePayment),
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
		if (args.primaryResidenceAccountId) {
			if (args.primaryResidenceLoanId)
				throw new Error("Link either a loan or an account, not both");
			const account = await getOwnedDoc(
				ctx,
				userId,
				args.primaryResidenceAccountId,
			);
			if (!account) throw new Error("Account not found");
		}
		// Linking one kind of mortgage unlinks the other.
		const loanArg = args.primaryResidenceAccountId
			? null
			: args.primaryResidenceLoanId;
		const accountArg = args.primaryResidenceLoanId
			? null
			: args.primaryResidenceAccountId;
		const primaryResidenceLoanId = loanArg ?? undefined;
		const primaryResidenceAccountId = accountArg ?? undefined;

		if (!existing) {
			const id = await ctx.db.insert("retirementPlans", {
				userId,
				currency: currency ?? LEGACY_PLAN_CURRENCY,
				currentStep: args.currentStep ?? 1,
				status,
				birthDate,
				...merged,
				primaryResidenceLoanId,
				primaryResidenceAccountId,
				createdAt: now,
				updatedAt: now,
			});
			return id;
		}

		// Patch only provided fields, over the rebased amounts.
		const updates: Record<string, unknown> = { updatedAt: now };
		if (rebased) Object.assign(updates, rebased, { currency });
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
		if (loanArg !== undefined)
			updates.primaryResidenceLoanId = primaryResidenceLoanId;
		if (accountArg !== undefined)
			updates.primaryResidenceAccountId = primaryResidenceAccountId;
		if (args.primaryResidenceMortgageRate !== undefined)
			updates.primaryResidenceMortgageRate = merged.primaryResidenceMortgageRate;
		if (args.primaryResidenceMortgagePayment !== undefined)
			updates.primaryResidenceMortgagePayment =
				merged.primaryResidenceMortgagePayment;
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

/**
 * Lightweight step persistence between wizard screens. With a `currency`
 * other than the plan's, the stored amounts are rebased into it (as on
 * saveRetirementPlan).
 */
export const updateRetirementStep = mutation({
	args: { step: v.number(), currency: currencyArg },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const plan = await ctx.db
			.query("retirementPlans")
			.withIndex("by_user", (q) => q.eq("userId", identity.subject))
			.first();

		if (!plan) throw new Error("Retirement plan not initialized");
		assertValidStep(args.step);

		const currency = requestedCurrency(args.currency);
		const rebased = await rebasedAmounts(ctx, plan, currency);
		await ctx.db.patch(plan._id, {
			...(rebased ? { ...rebased, currency } : {}),
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
