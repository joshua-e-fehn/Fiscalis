/**
 * Plans and limits (ENG-199): the Free limits are enforced on the server,
 * Pro comes from an active subscription (the Stripe component's table) or a
 * plan grant, and the grandfathering migration puts existing users on Pro.
 */
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { api, components, internal } from "../_generated/api";
import { NOW, OWNER, newTest, seedUser, type TestConvex } from "./setup.helpers";

/** The demo dataset has one Plaid, one SnapTrade and one Bitpanda connection. */
async function seededFree(): Promise<TestConvex> {
  const t = newTest();
  await seedUser(t, OWNER);
  return t;
}

async function grantPro(t: TestConvex, expiresAt?: number) {
  await t.run((ctx) =>
    ctx.db.insert("planGrants", {
      userId: OWNER,
      plan: "pro",
      reason: "complimentary",
      grantedAt: NOW,
      ...(expiresAt !== undefined && { expiresAt }),
    }),
  );
}

async function subscribe(t: TestConvex, status: string) {
  await t.run((ctx) =>
    ctx.runMutation(components.stripe.private.handleSubscriptionCreated, {
      stripeSubscriptionId: "sub_test",
      stripeCustomerId: "cus_test",
      status,
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 86_400 * 30,
      cancelAtPeriodEnd: false,
      priceId: "price_test",
      metadata: { userId: OWNER },
    }),
  );
}

async function errorCode(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ConvexError) return (error.data as { code: string }).code;
    // convex-test rethrows nested errors as plain errors carrying the data
    const match = /"code":"(\w+)"/.exec(String(error));
    return match ? match[1] : String(error);
  }
}

describe("connection limit", () => {
  it("refuses a third connection on Free", async () => {
    const t = await seededFree();
    expect(
      await errorCode(t.query(internal.billing.assertConnectionSlot, { userId: OWNER })),
    ).toBe("planConnectionLimit");
  });

  it("allows it on a Pro grant, and again once an expired grant is gone", async () => {
    const t = await seededFree();
    await grantPro(t);
    expect(await t.query(internal.billing.assertConnectionSlot, { userId: OWNER })).toBeNull();

    const expired = await seededFree();
    await grantPro(expired, Date.now() - 1);
    expect(
      await errorCode(expired.query(internal.billing.assertConnectionSlot, { userId: OWNER })),
    ).toBe("planConnectionLimit");
  });

  it("allows it on an active subscription, not on a canceled one", async () => {
    const t = await seededFree();
    await subscribe(t, "active");
    expect(await t.query(internal.billing.assertConnectionSlot, { userId: OWNER })).toBeNull();

    const canceled = await seededFree();
    await subscribe(canceled, "canceled");
    expect(
      await errorCode(canceled.query(internal.billing.assertConnectionSlot, { userId: OWNER })),
    ).toBe("planConnectionLimit");
  });

  it("is checked by Bitpanda connect before the key leaves the server", async () => {
    const t = await seededFree();
    const asOwner = t.withIdentity({ subject: OWNER });
    expect(
      await errorCode(asOwner.action(api.actions.bitpanda.connect, { apiKey: "demo-key" })),
    ).toBe("planConnectionLimit");
  });

  it("is enforced again where each connection is inserted", async () => {
    const t = await seededFree();
    expect(
      await errorCode(
        t.mutation(internal.brokers.createConnection, {
          userId: OWNER,
          snaptradeUserId: "snap",
          authorizationId: "auth-new",
          brokerName: "Broker",
          brokerSlug: "broker",
        }),
      ),
    ).toBe("planConnectionLimit");
    expect(
      await errorCode(
        t.mutation(internal.bitpanda.createConnection, { userId: OWNER, apiKey: "enc" }),
      ),
    ).toBe("planConnectionLimit");
    expect(
      await errorCode(
        t.mutation(internal.banking.saveItem, {
          userId: OWNER,
          accessToken: "enc",
          itemId: "item-new",
        }),
      ),
    ).toBe("planConnectionLimit");
  });
});

