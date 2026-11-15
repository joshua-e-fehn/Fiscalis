/**
 * The registry of user-owned data, for the GDPR data export and account
 * deletion (frontend/convex/account.ts). Both read only this list, so a
 * table missing here is missing from both; userData.test.ts checks it
 * against every table in frontend/convex/schema.ts that has a userId, and
 * account.ts fails `tsc` when a table with a userId is absent.
 *
 * Every table listed has a `by_user` index on userId, which export and
 * purge page through.
 *
 * Framework-free: imported by Convex functions, the app and vitest.
 */

export interface UserDataTable {
  /** Convex table name. */
  table: string;
  /**
   * Secret fields left out of the export (encrypted provider credentials,
   * key hashes). The export lists them under `excluded`.
   */
  excludedFields: readonly string[];
}

/**
 * Purge order: provider credentials and the sync roster first, so a sync
 * that starts mid-purge finds nothing to fetch and nothing to write back,
 * then the data they produced, then the user's own records.
 */
export const USER_DATA_TABLES = [
  { table: "syncTargets", excludedFields: [] },
  { table: "plaidItems", excludedFields: ["accessToken"] },
  { table: "snaptradeUsers", excludedFields: ["snaptradeUserSecret"] },
  { table: "bitpandaConnections", excludedFields: ["apiKey"] },
  { table: "apiKeys", excludedFields: ["keyHash"] },
  { table: "brokerConnections", excludedFields: [] },
  { table: "plaidAccounts", excludedFields: [] },
  { table: "plaidTransactions", excludedFields: [] },
  { table: "brokerAccounts", excludedFields: [] },
  { table: "brokerPositions", excludedFields: [] },
  { table: "brokerTransactions", excludedFields: [] },
  { table: "bitpandaHoldings", excludedFields: [] },
  { table: "bitpandaTransactions", excludedFields: [] },
  { table: "loans", excludedFields: [] },
  { table: "loanPayments", excludedFields: [] },
  { table: "loanScenarios", excludedFields: [] },
  { table: "vaultItems", excludedFields: [] },
  { table: "vaultTransactions", excludedFields: [] },
  { table: "manualAssets", excludedFields: [] },
  { table: "valuationOverrides", excludedFields: [] },
  { table: "pies", excludedFields: [] },
  { table: "goals", excludedFields: [] },
  { table: "goalEntries", excludedFields: [] },
  { table: "goalTrackers", excludedFields: [] },
  { table: "portfolioSnapshots", excludedFields: [] },
  { table: "syncRuns", excludedFields: [] },
  { table: "retirementPlans", excludedFields: [] },
  { table: "worldBankFavorites", excludedFields: [] },
  { table: "onboardingProgress", excludedFields: [] },
  { table: "userSettings", excludedFields: [] },
  { table: "planGrants", excludedFields: [] },
  { table: "notifications", excludedFields: [] },
  { table: "notificationPreferences", excludedFields: [] },
] as const satisfies readonly UserDataTable[];

export type UserDataTableName = (typeof USER_DATA_TABLES)[number]["table"];

export const USER_DATA_TABLE_NAMES: readonly UserDataTableName[] =
  USER_DATA_TABLES.map((t) => t.table);

/** Documents read per export page (one internal query each). */
export const EXPORT_PAGE_SIZE = 200;

/** Documents deleted per purge mutation. */
export const PURGE_BATCH_SIZE = 200;

/** Version of the export file's shape. */
export const EXPORT_FORMAT_VERSION = 1;

/** What the user types to confirm deleting their account. */
export const ACCOUNT_DELETE_PHRASE = "DELETE";

/** Whether `input` confirms the deletion (surrounding spaces ignored). */
export function isAccountDeleteConfirmation(input: string): boolean {
  return input.trim() === ACCOUNT_DELETE_PHRASE;
}

function tableEntry(table: string): UserDataTable | undefined {
  return (USER_DATA_TABLES as readonly UserDataTable[]).find(
    (t) => t.table === table,
  );
}

/** A document without the table's excluded (secret) fields. */
export function redactForExport<T extends Record<string, unknown>>(
  table: string,
  doc: T,
): Record<string, unknown> {
  const excluded = tableEntry(table)?.excludedFields ?? [];
  if (excluded.length === 0) return doc;
  const copy: Record<string, unknown> = { ...doc };
  for (const field of excluded) delete copy[field];
  return copy;
}

/** One `table.field` entry per excluded secret, for the export's notes. */
export function excludedFieldList(): string[] {
  return USER_DATA_TABLES.flatMap((t) =>
    t.excludedFields.map((f) => `${t.table}.${f}`),
  );
}

export interface UserDataExport {
  format: "fiscalis-user-data";
  version: number;
  exportedAt: string;
  userId: string;
  /** Every user-owned table, keyed by table name (empty tables included). */
  tables: Record<string, Record<string, unknown>[]>;
  /** Secret fields left out, as `table.field`. */
  excluded: string[];
}

/** The export file's content. */
export function buildUserDataExport(
  userId: string,
  tables: Record<string, Record<string, unknown>[]>,
  now: Date,
): UserDataExport {
  return {
    format: "fiscalis-user-data",
    version: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    userId,
    tables,
    excluded: excludedFieldList(),
  };
}

/** File name of the download, e.g. fiscalis-data-2026-11-15.json. */
export function exportFileName(now: Date): string {
  return `fiscalis-data-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * The Clerk user ID of a `user.deleted` webhook event, or null for any
 * other event (POST /clerk-webhook in frontend/convex/http.ts).
 */
export function deletedClerkUserId(event: unknown): string | null {
  if (typeof event !== "object" || event === null) return null;
  const { type, data } = event as { type?: unknown; data?: { id?: unknown } };
  if (type !== "user.deleted") return null;
  const id = data?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
