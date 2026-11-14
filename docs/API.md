# Fiscalis API

A minimal, read-only REST API for reading your own data programmatically.
Today it exposes exactly one resource: your current net worth.

## Authentication

1. In the app, open **Settings → API Keys** (`/settings/api-keys`) and create a key.
2. Copy it immediately. It is shown once. Fiscalis stores only a SHA-256 hash.
3. Send it as a bearer token:

```bash
curl -H "Authorization: Bearer $FISCALIS_API_KEY" \
  https://<deployment>.convex.site/api/v1/net-worth
```

The settings page shows the exact URL for your deployment.

- Keys look like `fis_` followed by 43 base64url characters (256 bits of randomness).
- Keys are only accepted in the `Authorization` header, never in the query string.
- Keys are scoped to the account that created them and to `networth:read`.
- Keys can expire (30 days, 90 days, 1 year, or never) and can be revoked at any
  time. Revocation applies to the next request.
- At most 10 active keys per account.
- No CORS headers are sent. Call the API from a server, script or CLI, not from browser JavaScript.

## `GET /api/v1/net-worth`

### Query parameters

| Parameter  | Values                       | Default | Meaning |
| ---------- | ---------------------------- | ------- | ------- |
| `currency` | `EUR`, `USD`, `GBP`, `CHF`   | `EUR`   | The currency of every amount in the response. Case-insensitive |

Amounts are stored and aggregated in EUR. Without `currency` the response is
in EUR, whatever display currency is set in the app, so existing clients see
no change. With another currency every amount is converted from EUR at the
latest mirrored daily exchange rate (ECB reference rates), then rounded to
cents; `fxRateDate` says which day's rate was used.

```bash
curl -H "Authorization: Bearer $FISCALIS_API_KEY" \
  "https://<deployment>.convex.site/api/v1/net-worth?currency=CHF"
```

### Response

```json
{
  "object": "net_worth",
  "netWorth": 123456.78,
  "totalAssets": 150000.0,
  "totalLiabilities": 26543.22,
  "currency": "EUR",
  "fxRateDate": null,
  "asOf": "2026-11-11T12:00:00.000Z",
  "dataAsOf": "2026-11-11T06:00:41.000Z",
  "categories": [
    {
      "category": "cash",
      "value": 20000.0,
      "subcategories": [
        { "subcategory": "savings-accounts", "value": 14000.0 },
        { "subcategory": "checking-accounts", "value": 5000.0 },
        { "subcategory": "broker-cash", "value": 1000.0 }
      ],
      "sources": [
        { "source": "bank", "value": 19000.0 },
        { "source": "brokerAccount", "value": 1000.0 }
      ]
    },
    {
      "category": "equities",
      "value": 80000.0,
      "subcategories": [
        { "subcategory": "etfs", "value": 60000.0 },
        { "subcategory": "stocks", "value": 20000.0 }
      ],
      "sources": [{ "source": "brokerPosition", "value": 80000.0 }]
    },
    { "category": "bonds", "value": 0, "subcategories": [], "sources": [] },
    {
      "category": "crypto",
      "value": 30000.0,
      "subcategories": [{ "subcategory": "bitcoin", "value": 30000.0 }],
      "sources": [{ "source": "bitpanda", "value": 30000.0 }]
    },
    {
      "category": "commodities",
      "value": 20000.0,
      "subcategories": [{ "subcategory": "metals", "value": 20000.0 }],
      "sources": [
        { "source": "vault", "value": 15000.0 },
        { "source": "bitpanda", "value": 5000.0 }
      ]
    },
    { "category": "real-estate", "value": 0, "subcategories": [], "sources": [] },
    { "category": "collectibles", "value": 0, "subcategories": [], "sources": [] },
    { "category": "unclassified", "value": 0, "subcategories": [], "sources": [] },
    {
      "category": "liabilities",
      "value": 26543.22,
      "subcategories": [
        { "subcategory": "loans", "value": 25000.0 },
        { "subcategory": "credit-cards", "value": 1543.22 }
      ],
      "sources": [
        { "source": "loan", "value": 25000.0 },
        { "source": "bank", "value": 1543.22 }
      ]
    }
  ]
}
```

The value is computed live from your stored accounts, the same way as the
portfolio snapshots (`frontend/convex/lib/netWorth.ts`). It reflects the last
provider sync. Vault metals are valued at live spot (refreshed every 15 minutes),
the same way as the dashboard. An item falls back to its purchase price if no
spot price from the last 7 days is available.

### Fields

| Field              | Type             | Meaning |
| ------------------ | ---------------- | ------- |
| `object`           | `"net_worth"`    | Resource type |
| `netWorth`         | number           | `totalAssets` minus `totalLiabilities` |
| `totalAssets`      | number           | Sum of everything owned, net of any negative asset balance |
| `totalLiabilities` | number           | Sum of everything owed, as a positive number |
| `currency`         | `"EUR"`, `"USD"`, `"GBP"` or `"CHF"` | The currency of every amount: the `currency` parameter, `"EUR"` without one |
| `fxRateDate`       | `YYYY-MM-DD` string or `null` | The day of the EUR exchange rate the amounts were converted at. `null` for EUR (no conversion), and for another currency when no mirrored rate exists and an approximate built-in rate was used. A date more than a week old means the rate mirror has not refreshed since |
| `asOf`             | ISO 8601 string  | When the request was served. It says nothing about the data's age |
| `dataAsOf`         | ISO 8601 string or `null` | How fresh the data is: the oldest sync or price time among your holdings, so one stale provider makes it old. `null` when no holding carries a time (for example only loans, or vault items without a spot price) |
| `categories`       | array            | The breakdown described below. Always all nine categories, in the order shown, including empty ones |

