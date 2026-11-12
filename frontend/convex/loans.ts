import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  addMonthsToISODate,
  adjustmentForBalance,
  computeNextPaymentDate,
  deriveLoanBalance,
  getPaymentsPerYear,
  initialScheduledPayment,
  isExtraPaymentType,
  loanBalanceAdjustment,
  loanKpis,
  paymentSplitBasis,
  periodicRateAt,
  scheduledPaymentAfterEdit,
  settleLoanBalance,
  splitLoanPayment,
} from "../../services/finance/loanScheduleService";
import type { LoanStatus } from "../../services/finance/loanScheduleService";
import { roundMoney } from "../../services/finance/financeService";
import {
  dayCountValidator,
  loanPaymentFrequencyValidator,
  loanPaymentTypeValidator,
  loanStatusValidator,
  loanTypeValidator,
  prepaymentEffectValidator,
} from "./schema";
import { getOwnedDoc, getUserId, requireUserId } from "./lib/auth";
import { scheduleSnapshot } from "./portfolioSnapshots";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type Loan = Doc<"loans">;
export type LoanPayment = Doc<"loanPayments">;
export type LoanScenario = Doc<"loanScenarios">;

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

// Period math and the schedule model live in
// services/finance/loanScheduleService.ts (shared with the loan detail page).

// The next due date is derived from the recorded payments, so recording,
// editing or deleting payments can never drift it away from the schedule.
// Keeps the stored date once the loan is paid off.
async function recomputeNextPaymentDate(
  ctx: MutationCtx,
  loan: Loan,
): Promise<string> {
  const payments = await getLoanPaymentDocs(ctx, loan._id);
  return computeNextPaymentDate(loan, payments) ?? loan.nextPaymentDate;
}

async function getLoanPaymentDocs(
  ctx: QueryCtx | MutationCtx,
  loanId: Id<"loans">,
) {
  return await ctx.db
    .query("loanPayments")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .collect();
}

// "today" for due-date comparisons: the client's local date when it sent
// one (so the list agrees with the detail page), else the server's UTC date
const todayValidator = v.optional(v.string());
function resolveToday(clientToday?: string): string {
  return clientToday && /^\d{4}-\d{2}-\d{2}$/.test(clientToday)
    ? clientToday
    : new Date().toISOString().slice(0, 10);
}

// Missing and foreign docs get the same error, so IDs can't be probed
async function requireOwnedLoan(ctx: MutationCtx, loanId: Id<"loans">) {
  const userId = await requireUserId(ctx);
  const loan = await getOwnedDoc(ctx, userId, loanId);
  if (!loan) throw new Error("Loan not found");
  return { userId, loan };
}

async function requireOwnedPayment(
  ctx: MutationCtx,
  paymentId: Id<"loanPayments">,
) {
  const userId = await requireUserId(ctx);
  const payment = await getOwnedDoc(ctx, userId, paymentId);
  if (!payment) throw new Error("Payment not found");
  const loan = await getOwnedDoc(ctx, userId, payment.loanId);
  if (!loan) throw new Error("Loan not found");
  return { payment, loan };
}

async function requireOwnedScenario(
  ctx: MutationCtx,
  scenarioId: Id<"loanScenarios">,
) {
  const userId = await requireUserId(ctx);
  const scenario = await getOwnedDoc(ctx, userId, scenarioId);
  if (!scenario) throw new Error("Scenario not found");
  return scenario;
}

const HISTORICAL_PAYMENT_NOTE =
  "Historical payment (recorded during loan import)";

// ═══════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════

// Get all loans for a user
export const getLoans = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

// Active loans with the KPIs every loan card shows (from the shared schedule)
async function getActiveLoansWithKpis(
  ctx: QueryCtx,
  userId: string,
  today: string,
) {
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_status", (q) =>
      q.eq("userId", userId).eq("status", "active"),
    )
    .collect();
  return await Promise.all(
    loans.map(async (loan) => ({
      ...loan,
      kpis: loanKpis(loan, await getLoanPaymentDocs(ctx, loan._id), today),
    })),
  );
}

// Get active loans for a user
export const getActiveLoans = query({
  args: { today: todayValidator },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    return await getActiveLoansWithKpis(ctx, userId, resolveToday(args.today));
  },
});

