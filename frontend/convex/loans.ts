import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  addMonthsToISODate,
  calculateLoanAnnuityPayment,
  capPrincipalPortion,
  computeNextPaymentDate,
  getPaymentsPerYear,
  getTotalPeriods,
  isExtraPaymentType,
  settleLoanBalance,
} from "../../services/finance/loanScheduleService";
import { roundMoney } from "../../services/finance/financeService";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type Loan = Doc<"loans">;
export type LoanPayment = Doc<"loanPayments">;
export type LoanScenario = Doc<"loanScenarios">;

export type LoanType =
  | "ANNUITY"
  | "CONSTANT_PRINCIPAL"
  | "BULLET"
  | "INTEREST_ONLY_THEN";

export type PaymentFrequency =
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMI_ANNUAL"
  | "ANNUAL";

export type LoanStatus = "active" | "paid_off" | "defaulted" | "refinanced";

export type PaymentType =
  | "scheduled"
  | "additional_principal"
  | "prepayment"
  | "final"
  | "partial"
  | "late";

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
  const payments = await ctx.db
    .query("loanPayments")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .collect();
  return computeNextPaymentDate(loan, payments) ?? loan.nextPaymentDate;
}

const HISTORICAL_PAYMENT_NOTE =
  "Historical payment (recorded during loan import)";

// ═══════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════

// Get all loans for a user
export const getLoans = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// Get active loans for a user
export const getActiveLoans = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("loans")
      .withIndex("by_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();
  },
});

// Get a single loan by ID
export const getLoan = query({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.loanId);
  },
});

// Get loan with payment history
export const getLoanWithPayments = query({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanId);
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

// Get upcoming payments across all loans
export const getUpcomingPayments = query({
  args: {
    userId: v.string(),
    days: v.optional(v.number()), // Default 30 days
  },
  handler: async (ctx, args) => {
    const daysAhead = args.days ?? 30;
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();

    const upcomingPayments = loans
      .filter((loan) => {
        const nextPayment = new Date(loan.nextPaymentDate);
        return nextPayment >= today && nextPayment <= futureDate;
      })
      .map((loan) => ({
        loanId: loan._id,
        loanName: loan.name,
        paymentDate: loan.nextPaymentDate,
        amount: loan.scheduledPayment,
        currency: loan.currency,
      }))
      .sort(
        (a, b) =>
          new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime(),
      );

    return upcomingPayments;
  },
});

// Get loan scenarios
export const getLoanScenarios = query({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("loanScenarios")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .collect();
  },
});

