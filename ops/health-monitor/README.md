# Fiscalis health monitor

Runs on the Mya VPS and watches two things:

- **`/health/deep`** on production Convex
  (`https://handsome-gecko-941.convex.site/health/deep`, defined in
  `frontend/convex/http.ts`), every five minutes
  (`fiscalis-health-monitor.timer`).
- **The S3 price archive**, daily at 01:30 UTC
  (`fiscalis-health-audit.timer`, `--audit`). The audit does not rely on
  Convex's own word: it checks every archived day's object in the bucket.

Changes go to Mya's Slack home channel. Anything critical is an
**EMERGENCY** and also goes to WhatsApp. healthchecks.io watches the
monitor itself, so a dead monitor alerts too.

## Checks

`/health/deep` returns `200` when every check passes and `503` otherwise. The
body is `{ ok, critical, checks: [{ name, ok, severity, ageSeconds, threshold,
skipped?, detail? }] }`, with ages and thresholds in seconds. It holds no user
data. The thresholds are in `services/health/freshness.ts`.

| Check | Severity | Fails when |
| --- | --- | --- |
| `metal-price-ticks` | critical | newest tick older than 10 min (the ingest runs every minute) |
| `metal-price-archive` | critical | yesterday (UTC) not archived by 01:00 UTC. Skipped without `METAL_ARCHIVE_*` |
| `metal-price-coverage` | warning | yesterday's archived day has fewer than 1380 rows (60 or more missing minutes) |
| `fx-rates` | warning | no successful FX refresh in 8 h (cron every 6 h) |
| `provider-sync` | warning | no scheduled provider sync in 26 h. Skipped unless `SCHEDULED_SYNC_ENABLED=true` |
| `unreachable` | critical | the monitor's own: no answer, not JSON, or a status other than 200/503 |
| `invalid` | critical | the monitor's own: JSON that is not a health report, or a 503 with no failing check |
| `archive-audit` | critical | the last S3 audit found a problem or could not run |
| `archive-audit-stale` | critical | no successful audit in 50 h |

A check name the monitor does not know, without a severity, counts as
critical. While the deployment does not report severities yet, the known
names use the column above.

## Alerts

- **Failing set.** Each run gives a set of failing check names. Each check
  is *confirmed* on its own once it has failed on 2 runs
  (`FISCALIS_HEALTH_CONFIRM_RUNS`) without 2 healthy runs in between, and
  cleared after 2 healthy runs in a row. So one blip does not alert, but a
  check that fails on every other run does, and another check flapping
  never holds a failing one back. A poll that gets no report (`unreachable`,
  `invalid`) neither fails nor clears the deployment's checks. Each change
  of the confirmed set is announced once. The message lists what newly
  failed, what recovered and what is still failing, with ages, thresholds
  and detail.
- **Routing.** If the confirmed set holds a critical check, the message
  starts with *EMERGENCY* and goes to Slack **and** WhatsApp. Warning-only
  changes go to Slack only. When a critical failure recovers, both channels
  are told.
- **Reminders.** While a critical failure stays confirmed, both channels get
  a reminder every 3 h (`FISCALIS_HEALTH_REMIND_HOURS`).
- **Delivery.** Each channel keeps track of what it was last told. If a send
  fails, only that channel is retried, on the next run. The other channel
  does not get the message twice.
- **Watchdog.** After every run the monitor pings the healthchecks.io check
  in `FISCALIS_HC_PING_URL`. It pings `/fail` when the run errored or a due
  message could not be delivered. Set the check to a 5 min period with
  about 15 min grace, and point its notifications somewhere other than this
  monitor (email or the healthchecks.io app), since it reports exactly when
  this monitor cannot. Without a URL the ping is skipped and logged.
- **Channels.** Slack uses Mya's bot (`SLACK_BOT_TOKEN` posting to
  `SLACK_HOME_CHANNEL`). WhatsApp goes to the first number of
  `WHATSAPP_ALLOWED_USERS` through Mya's bridge. It runs
  `docker exec hermes-agent-vspa-hermes-agent-1 curl … POST /send`, the same
  way as `camsocs-notify`, and never calls `GET /messages`, because that
  would take Mya's incoming messages off her queue. This is why the units
  run as root (Docker socket). The rest of the system is locked down as in
  `camsocs-notify.service`.
- **State** is kept in `/var/lib/fiscalis-health-monitor/state.json`
  (version 2). A state file from the first version loads and is migrated:
  Slack is not told again about what it already knew.

## Archive audit

`--audit` does the following:

1. Fetches `GET /health/metal-archive-ledger?days=1000`. Each day Convex
   archived since 2026-11-14 has a key, rows, bytes and SHA-256.
2. Sends a SigV4-signed `HEAD` for each ledger day with
   `x-amz-checksum-mode: ENABLED`. It compares `x-amz-checksum-sha256` with
   the ledger hash and `Content-Length` with the byte count.
3. Lists `<prefix>/minute/` (ListObjectsV2) and checks that every UTC day from
   2024-07-09 to yesterday has a non-empty object. The days before
   2026-11-14 came from the Supabase export and have no ledger entry, so
   they are only checked for presence.

It then runs a normal poll. A mismatch, a missing day or an error (after 3
tries per request) is a critical `archive-audit` failure. It stays in the
failing set until an audit passes, so reminders and recovery work as for any
check. To re-check after a fix, run
`systemctl start fiscalis-health-audit.service`.

