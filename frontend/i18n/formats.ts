import type { Formats } from "next-intl";

/**
 * Named date formats, used as format.dateTime(date, "full") (useFormatter on
 * the client, getFormatter on the server). They format in the request's time
 * zone (i18n/request.ts), except dateOnly.
 *
 * Amounts and percentages are not formatted here: they keep the house style
 * of lib/utils/currency.ts in every language.
 */
export const formats = {
  dateTime: {
    /** 14/11/2026 · 14.11.2026 */
    short: { day: "2-digit", month: "2-digit", year: "numeric" },
    /** 14 Nov 2026 · 14. Nov. 2026 */
    date: { day: "numeric", month: "short", year: "numeric" },
    /** 14 November 2026 at 09:30 · 14. November 2026 um 09:30 */
    full: {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
    /** November 2026 */
    monthYear: { month: "long", year: "numeric" },
    /** Nov 26, for chart axes */
    axisMonth: { month: "short", year: "2-digit" },
    /**
     * A calendar date stored as YYYY-MM-DD (parsed as UTC midnight): pinned
     * to UTC so it never shifts by a day in the viewer's time zone.
     */
    dateOnly: {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  },
} satisfies Formats;