// Get loan summary statistics
export const getLoansSummary = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();

    if (loans.length === 0) {
      return {
        totalDebt: 0,
        totalMonthlyPayments: 0,
        loansCount: 0,
        nextPayment: null,
        totalOriginalPrincipal: 0,
        overallProgress: 0,
      };
    }

    const totalDebt = loans.reduce((sum, loan) => sum + loan.currentBalance, 0);
    const totalOriginalPrincipal = loans.reduce(
      (sum, loan) => sum + loan.originalPrincipal,
      0,
    );

    // Calculate monthly equivalent payments
    const totalMonthlyPayments = loans.reduce((sum, loan) => {
      const paymentsPerYear = getPaymentsPerYear(loan.paymentFrequency);
      const monthlyEquivalent = (loan.scheduledPayment * paymentsPerYear) / 12;
      return sum + monthlyEquivalent;
    }, 0);

    // Find next payment
    const sortedByNextPayment = [...loans].sort(
      (a, b) =>
        new Date(a.nextPaymentDate).getTime() -
        new Date(b.nextPaymentDate).getTime(),
    );
    const nextPaymentLoan = sortedByNextPayment[0];

    const overallProgress =
      totalOriginalPrincipal > 0
        ? ((totalOriginalPrincipal - totalDebt) / totalOriginalPrincipal) * 100
        : 0;

    return {
      totalDebt,
      totalMonthlyPayments,
      loansCount: loans.length,
      nextPayment: nextPaymentLoan
        ? {
            loanId: nextPaymentLoan._id,
            loanName: nextPaymentLoan.name,
            date: nextPaymentLoan.nextPaymentDate,
            amount: nextPaymentLoan.scheduledPayment,
            currency: nextPaymentLoan.currency,
          }
        : null,
      totalOriginalPrincipal,
      overallProgress,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════

// Create a new loan
export const createLoan = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    loanType: v.union(
      v.literal("ANNUITY"),
      v.literal("CONSTANT_PRINCIPAL"),
      v.literal("BULLET"),
      v.literal("INTEREST_ONLY_THEN"),
    ),
    originalPrincipal: v.number(),
    currentBalance: v.number(),
    annualInterestRate: v.number(),
    currency: v.string(),
    termMonths: v.number(),
    paymentFrequency: v.union(
      v.literal("MONTHLY"),
      v.literal("QUARTERLY"),
      v.literal("SEMI_ANNUAL"),
      v.literal("ANNUAL"),
    ),
    scheduledPayment: v.optional(v.number()),
    startDate: v.string(),
    nextPaymentDate: v.string(),
    gracePeriods: v.optional(v.number()),
    maxAnnualPrepaymentRate: v.optional(v.number()),
    prepaymentPenaltyRate: v.optional(v.number()),
    lender: v.optional(v.string()),
    contractNumber: v.optional(v.string()),
    collateral: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Calculate expected end date
    const expectedEndDate = addMonthsToISODate(args.startDate, args.termMonths);

    // Calculate scheduled payment if not provided (for annuity loans)
    let scheduledPayment = args.scheduledPayment;
    if (!scheduledPayment && args.loanType === "ANNUITY") {
      scheduledPayment = calculateLoanAnnuityPayment(
        args.originalPrincipal,
        args.annualInterestRate,
        args.termMonths,
        args.paymentFrequency,
      );
    } else if (!scheduledPayment) {
      // For other loan types, calculate based on type
      const paymentsPerYear = getPaymentsPerYear(args.paymentFrequency);
      const totalPayments = getTotalPeriods(
        args.termMonths,
        args.paymentFrequency,
      );

      if (args.loanType === "CONSTANT_PRINCIPAL") {
        const principalPayment = args.originalPrincipal / totalPayments;
        const interestPayment =
          (args.originalPrincipal * args.annualInterestRate) / paymentsPerYear;
        scheduledPayment = principalPayment + interestPayment;
      } else if (
        args.loanType === "BULLET" ||
        args.loanType === "INTEREST_ONLY_THEN"
      ) {
        scheduledPayment =
          (args.originalPrincipal * args.annualInterestRate) / paymentsPerYear;
      }
    }

    const loanId = await ctx.db.insert("loans", {
      userId: args.userId,
      name: args.name,
      loanType: args.loanType,
      originalPrincipal: args.originalPrincipal,
      currentBalance: args.currentBalance,
      annualInterestRate: args.annualInterestRate,
      currency: args.currency,
      termMonths: args.termMonths,
      paymentFrequency: args.paymentFrequency,
      scheduledPayment: scheduledPayment ?? 0,
      startDate: args.startDate,
      expectedEndDate,
      nextPaymentDate: args.nextPaymentDate,
      gracePeriods: args.gracePeriods,
      maxAnnualPrepaymentRate: args.maxAnnualPrepaymentRate,
      prepaymentPenaltyRate: args.prepaymentPenaltyRate,
      lender: args.lender,
      contractNumber: args.contractNumber,
      collateral: args.collateral,
      status: "active",
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

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
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("paid_off"),
        v.literal("defaulted"),
        v.literal("refinanced"),
      ),
    ),
    lender: v.optional(v.string()),
    contractNumber: v.optional(v.string()),
    collateral: v.optional(v.string()),
    notes: v.optional(v.string()),
    maxAnnualPrepaymentRate: v.optional(v.number()),
    prepaymentPenaltyRate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // nextPaymentDate is derived from the payments, so a sent one is ignored
    // (kept as an arg for older clients)
    const { loanId, nextPaymentDate: _nextPaymentDate, ...updates } = args;

    const loan = await ctx.db.get(loanId);
    if (!loan) throw new Error("Loan not found");

    // Filter out undefined values
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
    ) as Partial<Loan>;

    // Balance and status both feed the derived next due date
    await ctx.db.patch(loanId, {
      ...filteredUpdates,
      nextPaymentDate: await recomputeNextPaymentDate(ctx, {
        ...loan,
        ...filteredUpdates,
      }),
      updatedAt: Date.now(),
    });
  },
});

