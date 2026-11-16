"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { describeError } from "../../../services/security/providerError";
import {
  conservativeListing,
  securitySubcategory,
  type SecurityListing,
} from "../../../services/banking/securityTrades";
import {
  chartListing,
  searchHits,
  yahooChartUrl,
  yahooSearchUrl,
} from "../../../services/pricing/yahooQuotes";

/**
 * Every SECURITY_PRICE_REFRESH_HOURS: the price of each security a bank
 * depot holds (services/banking/securityTrades.ts), from Yahoo's public
 * search and chart endpoints, into assetPrices. Of the listings Yahoo has
 * for an ISIN the lowest recent price is stored (conservativeListing).
 * Fails softly per ISIN: the last stored price stays, and a holding
 * without any is valued at cost (lib/netWorth.ts).
 */

/** The quote type stored for a subcategory, read back by lib/netWorth.ts */
const QUOTE_TYPE_BY_SUBCATEGORY = {
  funds: "MUTUALFUND",
  etfs: "ETF",
  stocks: "EQUITY",
} as const;

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    // Yahoo answers 429 to clients without a browser-like agent
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Yahoo ${response.status}`);
  return await response.json();
}

export const refreshSecurityPrices = internalAction({
  args: {},
  handler: async (ctx): Promise<{ isins: number; stored: number }> => {
    const isins: string[] = await ctx.runQuery(
      internal.assetPrices.heldSecurityIsins,
      {},
    );
    const now = Date.now();
    const prices = [];
    for (const isin of isins) {
      try {
        const hits = searchHits(await getJson(yahooSearchUrl(isin)));
        const listings: SecurityListing[] = [];
        for (const hit of hits) {
          try {
            const listing = chartListing(
              await getJson(yahooChartUrl(hit.symbol)),
              hit.quoteType,
            );
            if (listing) listings.push(listing);
          } catch (error) {
            console.warn(`[SECURITY PRICES] ${hit.symbol}:`, describeError(error));
          }
        }
        const chosen = conservativeListing(listings, now);
        if (!chosen) continue;
        prices.push({
          isin,
          ticker: chosen.symbol,
          price: chosen.price,
          currency: chosen.currency,
          quoteType:
            QUOTE_TYPE_BY_SUBCATEGORY[
              securitySubcategory(hits.map((h) => h.quoteType))
            ],
        });
      } catch (error) {
        console.warn(`[SECURITY PRICES] ${isin}:`, describeError(error));
      }
    }
    if (prices.length === 0) return { isins: isins.length, stored: 0 };
    const result: { stored: number } = await ctx.runMutation(
      internal.assetPrices.storeSecurityPrices,
      { prices },
    );
    return { isins: isins.length, stored: result.stored };
  },
});
