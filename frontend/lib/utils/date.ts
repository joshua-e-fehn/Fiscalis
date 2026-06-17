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

/**
 * Compute a person's current age in whole years from an ISO date of birth
 * (YYYY-MM-DD). Returns null for an empty/invalid/future date.
 */
export function getAgeFromBirthDate(birthDate: string | undefined): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  if (dob.getTime() > today.getTime()) return null;

  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
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