// Delete a loan
export const deleteLoan = mutation({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
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
  },
});

// Record a payment
export const recordPayment = mutation({
  args: {
    userId: v.string(),
    loanId: v.id("loans"),
    paymentDate: v.string(),
    scheduledDate: v.optional(v.string()),
    amount: v.number(),
    principalPortion: v.number(),
    interestPortion: v.number(),
    feesPortion: v.optional(v.number()),
    paymentType: v.union(
      v.literal("scheduled"),
      v.literal("additional_principal"),
      v.literal("prepayment"),
      v.literal("final"),
      v.literal("partial"),
      v.literal("late"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new Error("Loan not found");

    // Calculate new balance (snapped to 0 once paid off)
    const principalPortion = capPrincipalPortion(
      loan.currentBalance,
      args.principalPortion,
    );
    const newBalance = settleLoanBalance(
      loan.currentBalance - principalPortion,
    );

    // Determine if loan is paid off
    const isPaidOff = newBalance === 0;
    const status: LoanStatus = isPaidOff ? "paid_off" : loan.status;

    // Insert payment record
    const paymentId = await ctx.db.insert("loanPayments", {
      userId: args.userId,
      loanId: args.loanId,
      paymentDate: args.paymentDate,
      scheduledDate: args.scheduledDate,
      amount: args.amount,
      principalPortion,
      interestPortion: args.interestPortion,
      feesPortion: args.feesPortion,
      // An extra payment that clears the balance stays extra, so it doesn't
      // cover a due date if the loan is reopened later
      paymentType:
        isPaidOff && !isExtraPaymentType(args.paymentType)
          ? "final"
          : args.paymentType,
      balanceAfterPayment: newBalance,
      notes: args.notes,
      createdAt: Date.now(),
    });

    // Update loan (extra payments don't move the next due date)
    await ctx.db.patch(args.loanId, {
      currentBalance: newBalance,
      nextPaymentDate: await recomputeNextPaymentDate(ctx, {
        ...loan,
        currentBalance: newBalance,
        status,
      }),
      status,
      actualEndDate: isPaidOff ? args.paymentDate : undefined,
      updatedAt: Date.now(),
    });

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
    paymentType: v.optional(
      v.union(
        v.literal("scheduled"),
        v.literal("additional_principal"),
        v.literal("prepayment"),
        v.literal("final"),
        v.literal("partial"),
        v.literal("late"),
      ),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { paymentId, ...updates } = args;

    const payment = await ctx.db.get(paymentId);
    if (!payment) throw new Error("Payment not found");

    const loan = await ctx.db.get(payment.loanId);
    if (!loan) throw new Error("Loan not found");

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
    );

    // At most what was owed before this payment
    const principalPortion = capPrincipalPortion(
      loan.currentBalance + payment.principalPortion,
      args.principalPortion ?? payment.principalPortion,
    );

    await ctx.db.patch(paymentId, { ...filteredUpdates, principalPortion });

    // Apply the principal change to the loan balance. Only a change that
    // raises the balance reopens a paid-off loan (it may have been marked
    // paid off by hand with a balance left).
    const principalDelta = principalPortion - payment.principalPortion;
    const newBalance = settleLoanBalance(loan.currentBalance - principalDelta);
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
  },
});

// Delete a payment
export const deletePayment = mutation({
  args: {
    paymentId: v.id("loanPayments"),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Payment not found");

    const loan = await ctx.db.get(payment.loanId);
    if (!loan) throw new Error("Loan not found");

    // Restore the balance
    const restoredBalance = settleLoanBalance(
      loan.currentBalance + payment.principalPortion,
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
      nextPaymentDate: await recomputeNextPaymentDate(ctx, {
        ...loan,
        currentBalance: restoredBalance,
        status,
      }),
      status,
      actualEndDate: status === "paid_off" ? loan.actualEndDate : undefined,
      updatedAt: Date.now(),
    });
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
          actualEndDate: isPaidOff ? latestPaymentDate : loan.actualEndDate,
          updatedAt: Date.now(),
        });
      }
    }

    return { scanned: loans.length, changed };
  },
});

