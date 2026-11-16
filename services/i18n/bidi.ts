/**
 * Bidirectional-text isolation for numbers shown in the UI.
 *
 * In a right-to-left page (Arabic, html dir="rtl") the Unicode bidi
 * algorithm reorders the runs of a Latin-digit amount: the de-CH apostrophe
 * group mark and a leading sign are neutrals that take the paragraph's
 * direction, so "-15'881.29€" shows as "881.29€'15-". Wrapping the text in
 * LEFT-TO-RIGHT ISOLATE (U+2066) ... POP DIRECTIONAL ISOLATE (U+2069) lays it
 * out left to right as one unit, wherever it lands: a card, a table cell, an
 * SVG chart tick or a translated sentence. In a left-to-right page the marks
 * change nothing.
 *
 * The marks are invisible but real characters, so only UI text carries them:
 * exports and the public API write plain numbers, and anything that reads a
 * displayed amount back strips them first (stripBidiMarks, parseTypedAmount).
 */

/** LEFT-TO-RIGHT ISOLATE */
export const LRI = "⁦";
/** POP DIRECTIONAL ISOLATE */
export const PDI = "⁩";

/**
 * Every direction mark Intl or isolateLtr can put in a number: ALM (U+061C),
 * LRM/RLM (U+200E/F), the embeddings and overrides (U+202A-E) and the
 * isolates (U+2066-9).
 */
export const BIDI_MARKS = /[؜‎‏‪-‮⁦-⁩]/g;

/** Isolate initiators: LRI, RLI, FSI (U+2066-8). */
const ISOLATE_INITIATORS = /[\u2066-\u2068]/g;

/**
 * Text laid out left to right as one unit, in any page direction. Text that
 * already is one isolate is returned as is; two isolates joined
 * ("⁦1€⁩ + ⁦2$⁩") still get wrapped.
 */
export function isolateLtr(text: string): string {
  if (!text || isSingleLtrIsolate(text)) return text;
  return `${LRI}${text}${PDI}`;
}

function isSingleLtrIsolate(text: string): boolean {
  return (
    text.startsWith(LRI) &&
    text.endsWith(PDI) &&
    (text.match(ISOLATE_INITIATORS) ?? []).length === 1 &&
    text.indexOf(PDI) === text.length - 1
  );
}

/** Text without direction marks, e.g. a displayed amount read back. */
export function stripBidiMarks(text: string): string {
  return text.replace(BIDI_MARKS, "");
}
