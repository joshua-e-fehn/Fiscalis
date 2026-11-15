import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  ciphertextVersion,
  decryptSecret,
  encryptSecret,
  keyringFromEnv,
  needsReencryption,
  reencryptSecret,
} from "./secretEncryption";

const KEY_1 = randomBytes(32).toString("base64");
const KEY_2 = randomBytes(32).toString("base64");
const KEY_3 = randomBytes(32).toString("base64");

/** The pre-versioning format (iv:authTag:data), as convex/lib/encryption.ts wrote it. */
function legacyEncrypt(text: string, key: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  return `${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted}`;
}

describe("keyringFromEnv", () => {
  it("reads CONVEX_ENCRYPTION_KEY as version 1", () => {
    const keyring = keyringFromEnv({ CONVEX_ENCRYPTION_KEY: KEY_1 });
    expect(keyring.current).toBe(1);
    expect([...keyring.keys.keys()]).toEqual([1]);
  });

  it("makes the highest ENCRYPTION_KEY_V<n> current", () => {
    const keyring = keyringFromEnv({
      CONVEX_ENCRYPTION_KEY: KEY_1,
      ENCRYPTION_KEY_V3: KEY_3,
      ENCRYPTION_KEY_V2: KEY_2,
      UNRELATED: "x",
    });
    expect(keyring.current).toBe(3);
    expect([...keyring.keys.keys()].sort()).toEqual([1, 2, 3]);
  });

  it("works with only a newer key once version 1 is retired", () => {
    expect(keyringFromEnv({ ENCRYPTION_KEY_V2: KEY_2 }).current).toBe(2);
  });

  it("ignores empty variables", () => {
    expect(keyringFromEnv({ CONVEX_ENCRYPTION_KEY: KEY_1, ENCRYPTION_KEY_V2: "" }).current).toBe(1);
  });

  it("throws without any key", () => {
    expect(() => keyringFromEnv({})).toThrow(/CONVEX_ENCRYPTION_KEY/);
  });

  it("rejects a key that is not 32 bytes without echoing it", () => {
    const short = Buffer.from("too short").toString("base64");
    expect(() => keyringFromEnv({ ENCRYPTION_KEY_V2: short })).toThrow(/ENCRYPTION_KEY_V2 must be/);
    try {
      keyringFromEnv({ ENCRYPTION_KEY_V2: short });
    } catch (error) {
      expect(String(error)).not.toContain(short);
    }
  });

  it("refuses ENCRYPTION_KEY_V1 as a second name for version 1", () => {
    expect(() => keyringFromEnv({ ENCRYPTION_KEY_V1: KEY_1 })).toThrow(/CONVEX_ENCRYPTION_KEY/);
  });
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips and prefixes the current version", () => {
    const keyring = keyringFromEnv({ CONVEX_ENCRYPTION_KEY: KEY_1, ENCRYPTION_KEY_V2: KEY_2 });
    const ciphertext = encryptSecret("access-sandbox-123 äöü", keyring);
    expect(ciphertext.startsWith("v2:")).toBe(true);
    expect(ciphertextVersion(ciphertext)).toBe(2);
    expect(decryptSecret(ciphertext, keyring)).toBe("access-sandbox-123 äöü");
  });

  it("uses a fresh IV each time", () => {
    const keyring = keyringFromEnv({ CONVEX_ENCRYPTION_KEY: KEY_1 });
    expect(encryptSecret("same", keyring)).not.toBe(encryptSecret("same", keyring));
  });

  it("decrypts legacy unprefixed ciphertexts as version 1", () => {
    const legacy = legacyEncrypt("legacy-token", KEY_1);
    const keyring = keyringFromEnv({ CONVEX_ENCRYPTION_KEY: KEY_1, ENCRYPTION_KEY_V2: KEY_2 });
    expect(ciphertextVersion(legacy)).toBe(1);
    expect(decryptSecret(legacy, keyring)).toBe("legacy-token");
  });

  it("decrypts an older version after a newer key is added", () => {
    const v1 = encryptSecret("old", keyringFromEnv({ CONVEX_ENCRYPTION_KEY: KEY_1 }));
    expect(v1.startsWith("v1:")).toBe(true);
    const rotated = keyringFromEnv({ CONVEX_ENCRYPTION_KEY: KEY_1, ENCRYPTION_KEY_V2: KEY_2 });
    expect(decryptSecret(v1, rotated)).toBe("old");
  });

  it("fails when the ciphertext's key version is not configured", () => {
    const v2 = encryptSecret("x", keyringFromEnv({ ENCRYPTION_KEY_V2: KEY_2 }));
    expect(() => decryptSecret(v2, keyringFromEnv({ CONVEX_ENCRYPTION_KEY: KEY_1 }))).toThrow(
      /version 2 is not configured/,
    );
  });

  it("fails on a tampered ciphertext", () => {
    const keyring = keyringFromEnv({ CONVEX_ENCRYPTION_KEY: KEY_1 });
    const parts = encryptSecret("secret", keyring).split(":");
    const data = Buffer.from(parts[3], "base64");
    data[0] ^= 1;
    parts[3] = data.toString("base64");
    expect(() => decryptSecret(parts.join(":"), keyring)).toThrow();
  });

  it("fails when a key is swapped under the same version", () => {
    const ciphertext = encryptSecret("secret", keyringFromEnv({ ENCRYPTION_KEY_V2: KEY_2 }));
    expect(() => decryptSecret(ciphertext, keyringFromEnv({ ENCRYPTION_KEY_V2: KEY_3 }))).toThrow();
  });

  it("rejects malformed ciphertexts", () => {
    const keyring = keyringFromEnv({ CONVEX_ENCRYPTION_KEY: KEY_1 });
    expect(() => decryptSecret("not-encrypted", keyring)).toThrow(/Invalid encrypted text format/);
    expect(() => ciphertextVersion("x:a:b:c")).toThrow(/Invalid encrypted text format/);
    expect(() => decryptSecret("v1:AAAA:BBBB:CCCC", keyring)).toThrow(/Invalid IV length/);
  });
});

describe("rotation", () => {
  it("flags ciphertexts not written with the current key, and rewrites them", () => {
    const before = keyringFromEnv({ CONVEX_ENCRYPTION_KEY: KEY_1 });
    const legacy = legacyEncrypt("t1", KEY_1);
    const v1 = encryptSecret("t2", before);
    expect(needsReencryption(legacy, before)).toBe(false);
    expect(needsReencryption(v1, before)).toBe(false);

    const after = keyringFromEnv({ CONVEX_ENCRYPTION_KEY: KEY_1, ENCRYPTION_KEY_V2: KEY_2 });
    expect(needsReencryption(legacy, after)).toBe(true);
    const rewritten = reencryptSecret(legacy, after);
    expect(needsReencryption(rewritten, after)).toBe(false);

    // Once everything is on v2, version 1 can be removed
    const retired = keyringFromEnv({ ENCRYPTION_KEY_V2: KEY_2 });
    expect(decryptSecret(rewritten, retired)).toBe("t1");
    expect(decryptSecret(reencryptSecret(v1, after), retired)).toBe("t2");
  });
});
