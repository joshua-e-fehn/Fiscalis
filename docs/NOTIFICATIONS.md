# Notifications (ENG-207)

Fiscalis has an in-app notification centre: the bell in the header, the
Notifications page (`/notifications`) and Settings > Notifications. Email
alerts are wired in the backend but switched off. They stay off until the
owner sets up a sending domain (see "Turning on email" below).

## What creates a notification

| Type (preference) | When | Dedupe |
| --- | --- | --- |
| `syncFailed` | A Plaid item, SnapTrade connection or Bitpanda connection gets the status `error` (`banking.updateItemStatus`, `brokers.updateConnectionStatus`, `bitpanda.updateConnectionStatus`). A `transient_error` does not notify because the next sync retries it. | One per connection per UTC day |
| `connectionReauth` | SnapTrade `reauth_required` (sync or `connection_broken` webhook), Bitpanda `needs_reauth`, a Plaid `pending_reauth`, or a Plaid `error` with `ITEM_LOGIN_REQUIRED` (sync or webhook) | One per connection per UTC day |
| `consentExpiring` | A Plaid item's end of consent (or expected disconnect) is within 14 days (`banking.updateItemConsent`: every balance sync and the `PENDING_EXPIRATION` / `PENDING_DISCONNECT` webhooks) | One per item and end date |
| `netWorthChange` | Today's snapshot differs from the previous day's by 10% or more (`portfolioSnapshots.takeSnapshot`). Skipped for partial snapshots, when the previous net worth is below 1,000, or when the previous snapshot is more than 7 days old | One per UTC day |
| `billing` | Stripe webhook `customer.subscription.created`, `customer.subscription.deleted` or `invoice.payment_failed` (`http.ts`, `onEvent`). The user comes from the subscription metadata that checkout sets | One per Stripe object |

The rules live in `services/notifications/notifications.ts` and are tested in
`notifications.test.ts`. All writers call `notify()` in
`frontend/convex/lib/notifications.ts`, which checks the user's preference
and the dedupe key. `notify()` never throws, so a notification problem cannot
break a sync or a webhook.

Notifications store message keys plus parameters (namespace `notifications`,
`messages.<message>.title|body`), not rendered text. The app renders them in
the viewer's language and the email in the recipient's. The daily cron
`prune-notifications` (04:45 UTC) deletes rows older than 90 days. Both
tables are included in the GDPR export and account deletion
(`USER_DATA_TABLES`).

## Preferences

The default for each type is in-app on and email off. Settings >
Notifications saves one `notificationPreferences` row per type. When a user
switches a type off in the app but leaves email on, the row is still written
(with `inApp: false`) so the dedupe still applies. It is hidden from the bell
and the list.

## Turning on email (owner, later)

Nothing in this list has been done yet. Sending stays off until **all** of
these steps are complete.

1. **Buy a dedicated Fiscalis domain**, for example `fiscalis.app`.
   A separate subdomain for mail, such as `mail.fiscalis.app`, keeps the
   root domain's reputation separate.
2. **Create a Resend account** and add the mail domain under Domains.
3. **Add the DNS records Resend shows** at the domain's DNS host:
   - the DKIM `TXT` record(s) (`resend._domainkey...`)
   - the SPF `TXT` record and the bounce `MX` record on the `send` subdomain
   - a DMARC `TXT` record at `_dmarc` (start with
     `v=DMARC1; p=none; rua=mailto:<your address>`, tighten later)

   Wait until Resend marks the domain **Verified**.
4. **Create an API key** in Resend with "Sending access" restricted to that
   domain, and store it in the vault.
5. **Set the Convex environment variables** on the production deployment.
   Run a dry run first and use `--env-file ~/.config/fiscalis/convex-prod.env`.
   Set them on dev too if you want to test there.
   - `RESEND_API_KEY`: the key from step 4
   - `NOTIFICATION_EMAIL_FROM`: the sender, for example
     `Fiscalis <alerts@mail.fiscalis.app>`. It must be on the verified domain
   - `SITE_URL`: the app's origin (already used by billing), for the "Open
     Fiscalis" link
   - `CLERK_SECRET_KEY`: the Clerk production secret key, so the action can look
     up the recipient's primary email address (`GET /v1/users/{id}`). Without
     it, every email is skipped.
6. **Flip the flag**: `NOTIFICATION_EMAIL_ENABLED=true`. Any other value,
   including leaving it unset, keeps email off. Settings > Notifications shows
   "Email alerts are not switched on yet" until the flag is on.
7. **Test with your own account**: switch email on for one type, then trigger
   it (on dev, for example, run `internal.notifications.notifyUser` from the
   dashboard). Check the email and its headers (DKIM pass, SPF pass).

### How sending works

`notify()` schedules `internal.notificationEmail.sendNotificationEmail` only
when the user opted in to email for that type **and** the flag is on. The
action checks the flag again, renders the title and body from the
recipient's catalogue (`userSettings.language`, English as fallback), looks
up the address at Clerk and posts to `https://api.resend.com/emails`. It does
nothing if `RESEND_API_KEY` or `NOTIFICATION_EMAIL_FROM` is missing. A sent
email sets `emailedAt`. Failures are logged and not retried, because the
alert is still in the notification centre.

To turn email off again, unset `NOTIFICATION_EMAIL_ENABLED` or set it to
anything other than `true`. Saved preferences are kept.
