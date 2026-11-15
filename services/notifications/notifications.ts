/**
 * Notifications (ENG-207): the in-app notification centre and, once the
 * owner sets up a sending domain, email alerts (docs/NOTIFICATIONS.md).
 *
 * A notification is stored as message keys plus parameters, never as
 * rendered text, so the app shows it in the viewer's language and the
 * email in the recipient's. The keys live in the `notifications`
 * namespace (frontend/messages/<language>/notifications.json) under
 * messages.<message>.title / .body.
 *
 * Writers (frontend/convex/lib/notifications.ts notify) check the user's
 * preference for the type and a dedupe key, so a sync that fails every
 * six hours yields one notification per connection per day.
 *
 * Framework-free: imported by Convex functions, the app and vitest.
 */

/** What a user can switch on or off, per channel (Settings > Notifications). */
export const NOTIFICATION_TYPES = [
  "syncFailed",
  "connectionReauth",
  "consentExpiring",
  "netWorthChange",
  "billing",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/**
 * The texts a notification can show: notifications.messages.<message> has a
 * title and a body. A type can have several (net worth up or down).
 */
export const NOTIFICATION_MESSAGES = [
  "syncFailed",
  "connectionReauth",
  "consentExpiring",
  "netWorthUp",
  "netWorthDown",
  "billingPaymentFailed",
  "billingSubscriptionStarted",
  "billingSubscriptionEnded",
] as const;
export type NotificationMessage = (typeof NOTIFICATION_MESSAGES)[number];

/** Message parameters: strings, or numbers (dates as epoch ms, ratios). */
export type NotificationParams = Record<string, string | number>;

/** Parameters that hold a date (epoch ms); the app passes them as Date. */
export const DATE_PARAMS: readonly string[] = ["at", "since"];

/** `params` with the date parameters as Date objects, for next-intl. */
export function paramsForDisplay(
  params: NotificationParams | undefined,
): Record<string, string | number | Date> {
  const out: Record<string, string | number | Date> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    out[key] = DATE_PARAMS.includes(key) && typeof value === "number" ? new Date(value) : value;
  }
  return out;
}

export interface NotificationContent {
  type: NotificationType;
  message: NotificationMessage;
  params?: NotificationParams;
  /** In-app route the notification opens, e.g. /integrations/banking. */
  link?: string;
  /** Same key = same notification: a second write is dropped. */
  dedupeKey?: string;
}

/** Key of the title, relative to the `notifications` namespace. */
export function titleKey(message: NotificationMessage): string {
  return `messages.${message}.title`;
}

/** Key of the body, relative to the `notifications` namespace. */
export function bodyKey(message: NotificationMessage): string {
  return `messages.${message}.body`;
}

/** The message a stored title key belongs to, or null for an unknown key. */
export function messageOfKey(key: string): NotificationMessage | null {
  const match = /^messages\.([A-Za-z]+)\.(title|body)$/.exec(key);
  if (!match) return null;
  const message = match[1];
  return (NOTIFICATION_MESSAGES as readonly string[]).includes(message)
    ? (message as NotificationMessage)
    : null;
}

// ── Preferences ─────────────────────────────────────────────────

export interface ChannelPreference {
  inApp: boolean;
  email: boolean;
}

/**
 * Without a saved preference every type is shown in the app and none is
 * emailed: email is opt-in (and disabled server-wide until the owner turns
 * it on, NOTIFICATION_EMAIL_ENABLED).
 */
export const DEFAULT_PREFERENCE: Readonly<ChannelPreference> = {
  inApp: true,
  email: false,
};

/** The effective preference for `type` from the user's saved rows. */
export function resolvePreference(
  saved: readonly ({ type: string } & ChannelPreference)[],
  type: NotificationType,
): ChannelPreference {
  const row = saved.find((p) => p.type === type);
  return row ? { inApp: row.inApp, email: row.email } : { ...DEFAULT_PREFERENCE };
}

