"use node";

/**
 * Encryption utilities for sensitive data (Plaid access tokens)
 * Uses AES-256-GCM for authenticated encryption
 *
 * Note: This file is used in Convex actions which run in Node.js
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts a string using AES-256-GCM
 * @param text - The plaintext to encrypt
 * @param key - Base64-encoded 32-byte key
 * @returns Encrypted string in format: iv:authTag:encryptedData (all base64)
 */
export function encrypt(text: string, key: string): string {
  const keyBuffer = Buffer.from(key, "base64");

  if (keyBuffer.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (256 bits)");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData (all base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypts a string encrypted with the encrypt function
 * @param encryptedText - The encrypted string in format: iv:authTag:encryptedData
 * @param key - Base64-encoded 32-byte key
 * @returns The decrypted plaintext
 */
export function decrypt(encryptedText: string, key: string): string {
  const keyBuffer = Buffer.from(key, "base64");

  if (keyBuffer.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (256 bits)");
  }

  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted text format");
  }

  const [ivBase64, authTagBase64, encrypted] = parts;

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length");
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid auth tag length");
  }

  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Validates that a key is properly formatted
 * @param key - Base64-encoded key to validate
 * @returns true if key is valid 32-byte base64 string
 */
export function isValidKey(key: string): boolean {
  try {
    const keyBuffer = Buffer.from(key, "base64");
    return keyBuffer.length === 32;
  } catch {
    return false;
  }
}
