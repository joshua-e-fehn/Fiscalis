/**
 * Operator details for the legal pages (Impressum, privacy policy, terms) and
 * the site footer. Taken from the Impressum at https://joshua-fehn.de; change
 * them here only, every legal page reads this file. The country is translated
 * (legal.common.country in the catalogue).
 */
export const LEGAL_OPERATOR = {
  name: "Joshua Fehn",
  street: "Eichenplatz 1",
  postalCode: "91088",
  city: "Bubenreuth",
  email: "kontakt@joshua-fehn.de",
  phone: "+49 157 36211331",
  vatId: "DE337805472",
} as const;

/** Shown as "last updated" on the privacy policy and terms. */
export const LEGAL_LAST_UPDATED = new Date("2026-11-14T12:00:00Z");

export const CONTACT_MAILTO = `mailto:${LEGAL_OPERATOR.email}`;
