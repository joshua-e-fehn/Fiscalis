import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

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

function getPaymentsPerYear(frequency: PaymentFrequency): number {
  switch (frequency) {
    case "MONTHLY":
      return 12;
    case "QUARTERLY":
      return 4;
    case "SEMI_ANNUAL":
      return 2;
    case "ANNUAL":
      return 1;
  }
}

function addPaymentPeriod(date: Date, frequency: PaymentFrequency): Date {
  const newDate = new Date(date);
  switch (frequency) {
    case "MONTHLY":
      newDate.setMonth(newDate.getMonth() + 1);
      break;
    case "QUARTERLY":
      newDate.setMonth(newDate.getMonth() + 3);
      break;
    case "SEMI_ANNUAL":
      newDate.setMonth(newDate.getMonth() + 6);
      break;
    case "ANNUAL":
      newDate.setFullYear(newDate.getFullYear() + 1);
      break;
  }
  return newDate;
}

function calculateAnnuityPayment(
  principal: number,
  annualRate: number,
  termMonths: number,
  paymentFrequency: PaymentFrequency,
): number {
  const paymentsPerYear = getPaymentsPerYear(paymentFrequency);
  const periodicRate = annualRate / paymentsPerYear;
  const totalPeriods = Math.round(termMonths / (12 / paymentsPerYear));

  if (periodicRate === 0) {
    return principal / totalPeriods;
  }

  const payment =
    (principal * periodicRate * Math.pow(1 + periodicRate, totalPeriods)) /
    (Math.pow(1 + periodicRate, totalPeriods) - 1);

  return Math.round(payment * 100) / 100;
}

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
    const startDate = new Date(args.startDate);
    const expectedEndDate = new Date(startDate);
    expectedEndDate.setMonth(expectedEndDate.getMonth() + args.termMonths);

    // Calculate scheduled payment if not provided (for annuity loans)
    let scheduledPayment = args.scheduledPayment;
    if (!scheduledPayment && args.loanType === "ANNUITY") {
      scheduledPayment = calculateAnnuityPayment(
        args.originalPrincipal,
        args.annualInterestRate,
        args.termMonths,
        args.paymentFrequency,
      );
    } else if (!scheduledPayment) {
      // For other loan types, calculate based on type
      const paymentsPerYear = getPaymentsPerYear(args.paymentFrequency);
      const totalPayments = Math.round(
        args.termMonths / (12 / paymentsPerYear),
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
      expectedEndDate: expectedEndDate.toISOString().split("T")[0],
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
    const { loanId, ...updates } = args;

    // Filter out undefined values
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
    );

    await ctx.db.patch(loanId, {
      ...filteredUpdates,
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

    // Calculate new balance
    const newBalance = Math.max(0, loan.currentBalance - args.principalPortion);

    // Calculate next payment date
    const currentNextPayment = new Date(loan.nextPaymentDate);
    const newNextPaymentDate = addPaymentPeriod(
      currentNextPayment,
      loan.paymentFrequency,
    );

    // Determine if loan is paid off
    const isPaidOff = newBalance === 0;

    // Insert payment record
    const paymentId = await ctx.db.insert("loanPayments", {
      userId: args.userId,
      loanId: args.loanId,
      paymentDate: args.paymentDate,
      scheduledDate: args.scheduledDate,
      amount: args.amount,
      principalPortion: args.principalPortion,
      interestPortion: args.interestPortion,
      feesPortion: args.feesPortion,
      paymentType: isPaidOff ? "final" : args.paymentType,
      balanceAfterPayment: newBalance,
      notes: args.notes,
      createdAt: Date.now(),
    });

    // Update loan
    await ctx.db.patch(args.loanId, {
      currentBalance: newBalance,
      nextPaymentDate: newNextPaymentDate.toISOString().split("T")[0],
      status: isPaidOff ? "paid_off" : loan.status,
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

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
    );

    await ctx.db.patch(paymentId, filteredUpdates);
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
    const restoredBalance = loan.currentBalance + payment.principalPortion;

    // Update loan balance
    await ctx.db.patch(payment.loanId, {
      currentBalance: restoredBalance,
      status: loan.status === "paid_off" ? "active" : loan.status,
      actualEndDate: undefined,
      updatedAt: Date.now(),
    });

    // Delete the payment
    await ctx.db.delete(args.paymentId);
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

    // Insert all payment records without modifying loan
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
        notes: "Historical payment (recorded during loan import)",
        createdAt: now,
      });
    }

    return args.payments.length;
  },
});
