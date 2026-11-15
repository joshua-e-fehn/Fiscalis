import { readFileSync, readdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_MESSAGES,
  NOTIFICATION_TYPES,
  billingNotification,
  bodyKey,
  catalogueText,
  connectionStatusNotification,
  consentNotification,
  formatNotificationText,
  isSupportedNotificationText,
  messageOfKey,
  netWorthChangeNotification,
  notificationEmailEnabled,
  paramsForDisplay,
  resolveAllPreferences,
  resolvePreference,
  titleKey,
  unreadBadge,
} from "./notifications";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 15, 12);
const MESSAGES_DIR = path.resolve(__dirname, "../../frontend/messages");

describe("preferences", () => {
  it("defaults to in-app on, email off", () => {
    expect(resolvePreference([], "syncFailed")).toEqual({ inApp: true, email: false });
  });

  it("uses the saved row of the type", () => {
    const saved = [{ type: "billing", inApp: false, email: true }];
    expect(resolvePreference(saved, "billing")).toEqual({ inApp: false, email: true });
    expect(resolvePreference(saved, "syncFailed")).toEqual({ inApp: true, email: false });
  });

  it("lists every type once, in order", () => {
    expect(resolveAllPreferences([]).map((p) => p.type)).toEqual([...NOTIFICATION_TYPES]);
  });
});

describe("keys", () => {
  it("round-trips message keys", () => {
    for (const message of NOTIFICATION_MESSAGES) {
      expect(messageOfKey(titleKey(message))).toBe(message);
      expect(messageOfKey(bodyKey(message))).toBe(message);
    }
    expect(messageOfKey("messages.unknown.title")).toBeNull();
    expect(messageOfKey("center.title")).toBeNull();
  });

  it("caps the badge", () => {
    expect(unreadBadge(0)).toBe("");
    expect(unreadBadge(5)).toBe("5");
    expect(unreadBadge(100)).toBe("99+");
  });
});

describe("connectionStatusNotification", () => {
  const base = { provider: "snaptrade" as const, connection: "c1", name: "Broker", nowMs: NOW };

  it("asks to reconnect for every provider's reauth state", () => {
    for (const status of ["reauth_required", "needs_reauth", "pending_reauth"]) {
      expect(connectionStatusNotification({ ...base, status })?.type).toBe("connectionReauth");
    }
  });

  it("treats Plaid ITEM_LOGIN_REQUIRED as reauth", () => {
    const n = connectionStatusNotification({
      ...base,
      provider: "plaid",
      status: "error",
      errorCode: "ITEM_LOGIN_REQUIRED",
    });
    expect(n?.type).toBe("connectionReauth");
    expect(n?.link).toBe("/integrations/banking");
  });

  it("reports a hard error as a failed sync, once per connection per day", () => {
    const n = connectionStatusNotification({ ...base, status: "error" });
    expect(n?.type).toBe("syncFailed");
    expect(n?.params).toEqual({ connection: "Broker" });
    const later = connectionStatusNotification({ ...base, status: "error", nowMs: NOW + 3600_000 });
    expect(later?.dedupeKey).toBe(n?.dedupeKey);
    const tomorrow = connectionStatusNotification({ ...base, status: "error", nowMs: NOW + DAY });
    expect(tomorrow?.dedupeKey).not.toBe(n?.dedupeKey);
    const other = connectionStatusNotification({ ...base, connection: "c2", status: "error" });
    expect(other?.dedupeKey).not.toBe(n?.dedupeKey);
  });

  it("ignores transient errors and healthy states", () => {
    for (const status of ["transient_error", "connected", "active", "syncing", "disconnected"]) {
      expect(connectionStatusNotification({ ...base, status })).toBeNull();
    }
  });
});

describe("consentNotification", () => {
  const base = { itemId: "item", name: "Bank", nowMs: NOW };

  it("warns within two weeks, once per end date", () => {
    const n = consentNotification({ ...base, consentExpiresAt: NOW + 10 * DAY });
    expect(n?.type).toBe("consentExpiring");
    expect(n?.params).toEqual({ connection: "Bank", at: NOW + 10 * DAY });
    const nextDay = consentNotification({ ...base, consentExpiresAt: NOW + 10 * DAY, nowMs: NOW + DAY });
    expect(nextDay?.dedupeKey).toBe(n?.dedupeKey);
  });

  it("stays quiet when the end is far, past or unknown", () => {
    expect(consentNotification({ ...base, consentExpiresAt: NOW + 30 * DAY })).toBeNull();
    expect(consentNotification({ ...base, consentExpiresAt: NOW - DAY })).toBeNull();
    expect(consentNotification({ ...base, consentExpiresAt: undefined })).toBeNull();
  });
});