// Get a single loan by ID
export const getLoan = query({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    return await getOwnedDoc(ctx, userId, args.loanId);
  },
});

// Get loan with payment history
export const getLoanWithPayments = query({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    const loan = await getOwnedDoc(ctx, userId, args.loanId);
    if (!loan) return null;

    const payments = await ctx.db
      .query("loanPayments")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .collect();

    // Sort payments by date descending
    payments.sort(
      (a, b) =>
        new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime(),
    );

    return { loan, payments };
  },
});

// Get payment history for a loan
export const getLoanPayments = query({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    if (!(await getOwnedDoc(ctx, userId, args.loanId))) return [];
    const payments = await ctx.db
      .query("loanPayments")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .collect();

    // Sort by date descending (most recent first)
    return payments.sort(
      (a, b) =>
        new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime(),
    );
  },
});

// Get upcoming payments across all loans: every next payment due up to
// `days` from today, including today and overdue ones (flagged)
export const getUpcomingPayments = query({
  args: {
    days: v.optional(v.number()), // Default 30 days
    today: todayValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const today = resolveToday(args.today);
    const until = new Date(Date.parse(today) + (args.days ?? 30) * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const upcomingPayments = [];
    for (const loan of await getActiveLoansWithKpis(ctx, userId, today)) {
      const next = loan.kpis.nextPayment;
      if (!next || next.dueDate > until) continue;
      upcomingPayments.push({
        loanId: loan._id,
        loanName: loan.name,
        paymentDate: next.dueDate,
        amount: next.amount,
        currency: loan.currency,
        overdue: next.overdue,
      });
    }
    return upcomingPayments.sort((a, b) =>
      a.paymentDate.localeCompare(b.paymentDate),
    );
  },
});

// Get loan scenarios
export const getLoanScenarios = query({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    if (!(await getOwnedDoc(ctx, userId, args.loanId))) return [];
    return await ctx.db
      .query("loanScenarios")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .collect();
  },
});

