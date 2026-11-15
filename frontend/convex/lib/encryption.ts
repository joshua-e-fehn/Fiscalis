"use node";

/**
 * Encryption of stored provider secrets (Plaid access tokens, SnapTrade
 * user secrets, Bitpanda API keys): AES-256-GCM with versioned keys from
 * the environment, so the key can be rotated (ENG-240). The format and key
 * handling live in services/security/secretEncryption.ts; rotation is
 * documented in docs/ENCRYPTION_KEY_ROTATION.md.
 *
 * Used in Convex actions, which run in Node.js.
 */

import {
  decryptSecret,
  encryptSecret,
  keyringFromEnv,
  needsReencryption,
  type Keyring,
} from "../../../services/security/secretEncryption";

/** The keyring the deployment's environment configures. */
export function getKeyring(): Keyring {
  return keyringFromEnv(process.env);
}

/** Encrypts with the newest configured key. */
export function encrypt(text: string): string {
  return encryptSecret(text, getKeyring());
}

/** Decrypts a ciphertext written with any configured key version. */
export function decrypt(encryptedText: string): string {
  return decryptSecret(encryptedText, getKeyring());
}

export { needsReencryption };
