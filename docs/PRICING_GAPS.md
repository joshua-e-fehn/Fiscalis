# Pricing gaps

- **Status:** Current as of 2026-11-15 (ENG-239). The owner decides on new vendors later. Nothing here has been bought or integrated.
- **Code:** the feed registry is `PRICE_FEEDS` in `services/performance/config.ts`, the refresh logic is in `services/pricing/livePrices.ts` and `frontend/convex/assetPrices.ts`, and per-asset overrides are in `services/pricing/valuationOverride.ts`. The resolution rule is in [ADR 0001](adr/0001-valuation-resolution.md).

## What "priced" means here

| Term | Meaning |
| --- | --- |
| **Live** | A provider price is read on its own schedule between full syncs: Bitpanda ticker every 10 min, SnapTrade quotes hourly 07:05-20:05 UTC on weekdays. Totals and the live end of every chart are current. |
| **Sync** | The price changes only when the provider syncs: SnapTrade and Plaid nightly, Bitpanda every 6 h, plus manual refreshes. |
| **History** | A stored price series the continuous strategy can value from at any point in time. Only vault metals have one (gold.de minutely ticks and hourly/daily closes). Every other asset's history is the daily snapshots. |
| **Manual** | No provider price exists. The user enters a valuation (manual assets) or sets a per-asset override (a manual price or a mark-to-model) on a provider holding. |

Any provider holding can now be given a manual price or a mark-to-model through **Set price** in the positions table, whatever this table says. This covers a missing or wrong provider price for now.

## Coverage by asset class

`brokerPosition` = SnapTrade, `bitpanda` = Bitpanda, `vault` = the user's own metals, `manualAsset` = manual entry.

| Category | Subcategory | Sources | Price today | What is missing |
| --- | --- | --- | --- | --- |
| cash | savings, checking, money-market, cds | Plaid | Balance at sync (nightly) | Nothing. A balance is not priced. |
| cash | treasury-bills | manual | Manual | No feed. T-bill yields would need a rates source (ECB SDW and US Treasury are free). |
| cash | forex, broker-cash | SnapTrade, Bitpanda fiat | Balance at sync. Value in EUR uses ECB rates every 6 h. | Nothing. |
| equities | stocks | SnapTrade, Bitpanda | **Live** (SnapTrade quotes, Bitpanda ticker) | No intraday history; history is the daily snapshots. Stocks held outside SnapTrade/Bitpanda cannot be added with a ticker, only as manual assets with no price. |
| equities | etfs | SnapTrade, Bitpanda | **Live** | Same as stocks. ETFs (by ISIN, e.g. Xetra/LSE UCITS) held at a broker SnapTrade does not support have no price at all. This is the largest gap for German users. |
| equities | funds (mutual funds) | SnapTrade | **Live** where SnapTrade quotes the fund, otherwise sync | NAV is daily anyway. Funds bought directly from a fund house (not via a broker) are not covered. |
| equities | options | SnapTrade | Sync | Not in the live feed: quotes for option symbols are not reliably returned, and the contract multiplier makes a bad quote costly. |
| equities | private | manual | Manual | No market exists. Mark-to-model or manual valuations only. |
| bonds | government, corporate, municipal, savings, funds | SnapTrade (classified `bonds.corporate` by default), manual | Sync for SnapTrade bonds, manual otherwise | No live bond prices from current providers. Bond pricing is quoted in % of par, with accrued interest and per-venue quotes. A mark-to-model override (accrual towards par) is the interim option. |
| crypto | bitcoin, ethereum, altcoins, stablecoins | Bitpanda | **Live** (Bitpanda ticker) | No intraday history. |
| crypto | any | SnapTrade (crypto held at a broker) | Sync | Not in the feed today. **Quick win without a new vendor:** price broker crypto from the Bitpanda ticker by symbol. |
| crypto | defi | manual | Manual | No feed. Wallet and protocol positions need an on-chain indexer. |
| commodities | metals | vault | **Live + history** (gold.de) | Nothing. |
| commodities | metals | Bitpanda | **Live** (Bitpanda ticker) | No history of its own. It could be valued from the gold.de history as the vault is. |
| commodities | metals | SnapTrade (precious-metal ETCs) | Sync | Not in the feed (they are classified as metals, not ETFs). They could join the market-data feed. |
| commodities | energy | Bitpanda (commodity wallets) | Sync | **Quick win without a new vendor:** the Bitpanda ticker prices these already. Adding an `energy` entry to the feed would make them live. |
| commodities | industrial, agricultural, rare-earth, gemstones | manual | Manual | No feed. Physical holdings have no standard unit price. |
| real-estate | reits | SnapTrade | **Live** | Same as stocks. |
| real-estate | residential, commercial, land, crowdfunding | manual | Manual | No feed. Automated valuation models exist but are paid B2B products (see below). |
| collectibles | art, watches, wine, cars, jewelry, trading-cards, memorabilia, other | manual | Manual | No feed. Each market has its own price guides, mostly without open APIs. |
| collectibles | nfts | manual | Manual | No feed. Floor prices are available from marketplace APIs. |
| liabilities | mortgages, loans, credit-cards, margin-loans | Plaid, manual loans, SnapTrade margin | Balance at sync / amortisation schedule | Nothing. A liability is not priced. |

## Known limits of the current feeds

