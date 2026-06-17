# Bitpanda Integration

Bitpanda is a first-class provider alongside Plaid (banking), SnapTrade (brokers),
Vezgo (crypto) and the manual Vault. Because Bitpanda holds a **mix** of asset
classes (crypto, precious metals, commodities, fractional stocks/ETFs, crypto
indices and fiat), it is its own provider and each holding is routed to the right
investment category by the shared classification engine.

## Auth model (different from the other providers)

Plaid / SnapTrade / Vezgo are OAuth aggregators. **Bitpanda is a direct REST API**
authenticated with a per-user **read-only API key** (`X-Api-Key` header) the user
generates in their Bitpanda account. There is **no SDK, no OAuth popup, no token
refresh**. A connection is simply an encrypted API key.

- The key is encrypted with AES-256-GCM ([convex/lib/encryption.ts](../frontend/convex/lib/encryption.ts))
  using the existing `CONVEX_ENCRYPTION_KEY`. **No global Bitpanda secret/env var is
  required** — keys are per-user and stored in `bitpandaConnections.apiKey`.
- A revoked/expired key surfaces as a `401/403` → the connection is flipped to
  `status: "error"` with a "reconnect" message (there is no refresh path).
- The API key is never returned by any public query (see `sanitizeConnection` in
  [convex/bitpanda.ts](../frontend/convex/bitpanda.ts)).

## Data flow

```
connect(apiKey) → validate → encrypt → bitpandaConnections
  → syncConnectionInternal:  /asset-wallets + /fiatwallets + public /ticker
       → normalizeHoldings → classifyBitpandaPosition → bitpandaHoldings
  → syncTransactionsInternal: /trades + /wallets/transactions
       + /fiatwallets/transactions + /assets/transactions/commodity
       → normalizeTransactions → bitpandaTransactions
  → portfolioSnapshots.takeSnapshot
```

Holdings are valued in **EUR**. The Bitpanda wallet endpoints return balances in
asset units, so prices come from Bitpanda's public, unauthenticated
`GET /v1/ticker` (single call, self-consistent with the holdings). Fiat balances
are converted with [classification/currency.ts](../frontend/convex/lib/classification/currency.ts).

Key files:
- REST client + normalizers: [convex/lib/bitpanda.ts](../frontend/convex/lib/bitpanda.ts)
- Schema: `bitpandaConnections` / `bitpandaHoldings` / `bitpandaTransactions` in [convex/schema.ts](../frontend/convex/schema.ts)
- Queries/mutations: [convex/bitpanda.ts](../frontend/convex/bitpanda.ts)
- Actions (connect/sync/delete): [convex/actions/bitpanda.ts](../frontend/convex/actions/bitpanda.ts)
- Classification: `classifyBitpandaPosition` in [engine.ts](../frontend/convex/lib/classification/engine.ts) + `bitpanda_*` rules in [rules.ts](../frontend/convex/lib/classification/rules.ts)
- Frontend: [BitpandaConnectButton](../frontend/components/atomic/atoms/BitpandaConnectButton.tsx), [hooks/convex/bitpanda.ts](../frontend/hooks/convex/bitpanda.ts), [integrations/bitpanda page](../frontend/app/(root)/integrations/bitpanda/page.tsx)
- Cron (6h): `sync-bitpanda-connections` in [crons.ts](../frontend/convex/crons.ts); daily sync wired in [actions/syncAll.ts](../frontend/convex/actions/syncAll.ts)

## Asset-class → category mapping

The Bitpanda asset class is normalized in `convex/lib/bitpanda.ts` to one of
`crypto | metal | commodity | stock | etf | index | fiat`, then classified:

| Normalized assetType | Category    | Subcategory                         |
| -------------------- | ----------- | ----------------------------------- |
| crypto (BTC/ETH)     | crypto      | bitcoin / ethereum (by symbol)      |
| crypto (other)       | crypto      | altcoins                            |
| crypto (USDC/USDT…)  | crypto      | stablecoins (by symbol)             |
| index (BCI)          | crypto      | altcoins                            |
| metal                | commodities | metals                              |
| commodity            | commodities | energy                              |
| stock                | equities    | stocks                              |
| etf                  | equities    | etfs                                |
| fiat (EUR)           | cash        | savings-accounts                    |
| fiat (non-EUR)       | cash        | forex                               |

Users can override any holding's category (`bitpanda.setUserOverride`); overrides
are preserved across re-syncs (matched by `assetType:symbol`).

## Open verification item (needs a live read-only key)

The wallet parser (`extractWalletGroups`) walks the `/asset-wallets` tree
defensively rather than hard-coding one shape, because the exact JSON paths and
**whether Bitpanda Stocks/ETFs and Crypto Indices are exposed via the public API**
need confirmation against a real key. If those asset classes aren't returned, they
simply produce no holdings — the architecture is unaffected. When verifying:

1. Hit `/asset-wallets`, `/fiatwallets`, `/trades`, the transaction endpoints and
   `/v1/ticker`; confirm the field names probed in `readSymbol` / `readBalance`
   and the transaction field names match the live payloads.
2. Confirm stocks/ETFs/indices grouping keys, and extend `normalizeAssetClass`
   if Bitpanda uses different keys.

## Manual verification (no automated test runner in `frontend/`)

1. `bunx convex codegen` + `npx tsc --noEmit` — clean.
2. Start the app, open **Integrations → Bitpanda**, paste a read-only key:
   - Invalid key → inline error, nothing persisted.
   - Valid key → connection appears; holdings show up under crypto / commodities /
     equities / cash; EUR values populated; transactions stored.
   - "Sync now" updates `lastSyncAt`; "Disconnect" removes holdings + snapshots.
3. Confirm net-worth-by-provider and allocation charts include a Bitpanda slice.
4. Run `internal.actions.bitpanda.scheduledSyncAllAction` from the Convex
   dashboard to confirm cron sync works without an auth context.
