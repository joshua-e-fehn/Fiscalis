import { describe, expect, it } from "vitest";

import { describeError, redactSecrets } from "./providerError";

/** Shape of an axios error as the Plaid and SnapTrade SDKs throw it. */
function axiosError(data: unknown, status = 400) {
  const error = new Error(`Request failed with status code ${status}`) as Error & Record<string, unknown>;
  error.name = "AxiosError";
  error.code = "ERR_BAD_REQUEST";
  error.isAxiosError = true;
  error.config = {
    url: "https://api.snaptrade.com/api/v1/snapTrade/login?userId=u1&userSecret=super-secret-value",
    headers: { "PLAID-CLIENT-ID": "client-id-123", "PLAID-SECRET": "plaid-secret-456", Signature: "sig-789" },
    data: JSON.stringify({ access_token: "access-production-abc-123" }),
  };
  error.request = { _header: "POST /item/get\r\nPLAID-SECRET: plaid-secret-456" };
  error.response = { status, data, headers: { "set-cookie": "session=xyz" }, config: error.config };
  return error;
}

describe("describeError", () => {
  it("keeps status, code and Plaid error fields but never config, headers or request", () => {
    const summary = describeError(
      axiosError({
        error_type: "ITEM_ERROR",
        error_code: "ITEM_LOGIN_REQUIRED",
        error_message: "the login details of this item have changed",
        display_message: null,
        request_id: "req-1",
      }),
    );
    expect(summary).toEqual({
      name: "AxiosError",
      message: "Request failed with status code 400",
      code: "ERR_BAD_REQUEST",
      status: 400,
      provider: {
        error_type: "ITEM_ERROR",
        error_code: "ITEM_LOGIN_REQUIRED",
        error_message: "the login details of this item have changed",
        request_id: "req-1",
      },
    });
    const logged = JSON.stringify(summary);
    for (const secret of ["plaid-secret-456", "client-id-123", "super-secret-value", "access-production-abc-123", "sig-789", "session=xyz"]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("keeps SnapTrade error fields", () => {
    const summary = describeError(axiosError({ status: 401, code: "1076", detail: "Invalid userID or userSecret provided" }, 401));
    expect(summary.status).toBe(401);
    expect(summary.provider).toEqual({ status: 401, code: "1076", detail: "Invalid userID or userSecret provided" });
  });

  it("redacts a credential echoed in a message or body", () => {
    expect(describeError(new Error("bad token access-sandbox-1234-abcd")).message).toBe("bad token access-sandbox-[redacted]");
    const summary = describeError(axiosError("userSecret=abc123&userId=u1", 500));
    expect(summary.provider).toEqual({ body: "userSecret=[redacted]&userId=u1" });
  });

  it("handles plain errors, strings and non-error values", () => {
    expect(describeError(new TypeError("x is undefined"))).toEqual({ name: "TypeError", message: "x is undefined" });
    expect(describeError("plain failure")).toEqual({ message: "plain failure" });
    expect(describeError({ apiKey: "k" })).toEqual({ message: "[non-error value thrown]" });
    expect(describeError(undefined)).toEqual({ message: "undefined" });
  });
});

describe("redactSecrets", () => {
  it("masks key=value credentials and Authorization headers", () => {
    expect(redactSecrets('{"secret":"s3cr3t","client_id":"c"}')).toBe('{"secret":"[redacted]","client_id":"c"}');
    expect(redactSecrets("Authorization: Bearer abc.def.ghi")).toBe("Authorization: Bearer [redacted]");
    expect(redactSecrets("api_key=XYZ other")).toBe("api_key=[redacted] other");
  });
});
