import { describe, expect, it } from "vitest";

import { CONSENT_WARNING_DAYS, consentExpiryMs, consentNotice } from "./consentExpiry";

const NOW = Date.UTC(2026, 10, 15);
const DAY = 24 * 60 * 60 * 1000;

describe("consentNotice", () => {
  it("is null without dates or when consent ends later than the warning window", () => {
    expect(consentNotice({}, NOW)).toBeNull();
    expect(consentNotice({ consentExpiresAt: NOW + (CONSENT_WARNING_DAYS + 1) * DAY }, NOW)).toBeNull();
  });

  it("warns within the window, counting whole days left", () => {
    expect(consentNotice({ consentExpiresAt: NOW + 10 * DAY - 1 }, NOW)).toEqual({
      kind: "expiring",
      at: NOW + 10 * DAY - 1,
      daysLeft: 10,
    });
    expect(consentNotice({ consentExpiresAt: NOW + CONSENT_WARNING_DAYS * DAY }, NOW)?.kind).toBe(
      "expiring",
    );
  });

  it("uses the nearer of consent end and expected disconnect", () => {
    expect(
      consentNotice({ consentExpiresAt: NOW + 20 * DAY, disconnectExpectedAt: NOW + 7 * DAY }, NOW),
    ).toMatchObject({ at: NOW + 7 * DAY, daysLeft: 7 });
    expect(consentNotice({ disconnectExpectedAt: NOW + 7 * DAY }, NOW)?.kind).toBe("expiring");
  });

  it("reports a past date as expired", () => {
    expect(consentNotice({ consentExpiresAt: NOW - DAY }, NOW)).toEqual({
      kind: "expired",
      at: NOW - DAY,
    });
  });
});

describe("consentExpiryMs", () => {
  it("parses Plaid's ISO time and ignores absent or bad values", () => {
    expect(consentExpiryMs("2026-12-01T00:00:00Z")).toBe(Date.UTC(2026, 11, 1));
    expect(consentExpiryMs(null)).toBeUndefined();
    expect(consentExpiryMs(undefined)).toBeUndefined();
    expect(consentExpiryMs("soon")).toBeUndefined();
  });
});
