/**
 * The syncRuns ledger (frontend/convex/syncRuns.ts): one row per provider
 * sync of one user's connection or account set, scheduled or manual, and
 * the daily failure digest the Mya VPS monitor posts to Slack
 * (ops/health-monitor/, GET /health/sync-digest).
 *
 * A row only ever holds a short machine code for its error
 * (syncErrorCode), never a provider message: messages can echo request
 * data, and the digest leaves Convex. The digest itself carries counts and
 * codes per provider, never a user id.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

import { describeError } from "../security/providerError";
// Hex SHA-256 of a string; the same hash API keys are stored as
import { hashApiKey as sha256Hex } from "../apiKeys/apiKeyService";

export const SYNC_PROVIDERS = [
  "plaid",
  "plaid-transactions",
  "snaptrade",
  "bitpanda",
  "bitpanda-transactions",
] as const;
export type SyncProvider = (typeof SYNC_PROVIDERS)[number];

export type SyncTrigger = "scheduled" | "manual";

/** running until the sync ends; partial: some items failed, some synced. */
export type SyncRunStatus = "running" | "success" | "partial" | "failed";

/** How a finished sync went, as the ledger records it. */
export interface SyncOutcome {
  status: Exclude<SyncRunStatus, "running">;
  errorCode?: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Rows older than this are deleted by the daily prune cron. */
export const SYNC_RUN_RETENTION_MS = 90 * DAY_MS;
/** The window the digest summarizes. */
export const SYNC_DIGEST_WINDOW_MS = 24 * HOUR_MS;
/**
 * A run still `running` after this has died (an action runs at most 10
 * minutes): it timed out or its finish could not be written.
 */
export const SYNC_RUN_STUCK_MS = 30 * 60 * 1000;
/** Error codes listed per provider in the digest. */
export const DIGEST_TOP_CODES = 5;

/** Codes written to the ledger: short, no spaces, nothing a secret fits in. */
const CODE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
/** Node / undici / axios codes, e.g. ECONNRESET, ERR_BAD_REQUEST. */
const TRANSPORT_CODE = /^(E[A-Z0-9_]{2,40}|ERR_[A-Z0-9_]{1,40}|UND_ERR_[A-Z0-9_]{1,40})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A code fit for the ledger, or undefined. */
export function safeSyncCode(code: unknown): string | undefined {
  return typeof code === "string" && CODE_PATTERN.test(code) ? code : undefined;
}

/**
 * A short code for a failed sync, in order of precedence:
 *
 * 1. a user error's code (ConvexError data `{ code }`, convex/lib/userError.ts)
 * 2. the provider's error code (Plaid `error_code`, e.g. ITEM_LOGIN_REQUIRED)
 * 3. `http_<status>` of the provider response (BitpandaApiError, axios)
 * 4. a Node / undici transport code (ECONNRESET, UND_ERR_CONNECT_TIMEOUT)
 * 5. `timeout` for AbortSignal.timeout, else `unknown`
 *
 * Never the message: it is free text from the provider.
 */
export function syncErrorCode(error: unknown): string {
  if (isRecord(error) && isRecord(error.data)) {
    const userCode = safeSyncCode(error.data.code);
    if (userCode) return userCode;
  }
  const summary = describeError(error);
  const providerCode = safeSyncCode(summary.provider?.error_code);
  if (providerCode) return providerCode;
  const status =
    summary.status ??
    (isRecord(error) && typeof error.status === "number" ? error.status : undefined);
  if (status !== undefined && Number.isInteger(status)) return `http_${status}`;
  for (let cause: unknown = error, depth = 0; isRecord(cause) && depth < 4; depth++) {
    if (typeof cause.code === "string" && TRANSPORT_CODE.test(cause.code)) {
      return cause.code;
    }
    if (cause.name === "TimeoutError" || cause.name === "AbortError") return "timeout";
    cause = cause.cause;
  }
  return "unknown";
}

/**
 * The outcome of a sync over several items (connections, accounts):
 * every item synced is a success, none a failure, some a partial run.
 */
export function itemsOutcome(
  synced: number,
  failed: number,
  errorCode?: string,
): SyncOutcome {
  if (failed <= 0) return { status: "success" };
  const code = safeSyncCode(errorCode) ?? "unknown";
  return { status: synced > 0 ? "partial" : "failed", errorCode: code };
}

/** The fields of a syncRuns row the digest reads. */
export interface SyncRunRow {
  provider: SyncProvider;
  userId: string;
  trigger: SyncTrigger;
  startedAt: number;
  endedAt?: number;
  status: SyncRunStatus;
  errorCode?: string;
}

export interface ProviderDigest {
  provider: SyncProvider;
  runs: number;
  succeeded: number;
  partial: number;
  failed: number;
  /** `running` past SYNC_RUN_STUCK_MS: the action died */
  stuck: number;
  /** Distinct users with a partial, failed or stuck run */
  usersAffected: number;
  /** Failed scheduled runs (the nightly / 6-hourly crons) */
  scheduledFailed: number;
  /** Most frequent error codes, most frequent first */
  topErrorCodes: Array<{ code: string; count: number }>;
  /** Newest successful run in the window; null when none */
  lastSuccessAt: number | null;
}

export interface SyncDigest {
  windowStart: number;
  windowEnd: number;
  runs: number;
  /** Partial, failed and stuck runs */
  problems: number;
  /** True when the window held more rows than were read */
  truncated: boolean;
  /** Only providers with at least one run in the window */
  providers: ProviderDigest[];
}

/**
 * Summarize the runs started in [now - window, now]. Counts and codes per
 * provider; user ids are only counted, never returned.
 */
export function summarizeSyncRuns(
  rows: readonly SyncRunRow[],
  now: number,
  options: { windowMs?: number; truncated?: boolean } = {},
): SyncDigest {
  const windowMs = options.windowMs ?? SYNC_DIGEST_WINDOW_MS;
  const windowStart = now - windowMs;
  const byProvider = new Map<
    SyncProvider,
    ProviderDigest & { codes: Map<string, number>; users: Set<string> }
  >();
  let runs = 0;
  let problems = 0;

  for (const row of rows) {
    if (row.startedAt < windowStart || row.startedAt > now) continue;
    let digest = byProvider.get(row.provider);
    if (!digest) {
      digest = {
        provider: row.provider,
        runs: 0,
        succeeded: 0,
        partial: 0,
        failed: 0,
        stuck: 0,
        usersAffected: 0,
        scheduledFailed: 0,
        topErrorCodes: [],
        lastSuccessAt: null,
        codes: new Map(),
        users: new Set(),
      };
      byProvider.set(row.provider, digest);
    }
    runs++;
    digest.runs++;
    let code: string | undefined;
    switch (row.status) {
      case "success":
        digest.succeeded++;
        digest.lastSuccessAt = Math.max(
          digest.lastSuccessAt ?? 0,
          row.endedAt ?? row.startedAt,
        );
        continue;
      case "running":
        // Still within an action's lifetime: not a problem yet
        if (now - row.startedAt < SYNC_RUN_STUCK_MS) continue;
        digest.stuck++;
        code = "stuck";
        break;
      case "partial":
        digest.partial++;
        code = row.errorCode;
        break;
      case "failed":
        digest.failed++;
        if (row.trigger === "scheduled") digest.scheduledFailed++;
        code = row.errorCode;
        break;
    }
    problems++;
    digest.users.add(row.userId);
    const key = safeSyncCode(code) ?? "unknown";
    digest.codes.set(key, (digest.codes.get(key) ?? 0) + 1);
  }

  const providers = SYNC_PROVIDERS.flatMap((provider) => {
    const digest = byProvider.get(provider);
    if (!digest) return [];
    const { codes, users, ...rest } = digest;
    return [
      {
        ...rest,
        usersAffected: users.size,
        topErrorCodes: [...codes.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, DIGEST_TOP_CODES)
          .map(([code, count]) => ({ code, count })),
      },
    ];
  });

  return {
    windowStart,
    windowEnd: now,
    runs,
    problems,
    truncated: options.truncated ?? false,
    providers,
  };
}

/** The shortest monitor secret accepted: shorter is a configuration error. */
export const MONITOR_SECRET_MIN_LENGTH = 32;

/**
 * Whether a request's monitor secret header matches the configured secret.
 * False when either is missing or the configured one is too short. Both
 * are hashed first, so the comparison takes the same time whatever the
 * header holds and leaks nothing about the secret's length or prefix.
 */
export async function monitorSecretMatches(
  provided: string | null | undefined,
  expected: string | null | undefined,
): Promise<boolean> {
  if (!expected || expected.length < MONITOR_SECRET_MIN_LENGTH) return false;
  if (!provided) return false;
  const [a, b] = await Promise.all([sha256Hex(provided), sha256Hex(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
