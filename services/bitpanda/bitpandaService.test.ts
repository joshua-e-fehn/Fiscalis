import { describe, expect, it } from "vitest";

import { normalizeHoldings } from "../../frontend/convex/lib/bitpanda";
import { getBitpandaHoldingIdentityKeys } from "../../frontend/convex/lib/bitpandaIdentity";
import { classifyBitpandaPosition } from "../../frontend/convex/lib/classification/engine";

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
