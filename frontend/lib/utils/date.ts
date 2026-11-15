/** Today's date as a local-time `YYYY-MM-DD` string (not UTC). */
export function todayLocalISO(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Oldest supported age for a date of birth (inclusive). */
const MAX_BIRTH_DATE_AGE = 120;

/**
 * Why a date of birth is rejected. The UI renders the code in the user's
 * language (common.errors.birthDate.<code>), and the Convex mutations throw it
 * as userError("birthDate.<code>").
 */
export type BirthDateError = "format" | "invalid" | "future" | "outOfRange";

/**
 * Result of {@link validateBirthDate}: the trimmed value and age, or an error
 * code.
 */
export type BirthDateValidation =
  | { ok: true; value: string; age: number }
  | { ok: false; code: BirthDateError };

function birthDateFailure(code: BirthDateError): BirthDateValidation {
  return { ok: false, code };
}

/**
 * Validate an ISO date of birth (YYYY-MM-DD): a real calendar date, not in the
 * future and at most 120 years ago. Single source of truth for the client (age
 * derivation, form hints) and the Convex mutations that store it.
 *
 * Calendar fields are compared directly (not via UTC `Date` parsing) so the
 * result is correct regardless of the viewer's timezone.
 */
export function validateBirthDate(
  birthDate: string,
  today: Date = new Date(),
): BirthDateValidation {
  const value = birthDate.trim();
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return birthDateFailure("format");
  }
  const [by, bm, bd] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const parsed = new Date(by, bm - 1, bd);
  const isRealDate =
    parsed.getFullYear() === by &&
    parsed.getMonth() === bm - 1 &&
    parsed.getDate() === bd;
  if (!isRealDate) {
    return birthDateFailure("invalid");
  }

  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  const td = today.getDate();
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;

  // A negative age means the date lies in the future.
  if (age < 0) {
    return birthDateFailure("future");
  }
  if (age > MAX_BIRTH_DATE_AGE) {
    return birthDateFailure("outOfRange");
  }
  return { ok: true, value, age };
}

/**
 * Compute a person's current age in whole years from an ISO date of birth
 * (YYYY-MM-DD) on `today`. Returns null for an empty/invalid/future date.
 */
export function getAgeFromBirthDate(
  birthDate: string | undefined,
  today: Date = new Date(),
): number | null {
  if (!birthDate) return null;
  const result = validateBirthDate(birthDate, today);
  return result.ok ? result.age : null;
}