// Get loan summary statistics. Amounts in different currencies aren't added
// up: totals are per currency (no FX for loans yet)
export const getLoansSummary = query({
  args: { today: todayValidator },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const loans = userId
      ? await getActiveLoansWithKpis(ctx, userId, resolveToday(args.today))
      : [];

    const byCurrency = new Map<
      string,
      {
        currency: string;
        totalDebt: number;
        totalMonthlyPayments: number;
        totalOriginalPrincipal: number;
      }
    >();
    for (const loan of loans) {
      const totals = byCurrency.get(loan.currency) ?? {
        currency: loan.currency,
        totalDebt: 0,
        totalMonthlyPayments: 0,
        totalOriginalPrincipal: 0,
      };
      totals.totalDebt += loan.currentBalance;
      totals.totalOriginalPrincipal += loan.originalPrincipal;
      // Monthly equivalent of the regular payment (never a final settlement)
      totals.totalMonthlyPayments +=
        (loan.kpis.regularPayment *
          getPaymentsPerYear(loan.paymentFrequency)) /
        12;
      byCurrency.set(loan.currency, totals);
    }
    const totals = [...byCurrency.values()].map((t) => ({
      ...t,
      totalDebt: roundMoney(t.totalDebt),
      totalMonthlyPayments: roundMoney(t.totalMonthlyPayments),
      overallProgress:
        t.totalOriginalPrincipal > 0
          ? ((t.totalOriginalPrincipal - t.totalDebt) /
              t.totalOriginalPrincipal) *
            100
          : 0,
    }));

    const nextPaymentLoan = loans
      .filter((loan) => loan.kpis.nextPayment)
      .sort((a, b) =>
        a.kpis.nextPayment!.dueDate.localeCompare(b.kpis.nextPayment!.dueDate),
      )[0];

    return {
      loansCount: loans.length,
      totals,
      nextPayment: nextPaymentLoan
        ? {
            loanId: nextPaymentLoan._id,
            loanName: nextPaymentLoan.name,
            date: nextPaymentLoan.kpis.nextPayment!.dueDate,
            amount: nextPaymentLoan.kpis.nextPayment!.amount,
            currency: nextPaymentLoan.currency,
          }
        : null,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════

const oneTimePrepaymentsValidator = v.array(
  v.object({
    date: v.string(),
    amount: v.number(),
  }),
);

const PLANNED_PREPAYMENTS_SCENARIO = "Planned extra payments";

// Create a new loan, with the payments already made (import) and the
// planned extra payments, in one transaction
export const createLoan = mutation({
  args: {
    name: v.string(),
    loanType: loanTypeValidator,
    originalPrincipal: v.number(),
    // Blank = what is left after the historical payments
    currentBalance: v.optional(v.number()),
    annualInterestRate: v.number(),
    currency: v.string(),
    termMonths: v.number(),
    paymentFrequency: loanPaymentFrequencyValidator,
    scheduledPayment: v.optional(v.number()),
    startDate: v.string(),
    // Ignored (derived from the payments); kept for older clients
    nextPaymentDate: v.optional(v.string()),
    gracePeriods: v.optional(v.number()),
    dayCount: v.optional(dayCountValidator),
    maxAnnualPrepaymentRate: v.optional(v.number()),
    prepaymentPenaltyRate: v.optional(v.number()),
    lender: v.optional(v.string()),
    contractNumber: v.optional(v.string()),
    collateral: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Payments already made, each covering the next due date in order
    historicalPayments: v.optional(
      v.array(v.object({ paymentDate: v.string(), amount: v.number() })),
    ),
    // Saved as the loan's "Planned extra payments" scenario
    plannedPrepayments: v.optional(
      v.object({
        extraPerPeriod: v.optional(v.number()),
        extraPerPeriodFrom: v.optional(v.string()),
        oneTimePrepayments: v.optional(oneTimePrepaymentsValidator),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const {
      historicalPayments = [],
      plannedPrepayments,
      nextPaymentDate: _ignoredNextPaymentDate,
      ...terms
    } = args;

    // The regular payment agreed at origination (for INTEREST_ONLY_THEN the
    // post-grace payment), unless the client sent the actual one
    const scheduledPayment =
      terms.scheduledPayment || initialScheduledPayment(terms);

    // Split each historical payment on the balance owed at its due date,
    // walking forward from the original principal
    let balance = terms.originalPrincipal;
    const splits = [...historicalPayments]
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))
      .filter((p) => p.amount > 0)
      .map((p, index) => {
        const split = splitLoanPayment(
          {
            ...terms,
            balance,
            periodRate: periodicRateAt(
              terms,
              terms.annualInterestRate,
              index + 1,
            ),
          },
          p.amount,
          "scheduled",
        );
        balance = settleLoanBalance(balance - split.principalPortion);
        return { paymentDate: p.paymentDate, split };
      });

    // A balance entered by hand is kept as an adjustment on the payments
    const historicalSplits = splits.map(({ split }) => split);
    const balanceAdjustment =
      terms.currentBalance === undefined
        ? 0
        : adjustmentForBalance(
            terms.originalPrincipal,
            historicalSplits,
            terms.currentBalance,
          );
    const loan = {
      userId,
      ...terms,
      balanceAdjustment,
      currentBalance: deriveLoanBalance(
        terms,
        historicalSplits,
        balanceAdjustment,
      ),
      scheduledPayment,
      expectedEndDate: addMonthsToISODate(terms.startDate, terms.termMonths),
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    };
    const loanId = await ctx.db.insert("loans", {
      ...loan,
      // Placeholder, recomputed below from the inserted payments
      nextPaymentDate: terms.startDate,
    });

    for (const [index, { paymentDate, split }] of splits.entries()) {
      await ctx.db.insert("loanPayments", {
        userId,
        loanId,
        paymentDate,
        amount: split.amount,
        principalPortion: split.principalPortion,
        interestPortion: split.interestPortion,
        paymentType: "scheduled",
        notes: HISTORICAL_PAYMENT_NOTE,
        createdAt: now + index,
      });
    }
    const inserted = await ctx.db.get(loanId);
    if (inserted) {
      await ctx.db.patch(loanId, {
        nextPaymentDate: await recomputeNextPaymentDate(ctx, inserted),
      });
    }

    const { extraPerPeriod, extraPerPeriodFrom, oneTimePrepayments } =
      plannedPrepayments ?? {};
    if ((extraPerPeriod ?? 0) > 0 || (oneTimePrepayments?.length ?? 0) > 0) {
      await ctx.db.insert("loanScenarios", {
        userId,
        loanId,
        name: PLANNED_PREPAYMENTS_SCENARIO,
        description: "Entered when the loan was added",
        extraPerPeriod,
        extraPerPeriodFrom,
        oneTimePrepayments,
        createdAt: now,
        updatedAt: now,
      });
    }
    await scheduleSnapshot(ctx, userId, "loan");
    return loanId;
  },
});

// Update a loan
export const updateLoan = mutation({
  args: {
    loanId: v.id("loans"),
    name: v.optional(v.string()),
    currentBalance: v.optional(v.number()),
    annualInterestRate: v.optional(v.number()),
    scheduledPayment: v.optional(v.number()),
    nextPaymentDate: v.optional(v.string()),
    status: v.optional(loanStatusValidator),
    lender: v.optional(v.string()),
    contractNumber: v.optional(v.string()),
    collateral: v.optional(v.string()),
    notes: v.optional(v.string()),
    maxAnnualPrepaymentRate: v.optional(v.number()),
    prepaymentPenaltyRate: v.optional(v.number()),
    // null clears it (back to flat periods)
    dayCount: v.optional(v.union(dayCountValidator, v.null())),
  },
  handler: async (ctx, args) => {
    // nextPaymentDate is derived from the payments, so a sent one is ignored
    // (kept as an arg for older clients)
    const {
      loanId,
      nextPaymentDate: _nextPaymentDate,
      dayCount,
      ...updates
    } = args;

    const { loan } = await requireOwnedLoan(ctx, loanId);

    // Filter out undefined values
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
    ) as Partial<Loan>;
    if (dayCount !== undefined) {
      filteredUpdates.dayCount = dayCount ?? undefined;
    }

    const payments = await getLoanPaymentDocs(ctx, loanId);

    // A balance edit is stored as the difference from the balance the
    // payments leave, so later payment edits keep it
    if (updates.currentBalance !== undefined) {
      filteredUpdates.balanceAdjustment = adjustmentForBalance(
        loan.originalPrincipal,
        payments,
        updates.currentBalance,
      );
      filteredUpdates.currentBalance = deriveLoanBalance(
        loan,
        payments,
        filteredUpdates.balanceAdjustment,
      );
    }

    // A rate or balance edit re-derives the regular payment over the
    // remaining periods, unless the user changed the payment too
    filteredUpdates.scheduledPayment = scheduledPaymentAfterEdit(
      loan,
      payments,
      updates,
    );

    // Balance and status both feed the derived next due date
    await ctx.db.patch(loanId, {
      ...filteredUpdates,
      nextPaymentDate: await recomputeNextPaymentDate(ctx, {
        ...loan,
        ...filteredUpdates,
      }),
      updatedAt: Date.now(),
    });
    await scheduleSnapshot(ctx, loan.userId, "loan");
  },
});

// Delete a loan
export const deleteLoan = mutation({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireOwnedLoan(ctx, args.loanId);

    // Delete all related payments
    const payments = await ctx.db
      .query("loanPayments")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .collect();

    for (const payment of payments) {
      await ctx.db.delete(payment._id);
    }

    // Delete all related scenarios
    const scenarios = await ctx.db
      .query("loanScenarios")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .collect();

    for (const scenario of scenarios) {
      await ctx.db.delete(scenario._id);
    }

    // Delete the loan
    await ctx.db.delete(args.loanId);
    await scheduleSnapshot(ctx, userId, "loan");
  },
});

// Record a payment. The split is done here, on the balance owed on the
// payment date: entered portions are kept, and amount = principal +
// interest + fees always holds (an overpayment past the balance isn't booked).
export const recordPayment = mutation({
  args: {
    loanId: v.id("loans"),
    paymentDate: v.string(),
    // Deprecated, ignored: the schedule derives the due date covered
    scheduledDate: v.optional(v.string()),
    amount: v.number(),
    principalPortion: v.optional(v.number()),
    interestPortion: v.optional(v.number()),
    feesPortion: v.optional(v.number()),
    paymentType: loanPaymentTypeValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, loan } = await requireOwnedLoan(ctx, args.loanId);
    const payments = await getLoanPaymentDocs(ctx, loan._id);

    const split = splitLoanPayment(
      paymentSplitBasis(loan, payments, args.paymentDate),
      args.amount,
      args.paymentType,
      {
        principal: args.principalPortion,
        interest: args.interestPortion,
        fees: args.feesPortion,
      },
    );

    // The balance is derived from the payments (snapped to 0 once paid off)
    const balanceAdjustment = loanBalanceAdjustment(loan, payments);
    const balanceBefore = deriveLoanBalance(loan, payments, balanceAdjustment);
    const principalPortion = Math.min(split.principalPortion, balanceBefore);
    const newBalance = deriveLoanBalance(
      loan,
      [...payments, { principalPortion }],
      balanceAdjustment,
    );

    // Determine if loan is paid off
    const isPaidOff = newBalance === 0;
    const status: LoanStatus = isPaidOff ? "paid_off" : loan.status;

    // Insert payment record
    const paymentId = await ctx.db.insert("loanPayments", {
      userId,
      loanId: args.loanId,
      paymentDate: args.paymentDate,
      amount: roundMoney(split.amount - (split.principalPortion - principalPortion)),
      principalPortion,
      interestPortion: split.interestPortion,
      feesPortion: split.feesPortion || undefined,
      // An extra payment that clears the balance stays extra, so it doesn't
      // cover a due date if the loan is reopened later
      paymentType:
        isPaidOff && !isExtraPaymentType(args.paymentType)
          ? "final"
          : args.paymentType,
      notes: args.notes,
      createdAt: Date.now(),
    });

    // Update loan (extra payments don't move the next due date)
    await ctx.db.patch(args.loanId, {
      currentBalance: newBalance,
      balanceAdjustment,
      nextPaymentDate: await recomputeNextPaymentDate(ctx, {
        ...loan,
        currentBalance: newBalance,
        status,
      }),
      status,
      actualEndDate: isPaidOff ? args.paymentDate : undefined,
      updatedAt: Date.now(),
    });

    await scheduleSnapshot(ctx, userId, "loan");
    return paymentId;
  },
});

// Update a payment
export const updatePayment = mutation({
  args: {
    paymentId: v.id("loanPayments"),
    paymentDate: v.optional(v.string()),
    amount: v.optional(v.number()),
    principalPortion: v.optional(v.number()),
    interestPortion: v.optional(v.number()),
    paymentType: v.optional(loanPaymentTypeValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { paymentId, ...updates } = args;

    const { payment, loan } = await requireOwnedPayment(ctx, paymentId);

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
    );

    // Re-reconcile amount = principal + interest + fees, split on the
    // balance owed on the payment date (without this payment). The edited
    // portion wins; an untouched pair is kept unless the amount changed, in
    // which case it is split again. Principal is at most what is owed.
    const payments = await getLoanPaymentDocs(ctx, loan._id);
    const otherPayments = payments.filter((p) => p._id !== paymentId);
    const balanceAdjustment = loanBalanceAdjustment(loan, payments);
    const balanceWithout = deriveLoanBalance(
      loan,
      otherPayments,
      balanceAdjustment,
    );
    const paymentDate = args.paymentDate ?? payment.paymentDate;
    const editsPortion =
      args.principalPortion !== undefined || args.interestPortion !== undefined;
    const keepsPortions = !editsPortion && args.amount === undefined;
    const split = splitLoanPayment(
      paymentSplitBasis(
        { ...loan, currentBalance: balanceWithout },
        otherPayments,
        paymentDate,
      ),
      args.amount ?? payment.amount,
      args.paymentType ?? payment.paymentType,
      {
        principal: keepsPortions ? payment.principalPortion : args.principalPortion,
        interest: keepsPortions ? payment.interestPortion : args.interestPortion,
        fees: payment.feesPortion,
      },
    );
    const principalPortion = Math.min(split.principalPortion, balanceWithout);

    await ctx.db.patch(paymentId, {
      ...filteredUpdates,
      amount: roundMoney(
        split.amount - (split.principalPortion - principalPortion),
      ),
      principalPortion,
      interestPortion: split.interestPortion,
      // Fees are capped at the edited amount
      feesPortion: split.feesPortion || undefined,
    });

    // Apply the principal change to the loan balance. Only a change that
    // raises the balance reopens a paid-off loan (it may have been marked
    // paid off by hand with a balance left).
    const principalDelta = principalPortion - payment.principalPortion;
    const newBalance = deriveLoanBalance(
      loan,
      [...otherPayments, { principalPortion }],
      balanceAdjustment,
    );
    const status: LoanStatus =
      principalDelta === 0
        ? loan.status
        : newBalance === 0
          ? "paid_off"
          : loan.status === "paid_off" && principalDelta < 0
            ? "active"
            : loan.status;

    await ctx.db.patch(loan._id, {
      currentBalance: newBalance,
      balanceAdjustment,
      nextPaymentDate: await recomputeNextPaymentDate(ctx, {
        ...loan,
        currentBalance: newBalance,
        status,
      }),
      status,
      actualEndDate:
        status === "paid_off"
          ? (loan.actualEndDate ?? args.paymentDate ?? payment.paymentDate)
          : undefined,
      updatedAt: Date.now(),
    });
    await scheduleSnapshot(ctx, loan.userId, "loan");
  },
});

// Delete a payment
export const deletePayment = mutation({
  args: {
    paymentId: v.id("loanPayments"),
  },
  handler: async (ctx, args) => {
    const { payment, loan } = await requireOwnedPayment(ctx, args.paymentId);

    // Re-derive the balance without this payment
    const payments = await getLoanPaymentDocs(ctx, loan._id);
    const balanceAdjustment = loanBalanceAdjustment(loan, payments);
    const restoredBalance = deriveLoanBalance(
      loan,
      payments.filter((p) => p._id !== payment._id),
      balanceAdjustment,
    );

    // Only a delete that raises the balance reopens a paid-off loan (it may
    // have been marked paid off by hand with a balance left)
    const status: LoanStatus =
      loan.status === "paid_off" && restoredBalance > loan.currentBalance
        ? "active"
        : loan.status;

    // Delete the payment
    await ctx.db.delete(args.paymentId);

    // Update loan balance
    await ctx.db.patch(payment.loanId, {
      currentBalance: restoredBalance,
      balanceAdjustment,
      nextPaymentDate: await recomputeNextPaymentDate(ctx, {
        ...loan,
        currentBalance: restoredBalance,
        status,
      }),
      status,
      actualEndDate: status === "paid_off" ? loan.actualEndDate : undefined,
      updatedAt: Date.now(),
    });
    await scheduleSnapshot(ctx, loan.userId, "loan");
  },
});

// One-off repair of loans written by earlier builds. Required step after the
// backend deploy: run from frontend/ (CONVEX_DEPLOYMENT=dev:blessed-ermine-693
// is the live deployment, so do NOT add --prod), dry run first, review the
// `changed` list, then apply. Idempotent, so re-running later is safe.
//   npx convex run loans:repairLoans '{"dryRun": true}'
//   npx convex run loans:repairLoans '{}'
// - recordPayment advanced nextPaymentDate on every payment (including extra
//   ones) and deletePayment never moved it back.
// - Floating-point leftovers (e.g. 2e-13) kept fully repaid loans active.
// - Loans imported with a blank "Current Balance" never had their historical
//   payments deducted.
export const repairLoans = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const loans = await ctx.db.query("loans").collect();
    type RepairedFields = Pick<
      Loan,
      "currentBalance" | "status" | "nextPaymentDate"
    >;
    const changed: Array<{
      loanId: Id<"loans">;
      from: RepairedFields;
      to: RepairedFields;
    }> = [];

    for (const loan of loans) {
      const payments = await ctx.db
        .query("loanPayments")
        .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
        .collect();

      let historicalPrincipal = 0;
      let laterPrincipal = 0;
      for (const p of payments) {
        if (p.notes === HISTORICAL_PAYMENT_NOTE) {
          historicalPrincipal += p.principalPortion;
        } else {
          laterPrincipal += p.principalPortion;
        }
      }
      // Only the payments recorded after the import were deducted from the
      // original principal
      const importedWithoutDeduction =
        historicalPrincipal > 0 &&
        roundMoney(loan.currentBalance + laterPrincipal) ===
          roundMoney(loan.originalPrincipal);

      const currentBalance = settleLoanBalance(
        importedWithoutDeduction
          ? loan.currentBalance - historicalPrincipal
          : loan.currentBalance,
      );
      const isPaidOff = currentBalance === 0 && loan.status === "active";
      const status: LoanStatus = isPaidOff ? "paid_off" : loan.status;
      const latestPaymentDate = payments
        .map((p) => p.paymentDate)
        .sort()
        .pop();
      const nextPaymentDate = await recomputeNextPaymentDate(ctx, {
        ...loan,
        currentBalance,
        status,
      });

      const from = {
        currentBalance: loan.currentBalance,
        status: loan.status,
        nextPaymentDate: loan.nextPaymentDate,
      };
      const to = { currentBalance, status, nextPaymentDate };
      if (
        to.currentBalance === from.currentBalance &&
        to.status === from.status &&
        to.nextPaymentDate === from.nextPaymentDate
      ) {
        continue;
      }

      changed.push({ loanId: loan._id, from, to });
      if (!args.dryRun) {
        await ctx.db.patch(loan._id, {
          ...to,
          // The repaired balance becomes the one the payments derive
          balanceAdjustment: adjustmentForBalance(
            loan.originalPrincipal,
            payments,
            currentBalance,
          ),
          actualEndDate: isPaidOff ? latestPaymentDate : loan.actualEndDate,
          updatedAt: Date.now(),
        });
      }
    }

    return { scanned: loans.length, changed };
  },
});

