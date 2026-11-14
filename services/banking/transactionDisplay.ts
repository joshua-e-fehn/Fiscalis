/**
 * How a bank transaction reads on the Transactions page (ENG-190).
 *
 * Plaid signs amounts from the account's side: positive is money leaving
 * the account (a debit), negative is money arriving (a credit). The page
 * shows the user's view instead: credits positive, debits negative.
 */

export type TransactionDirection = "debit" | "credit";

export function transactionDirection(plaidAmount: number): TransactionDirection {
  return plaidAmount > 0 ? "debit" : "credit";
}

/** The amount as the user reads it: money in positive, money out negative. */
export function signedTransactionAmount(plaidAmount: number): number {
  return plaidAmount === 0 ? 0 : -plaidAmount;
}

/**
 * The currency to show a transaction in: its own, else its account's,
 * else ISO 4217 "XXX" (no currency).
 */
export function transactionCurrency(
  transactionCurrency: string | undefined,
  accountCurrency: string | undefined,
): string {
  return transactionCurrency ?? accountCurrency ?? "XXX";
}

/** A date filter is valid when each bound is YYYY-MM-DD and from <= to. */
export function normalizeDateRange(
  from: string,
  to: string,
): { startDate?: string; endDate?: string } {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  let startDate = iso.test(from) ? from : undefined;
  let endDate = iso.test(to) ? to : undefined;
  if (startDate && endDate && startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }
  return { startDate, endDate };
}