/** One entry per type, saved or default, in NOTIFICATION_TYPES order. */
export function resolveAllPreferences(
  saved: readonly ({ type: string } & ChannelPreference)[],
): ({ type: NotificationType } & ChannelPreference)[] {
  return NOTIFICATION_TYPES.map((type) => ({ type, ...resolvePreference(saved, type) }));
}

// ── Retention and limits ────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Notifications older than this are deleted by the daily prune cron. */
export const NOTIFICATION_RETENTION_MS = 90 * DAY_MS;

/** Notifications the bell's list shows. */
export const BELL_LIST_LIMIT = 8;

/** Page size of the Notifications page. */
export const NOTIFICATION_PAGE_SIZE = 25;

/** The unread badge stops counting here ("99+"). */
export const UNREAD_COUNT_CAP = 99;

/** Rows marked read per markAllRead mutation; it reschedules for the rest. */
export const MARK_ALL_BATCH = 200;

/** The badge text for `count` unread notifications ("" when none). */
export function unreadBadge(count: number): string {
  if (count <= 0) return "";
  return count > UNREAD_COUNT_CAP ? `${UNREAD_COUNT_CAP}+` : String(count);
}

// ── Dedupe keys ─────────────────────────────────────────────────

/** UTC day of `ms`, e.g. 2026-11-15 (the same cut as portfolio snapshots). */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * One notification per connection per UTC day and type, however often the
 * connection's sync runs (Bitpanda every six hours, manual syncs).
 */
export function dailyConnectionKey(
  type: NotificationType,
  connection: string,
  nowMs: number,
): string {
  return `${type}:${connection}:${utcDay(nowMs)}`;
}

/** One consent warning per bank connection and end-of-consent date. */
export function consentKey(connection: string, expiresAtMs: number): string {
  return `consentExpiring:${connection}:${utcDay(expiresAtMs)}`;
}

// ── Connection states ───────────────────────────────────────────

/** Provider names that the connection-status writers report. */
export type ConnectionProvider = "plaid" | "snaptrade" | "bitpanda";

/** The integrations page a provider's connection is managed on. */
export const CONNECTION_LINKS: Readonly<Record<ConnectionProvider, string>> = {
  plaid: "/integrations/banking",
  snaptrade: "/integrations/brokers",
  bitpanda: "/integrations/brokers",
};

const REAUTH_STATUSES = new Set(["pending_reauth", "reauth_required", "needs_reauth"]);
// transient_error is retried by the next sync and does not notify
const FAILED_STATUSES = new Set(["error"]);
/**
 * Plaid error codes that need the user to sign in again: a Plaid item has
 * no reauth status of its own and stores them as status "error" (the
 * ITEM_LOGIN_REQUIRED webhook, actions/plaid.ts).
 */
export const PLAID_REAUTH_ERROR_CODES: readonly string[] = ["ITEM_LOGIN_REQUIRED"];

/**
 * The notification a connection's new status calls for, or null: a reauth
 * state asks the user to reconnect, a hard error reports the failed sync. A
 * transient error (retried by the next sync) and every healthy state notify
 * nothing. The dedupe key makes it one per connection per day while the
 * connection stays broken, however often it is synced.
 */
export function connectionStatusNotification(input: {
  provider: ConnectionProvider;
  /** Stable id of the connection (Plaid item id, document id). */
  connection: string;
  /** What the user calls it: institution, broker or connection label. */
  name: string;
  status: string;
  /** The provider's error code stored with the status (Plaid). */
  errorCode?: string;
  nowMs: number;
}): NotificationContent | null {
  const { provider, connection, name, status, errorCode, nowMs } = input;
  const link = CONNECTION_LINKS[provider];
  const needsReauth =
    REAUTH_STATUSES.has(status) ||
    (provider === "plaid" &&
      status === "error" &&
      errorCode !== undefined &&
      PLAID_REAUTH_ERROR_CODES.includes(errorCode));
  if (needsReauth) {
    return {
      type: "connectionReauth",
      message: "connectionReauth",
      params: { connection: name },
      link,
      dedupeKey: dailyConnectionKey("connectionReauth", `${provider}:${connection}`, nowMs),
    };
  }
  if (FAILED_STATUSES.has(status)) {
    return {
      type: "syncFailed",
      message: "syncFailed",
      params: { connection: name },
      link,
      dedupeKey: dailyConnectionKey("syncFailed", `${provider}:${connection}`, nowMs),
    };
  }
  return null;
}