const scenarioFields = {
  description: v.optional(v.string()),
  // Extra principal paid with every regular payment (per payment period)
  extraPerPeriod: v.optional(v.number()),
  extraPerPeriodFrom: v.optional(v.string()),
  prepaymentEffect: v.optional(prepaymentEffectValidator),
  // Deprecated alias of extraPerPeriod, accepted from older clients
  extraMonthlyPayment: v.optional(v.number()),
  oneTimePrepayments: v.optional(oneTimePrepaymentsValidator),
  newInterestRate: v.optional(v.number()),
  projectedEndDate: v.optional(v.string()),
  totalInterestSaved: v.optional(v.number()),
  monthsSaved: v.optional(v.number()),
};

// Stores the extra under its correct name only
function normalizeScenarioExtra<
  T extends { extraPerPeriod?: number; extraMonthlyPayment?: number },
>({ extraMonthlyPayment, ...rest }: T) {
  return {
    ...rest,
    extraPerPeriod: rest.extraPerPeriod ?? extraMonthlyPayment,
  };
}

// Save a scenario
export const saveScenario = mutation({
  args: {
    loanId: v.id("loans"),
    name: v.string(),
    ...scenarioFields,
  },
  handler: async (ctx, args) => {
    const { userId } = await requireOwnedLoan(ctx, args.loanId);
    const now = Date.now();

    return await ctx.db.insert("loanScenarios", {
      userId,
      ...normalizeScenarioExtra(args),
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update a scenario
export const updateScenario = mutation({
  args: {
    scenarioId: v.id("loanScenarios"),
    name: v.optional(v.string()),
    ...scenarioFields,
  },
  handler: async (ctx, args) => {
    const { scenarioId, ...updates } = args;
    await requireOwnedScenario(ctx, scenarioId);

    const filteredUpdates = Object.fromEntries(
      Object.entries(normalizeScenarioExtra(updates)).filter(
        ([, v]) => v !== undefined,
      ),
    );

    await ctx.db.patch(scenarioId, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
  },
});

// Delete a scenario
export const deleteScenario = mutation({
  args: {
    scenarioId: v.id("loanScenarios"),
  },
  handler: async (ctx, args) => {
    await requireOwnedScenario(ctx, args.scenarioId);
    await ctx.db.delete(args.scenarioId);
  },
});