describe("API keys", () => {
  const insertArgs = {
    userId: OWNER,
    name: "Script",
    keyHash: "f".repeat(64),
    keyPrefix: "fis_test",
    expiresInDays: null,
  } as const;

  it("cannot be created on Free", async () => {
    const t = await seededFree();
    expect(await errorCode(t.mutation(internal.apiKeys.insert, insertArgs))).toBe(
      "planApiKeysRequirePro",
    );
  });

  it("can be created on Pro and answer 403 after a downgrade", async () => {
    const t = await seededFree();
    await grantPro(t);
    await t.mutation(internal.apiKeys.insert, insertArgs);
    const read = () =>
      t.mutation(internal.apiKeys.readNetWorthWithKey, { keyHash: insertArgs.keyHash });
    expect((await read()).status).toBe("ok");

    await t.run(async (ctx) => {
      for (const grant of await ctx.db.query("planGrants").collect()) await ctx.db.delete(grant._id);
    });
    expect((await read()).status).toBe("plan_required");
  });
});

describe("billing queries", () => {
  it("report the plan and usage of the signed-in user only", async () => {
    const t = await seededFree();
    await grantPro(t);
    const asOwner = t.withIdentity({ subject: OWNER });

    const overview = await asOwner.query(api.billing.overview, {});
    expect(overview).toMatchObject({ plan: "pro", source: "grant", subscription: null });
    // No Stripe env in tests
    expect(overview?.checkoutAvailable).toBe(false);

    const usage = await asOwner.query(api.billing.usage, {});
    expect(usage?.plan).toBe("pro");
    expect(usage?.rows.find((r) => r.key === "connections")).toEqual({
      key: "connections",
      used: 3,
      limit: null,
    });

    expect(await t.query(api.billing.overview, {})).toBeNull();
    const other = await t.withIdentity({ subject: "user_other" }).query(api.billing.usage, {});
    expect(other).toEqual({
      plan: "free",
      rows: [
        { key: "connections", used: 0, limit: 2 },
        { key: "apiKeys", used: 0, limit: 0 },
        { key: "pies", used: 0, limit: 0 },
      ],
    });
  });

  it("refuse checkout while Stripe is not configured", async () => {
    const t = await seededFree();
    const asOwner = t.withIdentity({ subject: OWNER });
    expect(
      await errorCode(asOwner.action(api.billing.createCheckoutSession, { interval: "month" })),
    ).toBe("billingUnavailable");
  });
});

describe("data export", () => {
  it("includes the user's Stripe rows, and no one else's", async () => {
    const t = await seededFree();
    await subscribe(t, "active");

    const mine = await t.withIdentity({ subject: OWNER }).action(api.account.exportMyData, {});
    expect(mine.tables["stripe.subscriptions"]).toMatchObject([
      { stripeSubscriptionId: "sub_test", userId: OWNER },
    ]);

    const theirs = await t
      .withIdentity({ subject: "user_other" })
      .action(api.account.exportMyData, {});
    expect(theirs.tables["stripe.subscriptions"]).toEqual([]);
  });
});

describe("grantProToExistingUsers", () => {
  it("grandfathers existing users onto Pro, only when not a dry run, once", async () => {
    const t = await seededFree();
    const grants = () => t.run((ctx) => ctx.db.query("planGrants").collect());

    const dry = await t.mutation(internal.migrations.grantProToExistingUsers, {});
    expect(dry).toMatchObject({ dryRun: true, granted: [OWNER] });
    expect(await grants()).toEqual([]);

    await t.mutation(internal.migrations.grantProToExistingUsers, { dryRun: false });
    expect((await grants()).map((g) => [g.userId, g.plan, g.reason])).toEqual([
      [OWNER, "pro", "grandfathered"],
    ]);

    const again = await t.mutation(internal.migrations.grantProToExistingUsers, { dryRun: false });
    expect(again).toMatchObject({ alreadyGranted: 1, granted: [] });
    expect(await grants()).toHaveLength(1);

    expect(await t.query(internal.billing.assertConnectionSlot, { userId: OWNER })).toBeNull();
  });
});
