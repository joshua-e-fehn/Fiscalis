/**
 * When a bank connection's consent runs out (ENG-240). Plaid reports the
 * end of consent as `consent_expiration_time` (on the item, and in the
 * PENDING_EXPIRATION webhook), mostly for EU/UK banks under PSD2. It warns
 * of an imminent disconnect with PENDING_DISCONNECT. The bank card shows a
 * notice so the user can renew in time (update mode, PlaidUpdateButton).
 *
 * Framework-free: imported by Convex functions, components and vitest.
 */

/** Days before the end of consent from which the card warns. */
export const CONSENT_WARNING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ConsentFields {
  /** End of consent per Plaid (ms), absent when it does not expire. */
  consentExpiresAt?: number;
  /** Expected disconnect after PENDING_DISCONNECT (ms). */
  disconnectExpectedAt?: number;
}

export type ConsentNotice =
  | { kind: "expiring"; at: number; daysLeft: number }
  | { kind: "expired"; at: number }
  | null;

/**
 * The notice a working connection should show: from the nearer of the
 * expected disconnect and the end of consent, once it is within
 * CONSENT_WARNING_DAYS. Null when neither is near.
 */
export function consentNotice(item: ConsentFields, nowMs: number): ConsentNotice {
  const dates = [item.consentExpiresAt, item.disconnectExpectedAt].filter(
    (at): at is number => typeof at === "number" && Number.isFinite(at),
  );
  if (dates.length === 0) return null;
  const at = Math.min(...dates);
  if (at <= nowMs) return { kind: "expired", at };
  const daysLeft = Math.ceil((at - nowMs) / DAY_MS);
  return daysLeft <= CONSENT_WARNING_DAYS ? { kind: "expiring", at, daysLeft } : null;
}

/** Plaid's ISO consent_expiration_time as ms, or undefined when absent. */
export function consentExpiryMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}