// ── Consent ─────────────────────────────────────────────────────

/**
 * Days before the end of a bank consent from which the user is notified.
 * Shorter than the card's notice (CONSENT_WARNING_DAYS, 30) on purpose: the
 * card shows the date for a month, the notification asks to act.
 */
export const CONSENT_NOTIFY_DAYS = 14;

/** The consent warning for a bank item, or null when its end is not near. */
export function consentNotification(input: {
  itemId: string;
  name: string;
  consentExpiresAt: number | undefined;
  nowMs: number;
}): NotificationContent | null {
  const { itemId, name, consentExpiresAt, nowMs } = input;
  if (consentExpiresAt === undefined || !Number.isFinite(consentExpiresAt)) return null;
  if (consentExpiresAt <= nowMs) return null; // ended: the item turns to reauth
  if (consentExpiresAt - nowMs > CONSENT_NOTIFY_DAYS * DAY_MS) return null;
  return {
    type: "consentExpiring",
    message: "consentExpiring",
    params: { connection: name, at: consentExpiresAt },
    link: CONNECTION_LINKS.plaid,
    dedupeKey: consentKey(itemId, consentExpiresAt),
  };
}

// ── Net worth ───────────────────────────────────────────────────

/** A day-over-day change of at least this share notifies (10 %). */
export const NET_WORTH_CHANGE_THRESHOLD = 0.1;

/**
 * Below this previous net worth (in the snapshot's base currency) a
 * percentage says little (100 → 120 is +20 %), so nothing is sent.
 */
export const NET_WORTH_CHANGE_MIN_BASE = 1000;

/** Only a previous snapshot this recent is compared (a week of gaps). */
export const NET_WORTH_COMPARE_MAX_AGE_MS = 7 * DAY_MS;

/**
 * The net-worth alert for today's snapshot against the previous day's, or
 * null when the change is below NET_WORTH_CHANGE_THRESHOLD. A partial
 * snapshot (a provider failed, its holdings are stale), today's or the
 * previous one, is never compared: a missing provider would look like a
 * crash or, once it is back, a jump.
 */
export function netWorthChangeNotification(input: {
  previous: { netWorth: number; timestamp: number; partial?: boolean } | undefined;
  current: { netWorth: number; partial?: boolean };
  today: string;
  nowMs: number;
}): NotificationContent | null {
  const { previous, current, today, nowMs } = input;
  // Either side partial: a provider missing from one row is not a move
  if (!previous || previous.partial || current.partial) return null;
  if (nowMs - previous.timestamp > NET_WORTH_COMPARE_MAX_AGE_MS) return null;
  const base = Math.abs(previous.netWorth);
  if (!Number.isFinite(base) || base < NET_WORTH_CHANGE_MIN_BASE) return null;
  const change = (current.netWorth - previous.netWorth) / base;
  if (!Number.isFinite(change) || Math.abs(change) < NET_WORTH_CHANGE_THRESHOLD) return null;
  return {
    type: "netWorthChange",
    message: change > 0 ? "netWorthUp" : "netWorthDown",
    // A ratio (0.12 = 12 %) for {percent, number, percent}
    params: { percent: Math.round(Math.abs(change) * 1000) / 1000, since: previous.timestamp },
    link: "/dashboard",
    // One per day: the snapshot is rewritten by every sync
    dedupeKey: `netWorthChange:${today}`,
  };
}

