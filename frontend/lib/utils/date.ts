type DateFormatType = "short" | "date" | "full";

export function formatDate(date: Date, type: DateFormatType = "full"): string {
  const options: Intl.DateTimeFormatOptions = {
    hour12: false,
    ...(type === "short" && {
      hour: "2-digit",
      minute: "2-digit",
    }),
    ...(type === "date" && {
      day: "2-digit",
      month: "2-digit",
    }),
    ...(type === "full" && {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  return new Intl.DateTimeFormat("de-DE", options).format(date);
}

/** Today's date as a local-time `YYYY-MM-DD` string (not UTC). */
export function todayLocalISO(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Compute a person's current age in whole years from an ISO date of birth
 * (YYYY-MM-DD). Returns null for an empty/invalid/future date.
 *
 * Calendar fields are compared directly (not via UTC `Date` parsing) so the
 * result is correct regardless of the viewer's timezone.
 */
export function getAgeFromBirthDate(birthDate: string | undefined): number | null {
  if (!birthDate) return null;

  let by: number;
  let bm: number;
  let bd: number;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim());
  if (match) {
    by = Number(match[1]);
    bm = Number(match[2]);
    bd = Number(match[3]);
  } else {
    const dob = new Date(birthDate);
    if (Number.isNaN(dob.getTime())) return null;
    by = dob.getFullYear();
    bm = dob.getMonth() + 1;
    bd = dob.getDate();
  }

  const today = new Date();
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  const td = today.getDate();

  // Reject future dates of birth
  if (by > ty || (by === ty && (bm > tm || (bm === tm && bd > td)))) return null;

  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;

  return age >= 0 && age <= 120 ? age : null;
}

/** Format an ISO date of birth (YYYY-MM-DD) for display, e.g. "1 May 1990". */
export function formatBirthDate(birthDate: string): string {
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return birthDate;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dob);
}
