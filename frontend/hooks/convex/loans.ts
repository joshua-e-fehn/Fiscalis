import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

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
// Query Hooks
// ═══════════════════════════════════════════════════════════════

/**
 * Get all loans for the current user
 */
export function useLoans(userId: string | undefined) {
  return useQuery(api.loans.getLoans, userId ? { userId } : "skip");
}

/**
 * Get only active loans for the current user
 */
export function useActiveLoans(userId: string | undefined) {
  return useQuery(api.loans.getActiveLoans, userId ? { userId } : "skip");
}

/**
 * Get a single loan by ID
 */
export function useLoan(loanId: Id<"loans"> | undefined) {
  return useQuery(api.loans.getLoan, loanId ? { loanId } : "skip");
}

/**
 * Get a loan with its payment history
 */
export function useLoanWithPayments(loanId: Id<"loans"> | undefined) {
  return useQuery(api.loans.getLoanWithPayments, loanId ? { loanId } : "skip");
}

/**
 * Get payment history for a specific loan
 */
export function useLoanPayments(loanId: Id<"loans"> | undefined) {
  return useQuery(api.loans.getLoanPayments, loanId ? { loanId } : "skip");
}

/**
 * Get upcoming payments for all loans (default 30 days)
 */
export function useUpcomingPayments(userId: string | undefined, days?: number) {
  return useQuery(
    api.loans.getUpcomingPayments,
    userId ? { userId, days } : "skip",
  );
}

/**
 * Get saved scenarios for a loan
 */
export function useLoanScenarios(loanId: Id<"loans"> | undefined) {
  return useQuery(api.loans.getLoanScenarios, loanId ? { loanId } : "skip");
}

/**
 * Get summary statistics for all loans
 */
export function useLoansSummary(userId: string | undefined) {
  return useQuery(api.loans.getLoansSummary, userId ? { userId } : "skip");
}

// ═══════════════════════════════════════════════════════════════
// Mutation Hooks
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new loan
 */
export function useCreateLoan() {
  const mutation = useMutation(api.loans.createLoan);

  const createLoan = useCallback(
    async (args: {
      userId: string;
      name: string;
      loanType: LoanType;
      originalPrincipal: number;
      currentBalance: number;
      annualInterestRate: number;
      currency: string;
      termMonths: number;
      paymentFrequency: PaymentFrequency;
      scheduledPayment?: number;
      startDate: string;
      nextPaymentDate: string;
      gracePeriods?: number;
      maxAnnualPrepaymentRate?: number;
      prepaymentPenaltyRate?: number;
      lender?: string;
      contractNumber?: string;
      collateral?: string;
      notes?: string;
    }) => {
      return await mutation(args);
    },
    [mutation],
  );

  return { createLoan, isLoading: false };
}

/**
 * Update an existing loan
 */
export function useUpdateLoan() {
  const mutation = useMutation(api.loans.updateLoan);

  const updateLoan = useCallback(
    async (args: {
      loanId: Id<"loans">;
      name?: string;
      currentBalance?: number;
      annualInterestRate?: number;
      scheduledPayment?: number;
      nextPaymentDate?: string;
      status?: LoanStatus;
      lender?: string;
      contractNumber?: string;
      collateral?: string;
      notes?: string;
      maxAnnualPrepaymentRate?: number;
      prepaymentPenaltyRate?: number;
    }) => {
      await mutation(args);
    },
    [mutation],
  );

  return { updateLoan, isLoading: false };
}

/**
 * Delete a loan and all related data
 */
export function useDeleteLoan() {
  const mutation = useMutation(api.loans.deleteLoan);

  const deleteLoan = useCallback(
    async (loanId: Id<"loans">) => {
      await mutation({ loanId });
    },
    [mutation],
  );

  return { deleteLoan, isLoading: false };
}

/**
 * Record a payment for a loan
 */
export function useRecordPayment() {
  const mutation = useMutation(api.loans.recordPayment);

  const recordPayment = useCallback(
    async (args: {
      userId: string;
      loanId: Id<"loans">;
      paymentDate: string;
      scheduledDate?: string;
      amount: number;
      principalPortion: number;
      interestPortion: number;
      feesPortion?: number;
      paymentType: PaymentType;
      notes?: string;
    }) => {
      return await mutation(args);
    },
    [mutation],
  );

  return { recordPayment, isLoading: false };
}

/**
 * Update an existing payment
 */
export function useUpdatePayment() {
  const mutation = useMutation(api.loans.updatePayment);

  const updatePayment = useCallback(
    async (args: {
      paymentId: Id<"loanPayments">;
      paymentDate?: string;
      amount?: number;
      principalPortion?: number;
      interestPortion?: number;
      paymentType?: PaymentType;
      notes?: string;
    }) => {
      await mutation(args);
    },
    [mutation],
  );

  return { updatePayment, isLoading: false };
}

/**
 * Delete a payment (restores loan balance)
 */
export function useDeletePayment() {
  const mutation = useMutation(api.loans.deletePayment);

  const deletePayment = useCallback(
    async (paymentId: Id<"loanPayments">) => {
      await mutation({ paymentId });
    },
    [mutation],
  );

  return { deletePayment, isLoading: false };
}

/**
 * Save a what-if scenario
 */
export function useSaveScenario() {
  const mutation = useMutation(api.loans.saveScenario);

  const saveScenario = useCallback(
    async (args: {
      userId: string;
      loanId: Id<"loans">;
      name: string;
      description?: string;
      extraMonthlyPayment?: number;
      oneTimePrepayments?: Array<{ date: string; amount: number }>;
      newInterestRate?: number;
      projectedEndDate?: string;
      totalInterestSaved?: number;
      monthsSaved?: number;
    }) => {
      return await mutation(args);
    },
    [mutation],
  );

  return { saveScenario, isLoading: false };
}

/**
 * Update an existing scenario
 */
export function useUpdateScenario() {
  const mutation = useMutation(api.loans.updateScenario);

  const updateScenario = useCallback(
    async (args: {
      scenarioId: Id<"loanScenarios">;
      name?: string;
      description?: string;
      extraMonthlyPayment?: number;
      oneTimePrepayments?: Array<{ date: string; amount: number }>;
      newInterestRate?: number;
      projectedEndDate?: string;
      totalInterestSaved?: number;
      monthsSaved?: number;
    }) => {
      await mutation(args);
    },
    [mutation],
  );

  return { updateScenario, isLoading: false };
}

/**
 * Delete a scenario
 */
export function useDeleteScenario() {
  const mutation = useMutation(api.loans.deleteScenario);

  const deleteScenario = useCallback(
    async (scenarioId: Id<"loanScenarios">) => {
      await mutation({ scenarioId });
    },
    [mutation],
  );

  return { deleteScenario, isLoading: false };
}

/**
 * Record historical payments (for loan import)
 */
export function useRecordHistoricalPayments() {
  const mutation = useMutation(api.loans.recordHistoricalPayments);

  const recordHistoricalPayments = useCallback(
    async (args: {
      userId: string;
      loanId: Id<"loans">;
      payments: Array<{
        paymentDate: string;
        scheduledDate: string;
        amount: number;
        principalPortion: number;
        interestPortion: number;
      }>;
    }) => {
      return await mutation(args);
    },
    [mutation],
  );

  return { recordHistoricalPayments, isLoading: false };
}