// Save a scenario
export const saveScenario = mutation({
  args: {
    userId: v.string(),
    loanId: v.id("loans"),
    name: v.string(),
    description: v.optional(v.string()),
    extraMonthlyPayment: v.optional(v.number()),
    oneTimePrepayments: v.optional(
      v.array(
        v.object({
          date: v.string(),
          amount: v.number(),
        }),
      ),
    ),
    newInterestRate: v.optional(v.number()),
    projectedEndDate: v.optional(v.string()),
    totalInterestSaved: v.optional(v.number()),
    monthsSaved: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("loanScenarios", {
      userId: args.userId,
      loanId: args.loanId,
      name: args.name,
      description: args.description,
      extraMonthlyPayment: args.extraMonthlyPayment,
      oneTimePrepayments: args.oneTimePrepayments,
      newInterestRate: args.newInterestRate,
      projectedEndDate: args.projectedEndDate,
      totalInterestSaved: args.totalInterestSaved,
      monthsSaved: args.monthsSaved,
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
    description: v.optional(v.string()),
    extraMonthlyPayment: v.optional(v.number()),
    oneTimePrepayments: v.optional(
      v.array(
        v.object({
          date: v.string(),
          amount: v.number(),
        }),
      ),
    ),
    newInterestRate: v.optional(v.number()),
    projectedEndDate: v.optional(v.string()),
    totalInterestSaved: v.optional(v.number()),
    monthsSaved: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { scenarioId, ...updates } = args;

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
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
    await ctx.db.delete(args.scenarioId);
  },
});

// Record historical payments (for loan import - doesn't modify loan balance)
export const recordHistoricalPayments = mutation({
  args: {
    userId: v.string(),
    loanId: v.id("loans"),
    payments: v.array(
      v.object({
        paymentDate: v.string(),
        scheduledDate: v.string(),
        amount: v.number(),
        principalPortion: v.number(),
        interestPortion: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Insert all payment records without modifying the loan balance
    for (const payment of args.payments) {
      await ctx.db.insert("loanPayments", {
        userId: args.userId,
        loanId: args.loanId,
        paymentDate: payment.paymentDate,
        scheduledDate: payment.scheduledDate,
        amount: payment.amount,
        principalPortion: payment.principalPortion,
        interestPortion: payment.interestPortion,
        paymentType: "scheduled",
        balanceAfterPayment: 0, // Will be calculated when viewing history
        notes: HISTORICAL_PAYMENT_NOTE,
        createdAt: now,
      });
    }

    // The imported payments cover the first due dates, so the next due date
    // moves past them (whatever date the client sent to createLoan)
    const loan = await ctx.db.get(args.loanId);
    if (loan) {
      await ctx.db.patch(args.loanId, {
        nextPaymentDate: await recomputeNextPaymentDate(ctx, loan),
      });
    }

    return args.payments.length;
  },
});
