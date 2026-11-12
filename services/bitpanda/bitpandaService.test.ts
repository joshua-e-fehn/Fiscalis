import { describe, expect, it } from "vitest";

import {
  normalizeHoldings,
  normalizeTransactions,
} from "../../frontend/convex/lib/bitpanda";
import { getBitpandaHoldingIdentityKeys } from "./identity";
import { classifyBitpandaPosition } from "../classification/engine";

describe("normalizeHoldings", () => {
  it("normalizes Bitpanda fiat earn wallets with live ticker FX", () => {
    const assetWallets = {
      data: {
        type: "asset_wallets",
        attributes: {
          security: {
            type: "wallet_collection",
            attributes: {
              fiat_earn: {
                type: "wallet_collection",
                attributes: {
                  wallets: [
                    {
                      type: "wallet",
                      attributes: {
                        cryptocoin_symbol: "BCPEUR",
                        balance: "125.50000000",
                        name: "BCPEUR Wallet",
                      },
                    },
                    {
                      type: "wallet",
                      attributes: {
                        cryptocoin_symbol: "BCPUSD",
                        balance: "240.00000000",
                        name: "BCPUSD Wallet",
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    };
    const ticker = {
      BTC: { EUR: "72000", USD: "80000" },
    };

    expect(normalizeHoldings(assetWallets, [], ticker)).toEqual([
      {
        assetType: "fiat",
        symbol: "EUR",
        name: "BCPEUR Wallet",
        quantity: 125.5,
        currentPrice: 1,
        marketValue: 125.5,
        currency: "EUR",
      },
      {
        assetType: "fiat",
        symbol: "USD",
        name: "BCPUSD Wallet",
        quantity: 240,
        currentPrice: 0.9,
        marketValue: 216,
        currency: "EUR",
      },
    ]);
  });

  it("deduplicates a wallet returned in more than one collection", () => {
    const wallet = {
      id: "same-wallet-id",
      attributes: {
        cryptocoin_symbol: "BTC",
        balance: "0.25",
        name: "Bitcoin Wallet",
      },
    };
    const assetWallets = {
      data: {
        attributes: {
          cryptocoin: { attributes: { wallets: [wallet] } },
          duplicate: { attributes: { wallets: [wallet] } },
        },
      },
    };

    expect(
      normalizeHoldings(assetWallets, [], {
        BTC: { EUR: "60000" },
      }),
    ).toHaveLength(1);
  });
});

describe("Bitpanda fiat earn metadata", () => {
  it("routes native and foreign fiat to their cash subcategories", () => {
    expect(
      classifyBitpandaPosition({
        assetType: "fiat",
        symbol: "EUR",
        name: null,
      }),
    ).toMatchObject({ category: "cash", subcategory: "savings-accounts" });
    expect(
      classifyBitpandaPosition({
        assetType: "fiat",
        symbol: "USD",
        name: null,
      }),
    ).toMatchObject({ category: "cash", subcategory: "forex" });
  });

  it("keeps legacy stock identities as override aliases", () => {
    expect(getBitpandaHoldingIdentityKeys("stock", "BCPUSD")).toEqual([
      "stock:BCPUSD",
      "fiat:USD",
    ]);
    expect(getBitpandaHoldingIdentityKeys("fiat", "USD")).toEqual([
      "fiat:USD",
      "stock:BCPUSD",
    ]);
  });
});

describe("normalizeTransactions dedup", () => {
  const trade = (id: string, extra = {}) => ({
    id,
    type: "trade",
    attributes: {
      type: "buy",
      cryptocoin_symbol: "BTC",
      amount_cryptocoin: "0.001",
      amount_fiat: "50.00",
      fiat_symbol: "EUR",
      time: { date_iso8601: "2026-11-02T09:00:00+01:00" },
      ...extra,
    },
  });
  const walletTx = (id: string, extra = {}) => ({
    id,
    type: "wallet_transaction",
    attributes: {
      type: "buy",
      cryptocoin_symbol: "BTC",
      amount: "0.001",
      amount_eur: "50.00",
      time: { date_iso8601: "2026-11-02T09:00:05+01:00" },
      ...extra,
    },
  });
  const run = (trades: unknown[], crypto: unknown[]) =>
    normalizeTransactions({
      trades,
      cryptoTransactions: crypto,
      fiatTransactions: [],
      commodityTransactions: [],
    });

  it("keeps two identical savings-plan buys on the same day", () => {
    const out = run([trade("t1"), trade("t2")], []);
    expect(out.map((t) => t.bitpandaTransactionId)).toEqual(["t1", "t2"]);
  });

  it("drops the wallet copy that references a trade", () => {
    const out = run(
      [trade("t1"), trade("t2")],
      [walletTx("w1", { trade: { type: "trade", id: "t2" } })],
    );
    expect(out.map((t) => t.bitpandaTransactionId)).toEqual(["t1", "t2"]);
  });

  it("matches an unreferenced wallet copy to at most one trade", () => {
    const out = run([trade("t1")], [walletTx("w1"), walletTx("w2")]);
    expect(out.map((t) => t.bitpandaTransactionId)).toEqual(["t1", "w2"]);
  });

  it("never collapses records within one endpoint", () => {
    const out = run([], [walletTx("w1"), walletTx("w2")]);
    expect(out).toHaveLength(2);
  });
});

describe("Bitpanda classification by symbol", () => {
  it("refines crypto wallets by ticker", () => {
    expect(
      classifyBitpandaPosition({ assetType: "crypto", symbol: "BTC", name: null }),
    ).toMatchObject({ category: "crypto", subcategory: "bitcoin" });
    expect(
      classifyBitpandaPosition({ assetType: "crypto", symbol: "USDT", name: null }),
    ).toMatchObject({ category: "crypto", subcategory: "stablecoins" });
  });

  it("leaves a stock with a crypto-like ticker a stock", () => {
    expect(
      classifyBitpandaPosition({ assetType: "stock", symbol: "DAI", name: null }),
    ).toMatchObject({ category: "equities" });
  });
});
