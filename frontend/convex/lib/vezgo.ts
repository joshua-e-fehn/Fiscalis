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
 * Known centralized exchanges (CEX)
 *
 * From the Vezgo SDK (github.com/wealthica/vezgo-sdk-js):
 * - The `providerCategories` option supports: ['exchanges', 'wallets', 'blockchains']
 * - A connection can belong to multiple categories at once
 *
 * We maintain lists of known providers to accurately classify them.
 */
const KNOWN_EXCHANGES = [
  // Major exchanges
  "binance",
  "coinbase",
  "kraken",
  "kucoin",
  "bitfinex",
  "gemini",
  "bitstamp",
  "okx",
  "bybit",
  "huobi",
  "crypto.com",
  "gate.io",
  // Regional/smaller exchanges
  "poloniex",
  "bittrex",
  "bitvavo",
  "bitpanda",
  "mexc",
  "upbit",
  "coinone",
  "bithumb",
  "korbit",
  "zaif",
  "bitflyer",
  "liquid",
  // Derivatives/futures
  "deribit",
  "ftx",
  "delta",
  "phemex",
  // Pro/institutional variants
  "coinbase pro",
  "binance.us",
  "binance us",
  "kraken pro",
];

/**
 * Known software/hardware wallets
 */
const KNOWN_WALLETS = [
  // Software wallets
  "metamask",
  "phantom",
  "trust",
  "exodus",
  "atomic",
  "coinomi",
  "electrum",
  "mycelium",
  "blue wallet",
  "wasabi",
  "sparrow",
  "rainbow",
  "argent",
  "zerion",
  "rabby",
  // Hardware wallets
  "ledger",
  "trezor",
  "keepkey",
  "coldcard",
  "bitbox",
  "safepal",
];

/**
 * Known blockchain address providers (direct chain connections)
 */
const KNOWN_BLOCKCHAINS = [
  "bitcoin",
  "ethereum",
  "solana",
  "polygon",
  "avalanche",
  "arbitrum",
  "optimism",
  "base",
  "bnb",
  "fantom",
  "cronos",
  "near",
  "cosmos",
  "cardano",
  "polkadot",
  "tron",
  "litecoin",
  "dogecoin",
  "ripple",
  "xrp",
];

export type ProviderCategory = "exchange" | "wallet" | "blockchain";

/**
 * Map Vezgo provider to categories based on provider name
 *
 * A connection can have multiple categories:
 * - Coinbase → ["exchange"] (CEX only)
 * - MetaMask → ["wallet"] (software wallet)
 * - Bitcoin address → ["blockchain"] (direct chain address)
 * - Binance with wallet → ["exchange", "wallet"] (both)
 *
 * Display order: exchange → wallet → blockchain
 */
export function mapProviderCategories(
  providerName?: string,
): ProviderCategory[] {
  const name = providerName?.toLowerCase() || "";
  const categories: ProviderCategory[] = [];

  // Check if it's a known exchange
  if (KNOWN_EXCHANGES.some((ex) => name.includes(ex))) {
    categories.push("exchange");
  }

  // Check if it's a known wallet
  if (KNOWN_WALLETS.some((w) => name.includes(w))) {
    categories.push("wallet");
  }

  // Check if it's a blockchain address
  if (KNOWN_BLOCKCHAINS.some((bc) => name.includes(bc))) {
    categories.push("blockchain");
  }

  // Default to wallet if no categories matched
  if (categories.length === 0) {
    categories.push("wallet");
  }

  return categories;
}

/**
 * @deprecated Use mapProviderCategories instead
 * Kept for backwards compatibility during migration
 */
export function mapProviderType(
  _vezgoType: string,
  providerName?: string,
): "exchange" | "wallet" {
  const categories = mapProviderCategories(providerName);
  return categories.includes("exchange") ? "exchange" : "wallet";
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
