import { describe, expect, it } from "vitest";

import {
  PLAN_LIMITS,
  billingReturnUrl,
  canAddConnection,
  intervalOfPrice,
  isProSubscriptionStatus,
  planAllows,
  resolvePlan,
  usageRows,
  usageShare,
} from "./plans";

const NOW = Date.UTC(2026, 10, 15);
const sub = (status: string, currentPeriodEnd = 1_800_000_000) => ({
  status,
  currentPeriodEnd,
  cancelAtPeriodEnd: false,
  priceId: "price_month",
});

describe("resolvePlan", () => {
  it("is Free with nothing", () => {
    expect(resolvePlan([], [], NOW)).toEqual({
      plan: "free",
      source: "default",
      subscription: null,
    });
  });

  it("is Pro on an active, trialing or past-due subscription", () => {
    for (const status of ["active", "trialing", "past_due"]) {
      expect(resolvePlan([sub(status)], [], NOW).plan).toBe("pro");
    }
  });

  it("drops to Free on a canceled, unpaid or incomplete subscription", () => {
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
      const resolved = resolvePlan([sub(status)], [], NOW);
      expect(resolved.plan).toBe("free");
      // Still shown, so the page can say it ended
      expect(resolved.subscription?.status).toBe(status);
    }
  });

  it("prefers the paying subscription over a newer ended one", () => {
    const resolved = resolvePlan([sub("canceled", 1_900_000_000), sub("active")], [], NOW);
    expect(resolved.subscription?.status).toBe("active");
  });

  it("is Pro on an open-ended or unexpired grant, Free once it expires", () => {
    expect(resolvePlan([], [{ plan: "pro" }], NOW)).toMatchObject({
      plan: "pro",
      source: "grant",
    });
    expect(resolvePlan([], [{ plan: "pro", expiresAt: NOW + 1 }], NOW).plan).toBe("pro");
    expect(resolvePlan([], [{ plan: "pro", expiresAt: NOW }], NOW).plan).toBe("free");
  });

  it("names the subscription as the source when there are both", () => {
    expect(resolvePlan([sub("active")], [{ plan: "pro" }], NOW).source).toBe("subscription");
  });
});

describe("limits", () => {
  it("caps Free at two connections and leaves Pro unlimited", () => {
    expect(canAddConnection("free", 0)).toBe(true);
    expect(canAddConnection("free", 1)).toBe(true);
    expect(canAddConnection("free", 2)).toBe(false);
    expect(canAddConnection("free", 5)).toBe(false);
    expect(canAddConnection("pro", 500)).toBe(true);
  });

  it("gates API keys and Pies to Pro", () => {
    expect(planAllows("free", "apiKeys")).toBe(false);
    expect(planAllows("free", "pies")).toBe(false);
    expect(planAllows("pro", "apiKeys")).toBe(true);
    expect(planAllows("pro", "pies")).toBe(true);
  });

  it("lists usage against each limit", () => {
    const rows = usageRows("free", { connections: 1, apiKeys: 0, pies: 0 });
    expect(rows).toEqual([
      { key: "connections", used: 1, limit: PLAN_LIMITS.free.maxConnections },
      { key: "apiKeys", used: 0, limit: 0 },
      { key: "pies", used: 0, limit: 0 },
    ]);
    expect(usageShare(rows[0])).toBe(0.5);
    expect(usageShare(rows[1])).toBeNull();
    expect(usageShare({ key: "connections", used: 4, limit: 2 })).toBe(1);
    expect(usageRows("pro", { connections: 9, apiKeys: 2, pies: 0 }).every((r) => r.limit === null)).toBe(true);
  });
});

describe("isProSubscriptionStatus", () => {
  it("knows the statuses", () => {
    expect(isProSubscriptionStatus("active")).toBe(true);
    expect(isProSubscriptionStatus("canceled")).toBe(false);
  });
});

describe("intervalOfPrice", () => {
  it("maps a configured price id to its interval", () => {
    const configured = { month: "price_m", year: "price_y" };
    expect(intervalOfPrice("price_m", configured)).toBe("month");
    expect(intervalOfPrice("price_y", configured)).toBe("year");
    expect(intervalOfPrice("price_other", configured)).toBeNull();
    expect(intervalOfPrice("", { month: undefined })).toBeNull();
  });
});

describe("billingReturnUrl", () => {
  it("builds an absolute URL on the site's origin", () => {
    expect(billingReturnUrl("https://fiscalis.example/app", "/settings/billing?checkout=success")).toBe(
      "https://fiscalis.example/settings/billing?checkout=success",
    );
    expect(billingReturnUrl("http://localhost:3000", "/settings/billing")).toBe(
      "http://localhost:3000/settings/billing",
    );
  });

  it("refuses a missing, malformed or plain-http non-local site URL", () => {
    expect(billingReturnUrl(undefined, "/x")).toBeNull();
    expect(billingReturnUrl("not a url", "/x")).toBeNull();
    expect(billingReturnUrl("http://fiscalis.example", "/x")).toBeNull();
  });

  it("stays on the site's origin whatever the path", () => {
    expect(billingReturnUrl("https://fiscalis.example", "//evil.example/x")).toBeNull();
    expect(billingReturnUrl("https://fiscalis.example", "https://evil.example/x")).toBeNull();
  });
});
