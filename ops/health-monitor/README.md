# Fiscalis health monitor

Polls the production Convex deployment's `GET /health/deep`
(`https://handsome-gecko-941.convex.site/health/deep`, defined in
`frontend/convex/http.ts`) every five minutes from the Mya VPS, and posts to
Mya's Slack home channel when the state changes: once when it starts
failing, once when it recovers. Nothing is posted while the state holds.

## What `/health/deep` checks

`200 {"ok": true, ...}` when every check passes, `503` otherwise. The body is
`{ ok, checks: [{ name, ok, ageSeconds, threshold, skipped? }] }` with ages
and thresholds in seconds. No user data. Thresholds are constants in
`services/health/freshness.ts`:

| Check | Newest record | Fails when |
| --- | --- | --- |
| `metal-price-ticks` | newest `metalPriceTicks` row | older than 10 min (the ingest runs every minute) |
| `metal-price-archive` | newest `metalPriceArchive` day | yesterday (UTC) not archived by 01:00 UTC. Skipped without `METAL_ARCHIVE_*` |
| `fx-rates` | `jobHeartbeats` `fx-refresh` | no successful FX refresh in 8 h (cron every 6 h) |
| `provider-sync` | `jobHeartbeats` `provider-sync` | no successful scheduled provider sync in 26 h. Skipped unless `SCHEDULED_SYNC_ENABLED=true` |

## How the monitor decides

- A poll is healthy only on HTTP 200 with `ok: true`. A 503, any other
  status, a body that is not a health report, or no answer at all counts
  as failing.
- A new state is announced after it has been seen on 2 runs in a row
  (`FISCALIS_HEALTH_CONFIRM_RUNS`), so a single network blip does not alert.
- If the Slack post fails, the announced state does not change and the
  next run tries again. State is kept in
  `/var/lib/fiscalis-health-monitor/state.json`.
- Slack: Mya's existing bot posts with `SLACK_BOT_TOKEN` to
  `SLACK_HOME_CHANNEL`, the same values `camsocs-alert`/`camsocs-notify`
  use. `install.sh` copies only those two lines of Mya's env file
  (`/docker/hermes-agent-vspa/data/.env`) to
  `/etc/fiscalis-health-monitor/slack.env` (0600 root). The unit reads them
  as a systemd credential. It does not create a Slack app or token.

## Install (Mya VPS)

Install only after the PR is merged and `/health/deep` is live in
production (`curl -s https://handsome-gecko-941.convex.site/health/deep`
returns JSON, not 404). From an up-to-date `main` checkout on the MacBook:

```bash
scp -r ops/health-monitor mya:/tmp/fiscalis-health-monitor
ssh mya 'bash /tmp/fiscalis-health-monitor/install.sh --dry-run'
ssh mya 'bash /tmp/fiscalis-health-monitor/install.sh && rm -rf /tmp/fiscalis-health-monitor'
```

The two heartbeat checks have no record until their jobs first succeed
after the deploy. `fx-rates` fails until the next FX refresh (at most 6 h,
or run `fxRates:refreshFxRates` once), and `provider-sync` fails until the
next 06:00 UTC sync. Install after both have run, or expect one "failing"
and one "recovered" message.

The install is idempotent, so you can re-run it to update the script or to
pick up a rotated Mya token.

## Operate

```bash
ssh mya 'systemctl list-timers fiscalis-health-monitor.timer --no-pager'
ssh mya 'journalctl -u fiscalis-health-monitor.service -n 20 --no-pager'
ssh mya 'cat /var/lib/fiscalis-health-monitor/state.json'
ssh mya '/usr/bin/python3 -I /usr/local/lib/fiscalis-health-monitor/fiscalis-health-monitor.py --dry-run'
```

To remove it: `systemctl disable --now fiscalis-health-monitor.timer`, then
delete the two units, `/usr/local/lib/fiscalis-health-monitor` and
`/etc/fiscalis-health-monitor`.

## Tests

```bash
python3 -m unittest discover -s ops/health-monitor
```