describe("netWorthChangeNotification", () => {
  const previous = { netWorth: 100_000, timestamp: NOW - DAY };
  const today = "2026-11-15";

  it("notifies a rise or fall of 10% or more", () => {
    const up = netWorthChangeNotification({ previous, current: { netWorth: 112_000 }, today, nowMs: NOW });
    expect(up?.message).toBe("netWorthUp");
    expect(up?.params).toEqual({ percent: 0.12, since: NOW - DAY });
    expect(up?.dedupeKey).toBe("netWorthChange:2026-11-15");
    const down = netWorthChangeNotification({ previous, current: { netWorth: 85_000 }, today, nowMs: NOW });
    expect(down?.message).toBe("netWorthDown");
  });

  it("ignores small moves, partial snapshots, tiny bases and old comparisons", () => {
    const run = (
      p: (typeof previous & { partial?: boolean }) | undefined,
      netWorth: number,
      partial?: boolean,
    ) => netWorthChangeNotification({ previous: p, current: { netWorth, partial }, today, nowMs: NOW });
    expect(run(previous, 105_000)).toBeNull();
    expect(run(previous, 50_000, true)).toBeNull();
    // Yesterday missed a provider: today's full row is not a jump
    expect(run({ ...previous, partial: true }, 200_000)).toBeNull();
    expect(run({ netWorth: 500, timestamp: NOW - DAY }, 5_000)).toBeNull();
    expect(run({ netWorth: 100_000, timestamp: NOW - 8 * DAY }, 200_000)).toBeNull();
    expect(run(undefined, 200_000)).toBeNull();
  });
});

describe("billingNotification", () => {
  const event = (type: string, object: Record<string, unknown>) => ({ type, data: { object } });

  it("reads the userId from the subscription metadata", () => {
    expect(
      billingNotification(event("customer.subscription.created", { id: "sub_1", metadata: { userId: "u1" } })),
    ).toMatchObject({ userId: "u1", content: { message: "billingSubscriptionStarted" } });
    expect(
      billingNotification(event("customer.subscription.deleted", { id: "sub_1", metadata: { userId: "u1" } })),
    ).toMatchObject({ content: { message: "billingSubscriptionEnded", type: "billing" } });
  });

  it("reads a failed invoice's user from either API shape", () => {
    const newer = event("invoice.payment_failed", {
      id: "in_1",
      parent: { subscription_details: { metadata: { userId: "u2" } } },
    });
    const older = event("invoice.payment_failed", {
      id: "in_1",
      subscription_details: { metadata: { userId: "u3" } },
    });
    expect(billingNotification(newer)?.userId).toBe("u2");
    expect(billingNotification(older)?.userId).toBe("u3");
    expect(billingNotification(newer)?.content.dedupeKey).toBe("billing:billingPaymentFailed:in_1");
  });

  it("ignores other events and events without a user", () => {
    expect(billingNotification(event("invoice.paid", { id: "in_1" }))).toBeNull();
    expect(billingNotification(event("customer.subscription.created", { id: "s", metadata: {} }))).toBeNull();
    expect(billingNotification(null)).toBeNull();
  });
});

describe("email text", () => {
  it("formats the supported ICU subset", () => {
    expect(
      formatNotificationText(
        "{connection}: {percent, number, percent} since {since, date, medium}",
        { connection: "Bank", percent: 0.125, since: Date.UTC(2026, 10, 1) },
        "en-GB",
      ),
    ).toBe("Bank: 12.5% since 1 Nov 2026");
    expect(formatNotificationText("Hi {missing}", {}, "en-GB")).toBe("Hi {missing}");
  });

  it("finds nested catalogue texts", () => {
    expect(catalogueText({ a: { b: "x" } }, "a.b")).toBe("x");
    expect(catalogueText({ a: { b: "x" } }, "a.c")).toBeNull();
  });

  it("is off unless the flag is exactly true", () => {
    expect(notificationEmailEnabled(undefined)).toBe(false);
    expect(notificationEmailEnabled("1")).toBe(false);
    expect(notificationEmailEnabled(" TRUE ")).toBe(true);
  });

  it("passes date params to the app as Date", () => {
    const out = paramsForDisplay({ at: 5, connection: "x", percent: 0.1 });
    expect(out.at).toBeInstanceOf(Date);
    expect(out.connection).toBe("x");
    expect(out.percent).toBe(0.1);
  });

  // The email renders these without next-intl, so every language must stay
  // within what formatNotificationText supports, and every message must exist
  for (const language of readdirSync(MESSAGES_DIR)) {
    it(`${language} has every message within the supported ICU subset`, () => {
      const catalogue = JSON.parse(
        readFileSync(path.join(MESSAGES_DIR, language, "notifications.json"), "utf8"),
      );
      const unsupported: string[] = [];
      for (const message of NOTIFICATION_MESSAGES) {
        for (const key of [titleKey(message), bodyKey(message)]) {
          const text = catalogueText(catalogue, key);
          if (text === null || !isSupportedNotificationText(text)) unsupported.push(key);
        }
      }
      for (const key of ["email.footer", "email.open"]) {
        const text = catalogueText(catalogue, key);
        if (text === null || !isSupportedNotificationText(text)) unsupported.push(key);
      }
      expect(unsupported).toEqual([]);
    });
  }
});