- **SnapTrade quotes** (`getUserAccountQuotes`) belong to SnapTrade's trading API. Some brokerages or read-only connections may not support them. The refresh treats that as best effort: the error is logged and the position keeps its sync price. A quote is applied only in the position's own currency unit and within a factor of 10 of the stored price. Calls are limited per user by the `quoteRefresh` token bucket (two per hour) and run only with `SCHEDULED_SYNC_ENABLED=true`.
- **SnapTrade holdings data** can itself be cached by SnapTrade for up to a day. Quotes are the only intraday source this repo has for broker positions.
- **Bitpanda ticker** is public, needs no key and returns every asset in one request. It is read every 10 minutes on every deployment (no user data). The holdings it re-prices are only those the feed registry covers. Fiat is never re-priced; it keeps its EUR rate.
- **No intraday history** for anything but vault metals. The next step that needs no vendor is to record hourly and daily closes of `assetPrices` (the same pattern as `metalPriceCloses`) and set `history: true` on those feeds. That needs a quantity history per holding (from the synced trades) for the continuous strategy.
- `/health/deep` does not check the freshness of `assetPrices` yet. A `price-refresh` heartbeat is a small follow-up.

## Candidate vendors (for the owner's decision)

Prices and terms change often. The figures below are approximate list prices seen in late 2026 and must be checked before any decision. The licensing column matters more than the price: showing a price to app users is **redistribution**, and most cheap or free tiers are for personal or internal use only.

| Gap | Candidate | Coverage | Cost (approx.) | Licensing notes |
| --- | --- | --- | --- | --- |
| EU ETFs/stocks by ISIN, any broker | EODHD (EOD Historical Data) | 70+ exchanges incl. Xetra, LSE, Euronext; EOD + delayed intraday; ISIN lookup; some bonds | ~€20-100/month by plan | Personal plans forbid redistribution. Showing data in an app needs a commercial or "display" licence, priced on request. |
| EU ETFs/stocks | Twelve Data | Global equities/ETFs, FX, crypto; REST + WebSocket | Free tier (limited calls/day); paid from ~$30-80/month | Free and basic tiers are non-commercial. Commercial use needs an explicit plan. Real-time EU exchange data adds exchange fees. |
| US stocks/options | Polygon.io | US equities, options (OPRA), indices; history | From ~$30/month (delayed) to ~$200/month (real-time) | Individual plans are non-display/personal. Business plans with display rights cost much more. Options real-time involves OPRA fees. |
| Equities/ETFs (fallback) | Alpha Vantage | Global EOD, some intraday; FX, crypto | Free with very low rate limits; premium ~$50-250/month | Free tier is for personal use. Check redistribution terms. |
| Equities (fallback) | Financial Modeling Prep | Global EOD, fundamentals | ~$20-100/month | Redistribution needs a separate licence. |
| Not recommended | Yahoo Finance (unofficial endpoints) | Broad | Free | No API agreement. The terms forbid commercial use and the endpoints break without notice. |
| Identifier mapping (ISIN to ticker/FIGI) | OpenFIGI | Identifiers only, no prices | Free (API key raises limits) | Permissive. Useful in combination with any price vendor above. |
| Bonds | Börse Frankfurt / Börse Stuttgart data products, or EODHD's bond endpoints | Exchange-listed EU bonds | Exchange data licences are priced on request; usually expensive for display | Real bond coverage (OTC, accrued interest) is enterprise-only (Refinitiv/LSEG, Bloomberg, ICE): thousands per year at least. For a personal finance app, mark-to-model is the realistic answer. |
| Crypto beyond Bitpanda, broker crypto, DeFi tokens | CoinGecko API | 10k+ coins, history | Free "Demo" key with attribution; paid from ~$100+/month | Free use requires attribution. Commercial display needs a paid plan. |
| Crypto (alternative) | CoinMarketCap API | Coins, history on paid plans | Free basic tier; paid from ~$30+/month | Basic tier is personal or non-commercial. Check display terms. |
| Crypto (no vendor contract) | Kraken / Coinbase public market data | Their own listed pairs | Free | Exchange terms allow use of public market data, but coverage is only what the exchange lists. A second free ticker like Bitpanda's. |
| NFTs | OpenSea API | Collection floor prices | Free with API key | Rate-limited. Check terms on commercial display. |
| Residential real estate (DE) | PriceHubble, Sprengnetter, ImmoScout24 valuation | Automated valuation models | B2B, priced on request | Enterprise contracts. Results can usually be shown to the property owner, but verify. |
| Watches | Chrono24 (market data products) | Watch price indices | No public API; partnership only | n/a |
| Wine | Liv-ex | Fine-wine indices and prices | Paid membership | Data is for members. Redistribution needs agreement. |
| Trading cards | PriceCharting API | Cards, games | Low monthly fee (paid tier) | Check redistribution. |

### Suggested order (no commitment)

1. **Quick wins without a new vendor:** broker crypto and Bitpanda energy commodities from the Bitpanda ticker; Bitpanda metals and the vault's gold.de history; a `price-refresh` health check.
2. **History without a new vendor:** hourly and daily closes of `assetPrices`, then continuous valuation for stocks, ETFs and crypto.
3. **If ETFs outside SnapTrade matter:** one equities vendor with an ISIN lookup and a display licence (EODHD or Twelve Data are the cheapest to try), mapped through OpenFIGI.
4. **Bonds, real estate, collectibles:** stay manual or mark-to-model. Vendors here are enterprise-priced compared with the value they add for one user.
