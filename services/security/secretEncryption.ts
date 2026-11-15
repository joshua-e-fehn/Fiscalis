/**
 * Versioned AES-256-GCM encryption for stored provider secrets (Plaid
 * access tokens, SnapTrade user secrets, Bitpanda API keys), with key
 * rotation (ENG-240).
 *
 * Keys come from the environment: CONVEX_ENCRYPTION_KEY is version 1 and
 * ENCRYPTION_KEY_V2, ENCRYPTION_KEY_V3, ... are the later ones. Every key
 * is base64 of 32 random bytes. The newest version present encrypts; any
 * configured version decrypts.
 *
 * Ciphertext format: `v<version>:<iv>:<authTag>:<data>` (all base64). A
 * ciphertext without the version prefix (`<iv>:<authTag>:<data>`, written
 * before versioning) is version 1.
 *
 * Rotation: add ENCRYPTION_KEY_V<n+1>, run the re-encrypt migration
 * (convex/actions/secretRotation.ts) until it reports nothing left, then
 * the old key can be removed. docs/ENCRYPTION_KEY_ROTATION.md.
 *
 * Uses node:crypto: import only from "use node" Convex files and vitest.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/** The environment variable that holds key version 1. */
export const LEGACY_KEY_ENV = "CONVEX_ENCRYPTION_KEY";
const VERSIONED_KEY_ENV = /^ENCRYPTION_KEY_V([1-9][0-9]*)$/;

export interface Keyring {
  /** The version new ciphertexts are written with (the highest present). */
  current: number;
  keys: ReadonlyMap<number, Buffer>;
}

function decodeKey(name: string, value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(`${name} must be base64 of 32 bytes (256 bits)`);
  }
  return key;
}

/**
 * The keyring the environment configures. Throws when no key is set or a
 * key is not 32 bytes, naming the variable but never its value.
 */
export function keyringFromEnv(env: Record<string, string | undefined>): Keyring {
  const keys = new Map<number, Buffer>();
  const legacy = env[LEGACY_KEY_ENV];
  if (legacy) keys.set(1, decodeKey(LEGACY_KEY_ENV, legacy));

  for (const [name, value] of Object.entries(env)) {
    const match = VERSIONED_KEY_ENV.exec(name);
    if (!match || !value) continue;
    const version = Number(match[1]);
    if (version === 1) {
      // Version 1 is CONVEX_ENCRYPTION_KEY; a second name for it would let
      // two different keys claim the same version
      throw new Error(`Use ${LEGACY_KEY_ENV} for key version 1, not ${name}`);
    }
    keys.set(version, decodeKey(name, value));
  }

  if (keys.size === 0) {
    throw new Error(`${LEGACY_KEY_ENV} environment variable is not set`);
  }
  return { current: Math.max(...keys.keys()), keys };
}

/** The key version a ciphertext was written with (1 for the legacy format). */
export function ciphertextVersion(ciphertext: string): number {
  const parts = ciphertext.split(":");
  if (parts.length === 3) return 1;
  if (parts.length === 4) {
    const match = /^v([1-9][0-9]*)$/.exec(parts[0]);
    if (match) return Number(match[1]);
  }
  throw new Error("Invalid encrypted text format");
}

/** Encrypts with the keyring's newest key. */
export function encryptSecret(plaintext: string, keyring: Keyring): string {
  const key = keyring.keys.get(keyring.current);
  if (!key) throw new Error(`Encryption key version ${keyring.current} is not configured`);

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    `v${keyring.current}`,
    iv.toString("base64"),
    authTag.toString("base64"),
    data.toString("base64"),
  ].join(":");
}

/** Decrypts a ciphertext of any version the keyring holds. */
export function decryptSecret(ciphertext: string, keyring: Keyring): string {
  const version = ciphertextVersion(ciphertext);
  const key = keyring.keys.get(version);
  if (!key) throw new Error(`Encryption key version ${version} is not configured`);

  const parts = ciphertext.split(":");
  const [ivBase64, authTagBase64, data] = parts.length === 4 ? parts.slice(1) : parts;
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  if (iv.length !== IV_LENGTH) throw new Error("Invalid IV length");
  if (authTag.length !== AUTH_TAG_LENGTH) throw new Error("Invalid auth tag length");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Whether a ciphertext should be rewritten with the keyring's newest key. */
export function needsReencryption(ciphertext: string, keyring: Keyring): boolean {
  return ciphertextVersion(ciphertext) !== keyring.current;
}

/** Re-encrypts a ciphertext with the newest key (decrypting with its own). */
export function reencryptSecret(ciphertext: string, keyring: Keyring): string {
  return encryptSecret(decryptSecret(ciphertext, keyring), keyring);
}
