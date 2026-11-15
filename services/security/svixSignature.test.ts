import { describe, expect, it } from "vitest";
import {
  SVIX_TOLERANCE_SECONDS,
  signSvixPayload,
  verifySvixSignature,
} from "./svixSignature";

// The worked example from the Svix manual-verification docs
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const TIMESTAMP = "1614265330";
const BODY = '{"test": 2432232314}';
const SIGNATURE = "g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";
const NOW = Number(TIMESTAMP) * 1000;

describe("verifySvixSignature", () => {
  it("matches the documented signature", async () => {
    expect(await signSvixPayload(SECRET, ID, TIMESTAMP, BODY)).toBe(SIGNATURE);
    expect(
      await verifySvixSignature(
        SECRET,
        { id: ID, timestamp: TIMESTAMP, signature: `v1,${SIGNATURE}` },
        BODY,
        NOW,
      ),
    ).toEqual({ ok: true });
  });

  it("accepts any of several signatures (secret rotation)", async () => {
    const result = await verifySvixSignature(
      SECRET,
      {
        id: ID,
        timestamp: TIMESTAMP,
        signature: `v1,b3RoZXI= v1,${SIGNATURE}`,
      },
      BODY,
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a changed body", async () => {
    const result = await verifySvixSignature(
      SECRET,
      { id: ID, timestamp: TIMESTAMP, signature: `v1,${SIGNATURE}` },
      '{"test": 1}',
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects another version prefix", async () => {
    const result = await verifySvixSignature(
      SECRET,
      { id: ID, timestamp: TIMESTAMP, signature: `v2,${SIGNATURE}` },
      BODY,
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a timestamp outside the tolerance", async () => {
    const result = await verifySvixSignature(
      SECRET,
      { id: ID, timestamp: TIMESTAMP, signature: `v1,${SIGNATURE}` },
      BODY,
      NOW + (SVIX_TOLERANCE_SECONDS + 1) * 1000,
    );
    expect(result).toEqual({ ok: false, reason: "stale" });
  });

  it("rejects missing headers", async () => {
    const result = await verifySvixSignature(
      SECRET,
      { id: null, timestamp: TIMESTAMP, signature: `v1,${SIGNATURE}` },
      BODY,
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("reports a secret that is not base64", async () => {
    const result = await verifySvixSignature(
      "whsec_***",
      { id: ID, timestamp: TIMESTAMP, signature: `v1,${SIGNATURE}` },
      BODY,
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "bad_secret" });
  });
});
