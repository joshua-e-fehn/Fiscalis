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
| `netWorthChange` | Today's snapshot differs from the previous day's by 10% or more (`portfolioSnapshots.takeSnapshot`). Skipped when either snapshot is partial, when the previous net worth is below 1,000, or when the previous snapshot is more than 7 days old | One per UTC day |
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

## Email setup (status 2026-11-16)

Sending is wired up but stays **off** until `NOTIFICATION_EMAIL_ENABLED=true`.

Done:

1. **Domain**: `fiscalis.dev` (registrar and DNS at IONOS).
2. **Resend account**: signed in with Google as admin@joshua-fehn.de, team
   `joshua-fehn`, domain `fiscalis.dev` in region eu-west-1. It is separate
   from the CAMsocs Resend account, because Resend's free plan allows one
   domain per account.
3. **DNS at IONOS**: DKIM `TXT resend._domainkey`, plus `MX send` →
   `feedback-smtp.eu-west-1.amazonses.com` (priority 10) and
   `TXT send "v=spf1 include:amazonses.com ~all"`. DMARC is the
   IONOS-managed `CNAME _dmarc → dmarc.ionos.de`. Check that Resend shows the
   domain as **Verified** before you turn sending on.
4. **API key**: `fiscalis-prod-convex`, sending access. It is stored in the Mya
   vault as "Fiscalis Resend API key (sending, fiscalis.dev)".
5. **Convex prod env**: `RESEND_API_KEY`, `NOTIFICATION_EMAIL_FROM=Fiscalis
   <notifications@fiscalis.dev>`, `SITE_URL=https://fiscalis.dev` and
   `CLERK_SECRET_KEY`. The action uses the Clerk key to look up the
   recipient's address (`GET /v1/users/{id}`).

Left for the owner:

6. **Flip the flag**: `NOTIFICATION_EMAIL_ENABLED=true` (run with
   `--env-file ~/.config/fiscalis/convex-prod.env`). Any other value, including
   leaving it unset, keeps email off. Until then, Settings > Notifications
   shows "Email alerts are not switched on yet".
7. **Test with your own account**: turn email on for one type, trigger it,
   then check the email headers (DKIM pass, SPF pass).

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