// ── Billing ─────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function metadataUserId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const userId = value.userId;
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

/**
 * The user and notification for a Stripe webhook event, or null for events
 * that do not notify. The userId comes from the subscription metadata that
 * convex/billing.ts sets at checkout; an invoice carries it as the
 * subscription details' metadata (parent.subscription_details on newer API
 * versions, subscription_details on older ones).
 */
export function billingNotification(
  event: unknown,
): { userId: string; content: NotificationContent } | null {
  if (!isRecord(event) || typeof event.type !== "string") return null;
  const object = isRecord(event.data) ? event.data.object : undefined;
  if (!isRecord(object)) return null;
  const id = typeof object.id === "string" ? object.id : "";

  const notify = (
    userId: string | null,
    message: NotificationMessage,
  ): { userId: string; content: NotificationContent } | null =>
    userId
      ? {
          userId,
          content: {
            type: "billing",
            message,
            link: "/settings/billing",
            dedupeKey: `billing:${message}:${id}`,
          },
        }
      : null;

  switch (event.type) {
    case "customer.subscription.created":
      return notify(metadataUserId(object.metadata), "billingSubscriptionStarted");
    case "customer.subscription.deleted":
      return notify(metadataUserId(object.metadata), "billingSubscriptionEnded");
    case "invoice.payment_failed": {
      const parent = isRecord(object.parent) ? object.parent : undefined;
      const details = parent?.subscription_details ?? object.subscription_details;
      return notify(
        metadataUserId(isRecord(details) ? details.metadata : undefined),
        "billingPaymentFailed",
      );
    }
    default:
      return null;
  }
}

// ── Email text ──────────────────────────────────────────────────

/**
 * Formats a notification message for the email: the ICU subset the
 * `notifications.messages` texts may use, {name}, {name, number},
 * {name, number, percent} and {name, date, medium}. The app renders the
 * same texts with next-intl; notifications.test.ts checks every catalogue
 * stays within this subset.
 */
export function formatNotificationText(
  template: string,
  params: NotificationParams,
  locale: string,
): string {
  return template.replace(
    /\{\s*([A-Za-z_]\w*)\s*(?:,\s*(number|date)\s*(?:,\s*(percent|medium)\s*)?)?\}/g,
    (whole, name: string, kind?: string, style?: string) => {
      const value = params[name];
      if (value === undefined) return whole;
      if (kind === "number" && typeof value === "number") {
        return new Intl.NumberFormat(
          locale,
          style === "percent"
            ? { style: "percent", maximumFractionDigits: 1 }
            : { maximumFractionDigits: 2 },
        ).format(value);
      }
      if (kind === "date" && typeof value === "number") {
        return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
          new Date(value),
        );
      }
      return String(value);
    },
  );
}

/** Whether `template` uses only the subset formatNotificationText supports. */
export function isSupportedNotificationText(template: string): boolean {
  const placeholders = template.match(/\{[^{}]*\}/g) ?? [];
  const nested = /\{[^{}]*\{/.test(template);
  return (
    !nested &&
    placeholders.every((p) =>
      /^\{\s*[A-Za-z_]\w*\s*(,\s*(number(\s*,\s*percent)?|date\s*,\s*medium)\s*)?\}$/.test(p),
    )
  );
}

/** Lookup of a dotted key ("messages.syncFailed.title") in a catalogue. */
export function catalogueText(catalogue: unknown, key: string): string | null {
  let node: unknown = catalogue;
  for (const part of key.split(".")) {
    if (!isRecord(node)) return null;
    node = node[part];
  }
  return typeof node === "string" ? node : null;
}

/** Email-server switch: only the literal "true" turns sending on. */
export function notificationEmailEnabled(flag: string | undefined): boolean {
  return flag?.trim().toLowerCase() === "true";
}
