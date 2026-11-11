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

```json
{
  "object": "net_worth",
  "netWorth": 123456.78,
  "totalAssets": 150000.0,
  "totalLiabilities": 26543.22,
  "currency": "EUR",
  "asOf": "2026-11-11T12:00:00.000Z"
}
```

The value is computed live from your stored accounts, the same way as the
portfolio snapshots (`frontend/convex/lib/netWorth.ts`). It reflects the last
provider sync. Vault metals are valued at live spot (refreshed every 15 minutes),
the same way as the dashboard. An item falls back to its purchase price if no
spot price from the last 7 days is available.

### Errors

| Status | `error.code`     | Meaning                                                      |
| ------ | ---------------- | ------------------------------------------------------------ |
| 401    | `unauthorized`   | Missing, malformed, unknown, expired or revoked key          |
| 429    | `rate_limited`   | More than 60 requests in a minute for this key; see `Retry-After` |
| 500    | `internal_error` | Unexpected server error                                      |

Errors share one shape: `{ "error": { "code": "...", "message": "..." } }`.
All responses carry `Cache-Control: no-store`.

## Implementation

- `services/apiKeys/apiKeyService.ts`: key format, hashing, header parsing, expiry, rate-limit math (unit-tested)
- `frontend/convex/apiKeys.ts`: create, list and revoke keys (Clerk-authenticated), plus the internal mutation that authenticates, rate-limits and reads in one transaction
- `frontend/convex/http.ts`: the HTTP route
- `frontend/app/(root)/settings/api-keys/page.tsx`: key management UI
