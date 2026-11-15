/**
 * Notifications (ENG-207): the writers (sync status changes, consent, the
 * daily snapshot), dedupe, preferences, mark read and retention. Ownership
 * of the public functions is covered by ownership.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { NOW, OWNER, newTest, seedUser, type TestConvex } from "./setup.helpers";

const DAY = 24 * 60 * 60 * 1000;

const rows = (t: TestConvex, type?: string) =>
  t.run(async (ctx) => {
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", OWNER))
      .collect();
    return type ? all.filter((n) => n.type === type) : all;
  });

async function seeded() {
  const t = newTest();
  const ids = await seedUser(t, OWNER);
  return { t, ids };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("connection status writers", () => {
  it("reports a failed broker sync once per connection per day", async () => {
    const { t, ids } = await seeded();
    const connectionId = ids.brokerConnections![0];
    for (let i = 0; i < 3; i++) {
      await t.mutation(internal.brokers.updateConnectionStatus, { connectionId, status: "error" });
    }
    expect(await rows(t, "syncFailed")).toHaveLength(2); // the seeded one + today's
    vi.setSystemTime(NOW + DAY);
    await t.mutation(internal.brokers.updateConnectionStatus, { connectionId, status: "error" });
    expect(await rows(t, "syncFailed")).toHaveLength(3);
  });

  it("does not notify transient errors or a healthy sync", async () => {
    const { t, ids } = await seeded();
    const connectionId = ids.bitpandaConnections![0];
    await t.mutation(internal.bitpanda.updateConnectionStatus, { connectionId, status: "transient_error" });
    await t.mutation(internal.bitpanda.updateConnectionStatus, { connectionId, status: "active" });
    expect(await rows(t, "syncFailed")).toHaveLength(1); // the seeded one
    expect(await rows(t, "connectionReauth")).toHaveLength(0);
  });

  it("asks to reconnect on Bitpanda needs_reauth and Plaid ITEM_LOGIN_REQUIRED", async () => {
    const { t, ids } = await seeded();
    await t.mutation(internal.bitpanda.updateConnectionStatus, {
      connectionId: ids.bitpandaConnections![0],
      status: "needs_reauth",
    });
    const item = await t.run((ctx) => ctx.db.get(ids.plaidItems![0]));
    await t.mutation(internal.banking.updateItemStatus, {
      itemId: item!.itemId,
      status: "error",
      errorCode: "ITEM_LOGIN_REQUIRED",
    });
    const reauth = await rows(t, "connectionReauth");
    expect(reauth).toHaveLength(2);
    expect(reauth.map((n) => n.link).sort()).toEqual(["/integrations/banking", "/integrations/brokers"]);
  });

  it("warns once about a bank consent ending within two weeks", async () => {
    const { t, ids } = await seeded();
    const item = await t.run((ctx) => ctx.db.get(ids.plaidItems![0]));
    const ends = NOW + 5 * DAY;
    await t.mutation(internal.banking.updateItemConsent, { itemId: item!.itemId, consentExpiresAt: ends });
    await t.mutation(internal.banking.updateItemConsent, { itemId: item!.itemId, consentExpiresAt: ends });
    const consent = (await rows(t, "consentExpiring")).filter((n) => n.params?.at === ends);
    expect(consent).toHaveLength(1);
    expect(consent[0].params?.connection).toBe("Demo Bank");
  });
});

describe("preferences", () => {
  it("writes nothing for a type switched off in the app (email is off)", async () => {
    const { t, ids } = await seeded();
    await t
      .withIdentity({ subject: OWNER })
      .mutation(api.notifications.setPreference, { type: "syncFailed", inApp: false, email: false });
    await t.mutation(internal.brokers.updateConnectionStatus, {
      connectionId: ids.brokerConnections![0],
      status: "error",
    });
    expect(await rows(t, "syncFailed")).toHaveLength(1); // only the seeded one
    const prefs = await t.withIdentity({ subject: OWNER }).query(api.notifications.preferences, {});
    expect(prefs.emailAvailable).toBe(false);
    expect(prefs.types.find((p) => p.type === "syncFailed")).toEqual({
      type: "syncFailed",
      inApp: false,
      email: false,
    });
  });
});

describe("net worth change", () => {
  it("notifies a day-over-day move of 10% or more", async () => {
    const { t } = await seeded();
    // Yesterday's seeded row is far below the live net worth of the dataset
    await t.run(async (ctx) => {
      const yesterday = await ctx.db
        .query("portfolioSnapshots")
        .withIndex("by_user_date", (q) => q.eq("userId", OWNER).eq("date", "2026-11-14"))
        .first();
      await ctx.db.patch(yesterday!._id, { netWorth: 10_000 });
    });
    await t.mutation(internal.portfolioSnapshots.takeSnapshot, { userId: OWNER, source: "plaid" });
    await t.mutation(internal.portfolioSnapshots.takeSnapshot, { userId: OWNER, source: "snaptrade" });
    const alerts = await rows(t, "netWorthChange");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].titleKey).toBe("messages.netWorthUp.title");
  });
});

describe("notification centre", () => {
  it("counts unread, marks one and all read", async () => {
    const { t } = await seeded();
    const owner = t.withIdentity({ subject: OWNER });
    await t.mutation(internal.notifications.notifyUser, {
      userId: OWNER,
      type: "billing",
      message: "billingSubscriptionStarted",
    });
    let bell = await owner.query(api.notifications.bell, {});
    expect(bell.unread).toBe(2);
    expect(bell.recent[0].titleKey).toBe("messages.billingSubscriptionStarted.title");
    expect(bell.recent[0]).not.toHaveProperty("dedupeKey");

    await owner.mutation(api.notifications.markRead, { notificationId: bell.recent[0]._id });
    bell = await owner.query(api.notifications.bell, {});
    expect(bell.unread).toBe(1);

    await owner.mutation(api.notifications.markAllRead, {});
    bell = await owner.query(api.notifications.bell, {});
    expect(bell.unread).toBe(0);
  });

  it("prunes notifications older than 90 days", async () => {
    const { t } = await seeded();
    await t.run((ctx) =>
      ctx.db.insert("notifications", {
        userId: OWNER,
        type: "billing",
        titleKey: "messages.billingSubscriptionEnded.title",
        bodyKey: "messages.billingSubscriptionEnded.body",
        inApp: true,
        createdAt: NOW - 91 * DAY,
      }),
    );
    const before = (await rows(t)).length;
    expect(await t.mutation(internal.notifications.pruneNotifications, {})).toBe(1);
    expect(await rows(t)).toHaveLength(before - 1);
  });

  it("does not send email while NOTIFICATION_EMAIL_ENABLED is unset", async () => {
    const { t } = await seeded();
    const [first] = await rows(t);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await t.action(internal.notificationEmail.sendNotificationEmail, { notificationId: first._id });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
