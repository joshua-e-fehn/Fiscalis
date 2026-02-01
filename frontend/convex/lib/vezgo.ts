"use node";

/**
 * Vezgo SDK utilities for crypto integrations
 *
 * Vezgo provides a unified API to connect to:
 * - Centralized exchanges (Coinbase, Binance, Kraken, etc.)
 * - Software wallets (MetaMask, Trust Wallet)
 * - Hardware wallets (Ledger, Trezor)
 * - Blockchain addresses (ETH, BTC, SOL, etc.)
 *
 * Note: This file is used in Convex actions which run in Node.js
 */

import Vezgo from "vezgo-sdk-js";

/**
 * Get a Vezgo client instance for server-side operations
 */
export function getVezgoClient() {
  const clientId = process.env.VEZGO_CLIENT_ID;
  const secret = process.env.VEZGO_SECRET;

  if (!clientId || !secret) {
    throw new Error(
      "Missing Vezgo credentials. Ensure VEZGO_CLIENT_ID and VEZGO_SECRET are set.",
    );
  }

  return Vezgo.init({
    clientId,
    secret,
  });
}

/**
 * Get a Vezgo user instance for user-specific operations
 * @param userId - The user's unique identifier (loginName)
 *
 * Note: Vezgo SDK's login() expects a loginName (userId), not a JWT token.
 * The SDK internally manages token generation/refresh.
 */
export function getVezgoUser(userId: string) {
  const vezgo = getVezgoClient();
  return vezgo.login(userId);
}

/**
 * Map Vezgo provider type to our schema type
 */
export function mapProviderType(
  vezgoType: string,
): "exchange" | "wallet" | "hardware" | "blockchain" {
  switch (vezgoType?.toLowerCase()) {
    case "exchange":
    case "cex":
      return "exchange";
    case "wallet":
    case "software":
      return "wallet";
    case "hardware":
      return "hardware";
    case "blockchain":
    case "address":
    case "chain":
      return "blockchain";
    default:
      return "wallet"; // Default to wallet for unknown types
  }
}

/**
 * Map Vezgo asset type to our category
 */
export function mapAssetCategory(
  vezgoType: string,
): "cryptocurrency" | "token" | "stablecoin" | "defi" | "nft" {
  const type = vezgoType?.toLowerCase();

  // Check for NFTs first
  if (type === "nft" || type === "collectible") {
    return "nft";
  }

  // Check for DeFi positions
  if (type === "defi" || type === "lp" || type === "staked") {
    return "defi";
  }

  // Check for stablecoins (common ones)
  const stablecoins = [
    "usdc",
    "usdt",
    "dai",
    "busd",
    "tusd",
    "usdp",
    "frax",
    "lusd",
    "susd",
  ];
  if (type && stablecoins.some((s) => type.includes(s))) {
    return "stablecoin";
  }

  // Check if it's a token vs native cryptocurrency
  if (type === "token" || type === "erc20" || type === "spl") {
    return "token";
  }

  // Default to cryptocurrency (BTC, ETH, SOL, etc.)
  return "cryptocurrency";
}

/**
 * Map Vezgo transaction type to our schema type
 */
export function mapTransactionType(
  vezgoType: string,
):
  | "buy"
  | "sell"
  | "transfer_in"
  | "transfer_out"
  | "swap"
  | "stake"
  | "unstake"
  | "reward"
  | "airdrop"
  | "mint"
  | "burn"
  | "fee"
  | "other" {
  const type = vezgoType?.toLowerCase();

  switch (type) {
    case "buy":
    case "purchase":
      return "buy";
    case "sell":
      return "sell";
    case "deposit":
    case "receive":
    case "transfer_in":
      return "transfer_in";
    case "withdrawal":
    case "send":
    case "transfer_out":
      return "transfer_out";
    case "swap":
    case "trade":
    case "exchange":
      return "swap";
    case "stake":
    case "staking":
      return "stake";
    case "unstake":
    case "unstaking":
      return "unstake";
    case "reward":
    case "interest":
    case "yield":
      return "reward";
    case "airdrop":
      return "airdrop";
    case "mint":
      return "mint";
    case "burn":
      return "burn";
    case "fee":
    case "gas":
      return "fee";
    default:
      return "other";
  }
}