Each entry of `categories`:

| Field           | Type   | Meaning |
| --------------- | ------ | ------- |
| `category`      | string | `cash`, `equities`, `bonds`, `crypto`, `commodities`, `real-estate`, `collectibles`, `unclassified` or `liabilities` |
| `value`         | number | The category's total. For `liabilities` it is the amount owed, as a positive number |
| `subcategories` | array  | `{ subcategory, value }` per subcategory, largest first (ties by name) |
| `sources`       | array  | `{ source, value }` per source, largest first (ties by name) |

- **Sign convention.** `liabilities.value` is the amount owed and equals
  `totalLiabilities` exactly. The eight asset categories sum to `totalAssets`
  up to rounding.
- **Conversion.** Every amount, the breakdown included, is converted at the
  same rate before it is rounded. Point-in-time only: there is no history in
  the response, so one rate applies to the whole body.
- **Rounding.** Every amount is rounded to cents on its own, so a sum of parts
  can differ from its total by up to half a cent per part: a few cents in
  practice, not at most one. A part that rounds to zero is left out, so a
  non-zero category can list fewer parts than it has, or none. Compare sums
  with a tolerance, not for equality.
- **Negative assets.** An asset category, subcategory or source can be
  negative (an overdrawn account, a short position). It nets against the rest
  of its category and of `totalAssets`, and sorts after the positive parts.
- **Credit balances.** A liability account that is in credit (an overpaid card
  or loan) is money owed to you. It appears under `cash` with the subcategory
  `credit-balance`, never as negative debt.
- **Unclassified.** A holding without a known category still counts in
  `totalAssets`; it appears under `unclassified` with its stored subcategory,
  or `unknown` when none is stored.
- **Empty parts.** A subcategory or source worth nothing is left out. An empty
  category has `value: 0` and two empty arrays.
- **Sources** say where a holding comes from: `bank` (bank accounts and cards),
  `brokerPosition` (broker holdings), `brokerAccount` (broker cash and margin
  debt), `bitpanda`, `vault` (manually tracked metals) and `loan` (manually
  tracked loans). They separate, for example, vault metals from Bitpanda metals
  inside `commodities`.

Subcategories by category (`frontend/lib/types/classification.ts`). Treat the
list as open: new values can be added, and a holding in any category that has
no stored subcategory appears as `unknown`.

| Category       | Subcategories |
| -------------- | ------------- |
| `cash`         | `savings-accounts`, `checking-accounts`, `money-market`, `cds`, `treasury-bills`, `forex`, `broker-cash`, `credit-balance` |
| `equities`     | `stocks`, `etfs`, `funds`, `options`, `private` |
| `bonds`        | `government`, `corporate`, `municipal`, `savings`, `funds` |
| `crypto`       | `bitcoin`, `ethereum`, `altcoins`, `stablecoins`, `defi` |
| `commodities`  | `metals`, `energy`, `industrial`, `agricultural`, `rare-earth`, `gemstones` |
| `real-estate`  | `residential`, `commercial`, `reits`, `crowdfunding`, `land` |
| `collectibles` | `art`, `watches`, `wine`, `cars`, `jewelry`, `trading-cards`, `memorabilia`, `nfts`, `other` |
| `unclassified` | typically `unknown`; otherwise whatever subcategory is stored |
| `liabilities`  | `mortgages`, `loans`, `credit-cards`, `margin-loans` |

`dataAsOf`, `fxRateDate`, `categories` and any later additions are additive:
clients should ignore fields they do not know.

### Errors

| Status | `error.code`     | Meaning                                                      |
| ------ | ---------------- | ------------------------------------------------------------ |
| 400    | `invalid_currency` | `currency` is not one of `EUR`, `USD`, `GBP`, `CHF` (an empty value included) |
| 401    | `unauthorized`   | Missing, malformed, unknown, expired or revoked key          |
| 429    | `rate_limited`   | More than 60 requests in a minute for this key; see `Retry-After` |
| 500    | `internal_error` | Unexpected server error                                      |

Errors share one shape: `{ "error": { "code": "...", "message": "..." } }`.
All responses carry `Cache-Control: no-store`.

## Implementation

- `services/apiKeys/apiKeyService.ts`: key format, hashing, header parsing, expiry, rate-limit math (unit-tested)
- `services/portfolio/aggregate.ts`: `netWorthApiBody` and `netWorthApiBreakdown`, the response shape and its currency conversion, and `netWorthApiCurrency`, the `currency` parameter (unit-tested)
- `services/finance/displayCurrency.ts`: `DISPLAY_CURRENCIES`, the allowlist shared with the app's currency setting
- `frontend/convex/fxRates.ts`: `loadDisplayRate`, the latest mirrored rate of a currency
- `frontend/convex/apiKeys.ts`: create, list and revoke keys (Clerk-authenticated), plus the internal mutation that authenticates, rate-limits and reads in one transaction
- `frontend/convex/http.ts`: the HTTP route
- `frontend/app/(root)/settings/api-keys/page.tsx`: key management UI