The audit uses its own **read-only** IAM user: `s3:ListBucket` on
`arn:aws:s3:::fiscalis-price-archive-866827143157` and `s3:GetObject` on
`…/metal-prices/*`, nothing else. The key is in
`/etc/fiscalis-health-monitor/audit.env`, which only the audit unit loads.

## Install or upgrade (Mya VPS)

Before installing:

- The Convex side must be deployed. `curl -s
  https://handsome-gecko-941.convex.site/health/metal-archive-ledger?days=1`
  should return JSON, not 404.
- The healthchecks.io check must exist (period 5 min, grace 15 min).

1. Put the audit key in a root-only file on the VPS. Write it with an editor
   and never echo it:

   ```bash
   ssh mya 'install -m 600 -o root /dev/null /root/fiscalis-audit.env && ${EDITOR:-nano} /root/fiscalis-audit.env'
   # FISCALIS_ARCHIVE_AUDIT_ACCESS_KEY_ID=AKIA…
   # FISCALIS_ARCHIVE_AUDIT_SECRET_ACCESS_KEY=…
   # FISCALIS_ARCHIVE_BUCKET=fiscalis-price-archive-866827143157
   ```

2. From an up-to-date `main` checkout on the MacBook, install:

   ```bash
   scp -r ops/health-monitor mya:/tmp/fiscalis-health-monitor
   ssh mya 'bash /tmp/fiscalis-health-monitor/install.sh --dry-run --audit-env /root/fiscalis-audit.env'
   ssh mya 'FISCALIS_HC_PING_URL=https://hc-ping.com/<uuid> bash /tmp/fiscalis-health-monitor/install.sh --audit-env /root/fiscalis-audit.env --test-alert'
   ssh mya 'shred -u /root/fiscalis-audit.env; rm -rf /tmp/fiscalis-health-monitor'
   ```

   `--test-alert` sends one `[TEST]` message to Slack and WhatsApp through
   the real unit (next section) and fails the install if either does not
   go out. Leave it off to install without sending anything.

3. Run the first audit:

   ```bash
   ssh mya 'systemctl start fiscalis-health-audit.service; journalctl -u fiscalis-health-audit.service -n 5 --no-pager'
   ```

`install.sh` is idempotent. It copies `SLACK_BOT_TOKEN`, `SLACK_HOME_CHANNEL`
and `WHATSAPP_ALLOWED_USERS` from Mya's env file
(`/docker/hermes-agent-vspa/data/.env`) into
`/etc/fiscalis-health-monitor/monitor.env` (0600 root), together with the ping
URL. On a later re-run, the ping URL and the audit key are kept, so
`ssh mya 'bash /tmp/fiscalis-health-monitor/install.sh'` is enough to update
the script or pick up a rotated Mya token. To rotate the audit key, pass
`--audit-env` again. On an upgrade from the first version, the script moves
the old state out of `/var/lib/private`, so the units can run as root, and
deletes the old `slack.env`.

## Test the alert path

Sends one message labelled `[TEST]` to Slack and to WhatsApp, and prints
the result for each channel. It changes no state and pings nothing:

```bash
ssh mya 'systemctl start fiscalis-health-test.service; journalctl -u fiscalis-health-test.service -n 3 --no-pager -o cat'
```

`install.sh` generates `fiscalis-health-test.service` from
`fiscalis-health-monitor.service`: the same user, `LoadCredential`, sandbox,
address-family, syscall and IP rules, and `docker exec` under them. Only
`ExecStart` (`--test-alert`) and its runtime directory differ (a test in
`test_fiscalis_health_monitor.py` checks this). **A test only counts when it
is run this way.** Running the script by hand over ssh bypasses all of that,
so a TEST message can arrive while a real EMERGENCY would fail; the output's
`"credentials"` field then says `env file` instead of `systemd credential`.
Repeat the test after changing a unit, Docker, DNS or Mya's container.

To test the watchdog, stop the timer
(`systemctl stop fiscalis-health-monitor.timer`) and wait for healthchecks.io
to report the check as down. Then start the timer again.

## Operate

```bash
ssh mya 'systemctl list-timers "fiscalis-health-*" --no-pager'
ssh mya 'journalctl -u fiscalis-health-monitor.service -u fiscalis-health-audit.service -n 20 --no-pager'
ssh mya 'cat /var/lib/fiscalis-health-monitor/state.json'
ssh mya '/usr/bin/python3 -I /usr/local/lib/fiscalis-health-monitor/fiscalis-health-monitor.py --dry-run'
```

`--dry-run` polls and prints the decision and the messages it would send.
It needs no credentials and sends, pings and saves nothing.

To remove the monitor:

1. `systemctl disable --now fiscalis-health-monitor.timer fiscalis-health-audit.timer`
2. Delete the five units (with `fiscalis-health-test.service`), `/usr/local/lib/fiscalis-health-monitor`,
   `/etc/fiscalis-health-monitor` and `/var/lib/fiscalis-health-monitor`.
3. Delete the healthchecks.io check and the audit IAM user.

## Tests

```bash
python3 -m unittest discover -s ops/health-monitor -v
```

The SigV4 code is checked against AWS's documented S3 examples (GET object
and list objects).
