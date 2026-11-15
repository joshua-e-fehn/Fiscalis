# Provider webhooks (ENG-240)

Plaid and SnapTrade push changes to the Convex HTTP router
(`frontend/convex/http.ts`), so the app no longer waits for the nightly sync.
Both routes are unauthenticated and trust a request only once its signature
checks out. Verification code and tests live in
`services/security/plaidWebhook.ts` and `services/security/snaptradeWebhook.ts`.

| Provider | URL (prod) | Registered |
| --- | --- | --- |
| Plaid | `https://handsome-gecko-941.convex.site/plaid-webhook` | per item: link tokens carry it, and existing items are updated by `actions/plaid:updateItemWebhooks` |
| SnapTrade | `https://handsome-gecko-941.convex.site/snaptrade-webhook` | once, by hand, in the SnapTrade dashboard (Webhooks) |

The URL comes from `CONVEX_SITE_URL`, so dev items register dev's
`.convex.site` URL.

## Plaid

- **Verification.** The `Plaid-Verification` header holds an ES256 JWT. Its
  key comes from `/webhook_verification_key/get` and is cached per action
  instance for an hour. A key with `expired_at` set is rejected, as is an
  `iat` older than 5 minutes or a body whose SHA-256 differs from
  `request_body_sha256`. A failure returns 401.
- **Events.**
  - `ITEM` `ERROR` (e.g. `ITEM_LOGIN_REQUIRED`), `USER_PERMISSION_REVOKED`
    and `USER_ACCOUNT_REVOKED` set the item to `error` with that code, and
    the reauth card appears.
  - `PENDING_EXPIRATION` stores `consentExpiresAt`.
  - `PENDING_DISCONNECT` stores `disconnectExpectedAt` (now + 7 days).
  - `LOGIN_REPAIRED` schedules a balance sync.
  - `TRANSACTIONS` `SYNC_UPDATES_AVAILABLE` schedules the incremental
    `/transactions/sync` (`syncItemTransactions`).
- **Consent expiry.** Every balance sync also mirrors
  `item.consent_expiration_time`. The bank card shows a renewal notice 30 days
  before the earlier of the two dates (`services/banking/consentExpiry.ts`).
  Renewing in update mode clears `disconnectExpectedAt`.
- **Existing items.** Run this once per deployment, after deploy:

  ```bash
  cd frontend
  bunx convex run actions/plaid:updateItemWebhooks --env-file ~/.config/fiscalis/convex-prod.env              # dry run
  bunx convex run actions/plaid:updateItemWebhooks '{"dryRun":false}' --env-file ~/.config/fiscalis/convex-prod.env
  ```

## SnapTrade

- **Verification.** The `Signature` header is base64 HMAC-SHA256, keyed with
  the consumer key (`SNAPTRADE_SECRET`). It covers the payload as Python's
  `json.dumps(payload, separators=(",", ":"), sort_keys=True)` writes it. A
  signature over the raw body is also accepted. An `eventTimestamp` older
  than 5 minutes is rejected. The deprecated `webhookSecret` field is not
  used.
- **Events.**
  - `CONNECTION_BROKEN` sets the connection to `reauth_required`.
  - `CONNECTION_DELETED` deletes the connection's local data and takes a
    snapshot.
  - `ACCOUNT_HOLDINGS_UPDATED`, `CONNECTION_FIXED` and
    `NEW_ACCOUNT_AVAILABLE` schedule a sync of that connection.
  - The payload's `userId` must match the connection's SnapTrade user.
- SnapTrade retries a failed delivery after 30 minutes or more. That retry is
  past the 5-minute window, so it is rejected, and the nightly sync covers
  anything missed.
