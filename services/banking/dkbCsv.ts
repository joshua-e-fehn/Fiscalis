/**
 * The securities trades in a DKB account export ("Umsatzliste", CSV).
 *
 * Plaid does not pass DKB's "Depot / Broker" bookings on (checked
 * 2026-11-19: the trades of Sep and Nov 2026 move the balance but never
 * appear as transactions), so the depot is fed from the bank's own export:
 * the Verwendungszweck column carries the same settlement text
 * parseSecurityTrade reads.
 *
 * Format (DKB web banking, 2026): semicolon separated, every field quoted,
 * a few header lines (account, balance), then the column row starting
 * with "Buchungsdatum"; amounts in German notation ("-1.760,32").
 *
 * Framework-free: imported by Convex functions and vitest.
 */

import {
  germanNumber,
  parseSecurityTrade,
  type SettledSecurityTrade,
} from "./securityTrades";

/** Split one semicolon-separated line, honouring quotes ("" is a quote). */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ";") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

export interface DkbCsvResult {
  /** Booked rows read (every kind, not just trades) */
  rows: number;
  trades: SettledSecurityTrade[];
}

const PURPOSE = "Verwendungszweck";
const AMOUNT = "Betrag (€)";

/**
 * The depot trades of a DKB export. Null when the text is not one (no
 * column row with the purpose and amount columns). A trade row whose
 * amount does not read is skipped.
 */
export function parseDkbCsv(text: string): DkbCsvResult | null {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((l) =>
    splitCsvLine(l)[0]?.trim().startsWith("Buchungsdatum"),
  );
  if (headerIndex < 0) return null;
  const header = splitCsvLine(lines[headerIndex]).map((h) => h.trim());
  const purposeColumn = header.indexOf(PURPOSE);
  const amountColumn = header.indexOf(AMOUNT);
  if (purposeColumn < 0 || amountColumn < 0) return null;

  let rows = 0;
  const trades: SettledSecurityTrade[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) continue;
    const fields = splitCsvLine(line);
    rows++;
    const trade = parseSecurityTrade(fields[purposeColumn] ?? "");
    if (!trade) continue;
    const amount = germanNumber(fields[amountColumn] ?? "");
    if (!Number.isFinite(amount) || amount === 0) continue;
    trades.push({ ...trade, cash: Math.abs(amount), currency: "EUR" });
  }
  return { rows, trades };
}
