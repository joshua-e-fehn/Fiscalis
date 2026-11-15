# Fiscalis weekly Convex backup

Runs on the Mya VPS. Every Sunday at 03:15 UTC (`fiscalis-convex-backup.timer`)
it exports Convex production (`handsome-gecko-941`) and uploads the ZIP to
`s3://fiscalis-convex-backups-866827143157/backups/YYYY-MM-DD.zip`. A failure
posts to Mya's Slack home channel, using the health monitor's bot.

To restore a backup, and for code rollbacks, see
[`docs/ROLLBACK.md`](../../docs/ROLLBACK.md).

## What a run does

1. `convex export --env-file <prod key> --path <cache>/work/YYYY-MM-DD.zip`,
   with the pinned Convex CLI (`package-lock.json`, the version `frontend/`
   resolves) and node in `/usr/local/lib/fiscalis-convex-backup/`. The CLI
   reads the deploy key from its systemd credential. The key never enters the
   environment or a command line. A key for any other deployment is refused.
2. Reads the ZIP back whole: every member's CRC, `_tables/documents.jsonl`
   present, at least one document. The journal gets the counts per table.
3. One SigV4-signed `PUT` to `backups/YYYY-MM-DD.zip` with
   `x-amz-checksum-sha256`, so S3 rejects a body that arrived damaged. The
   signing and Slack code are the health monitor's own (`slack_post`,
   `sigv4_authorization`, imported from its installed script).
4. Deletes the local ZIP, whatever happened.

Exit 0 means uploaded. Anything else posts *Fiscalis Convex prod backup
FAILED* with the reason (no secret is ever in it) and exits 1.

## AWS

Account `866827143157`, member account "Fiscalis", SSO profile `fiscalis`,
eu-central-1. It is not the price archive bucket and does not use its keys.

- **Bucket** `fiscalis-convex-backups-866827143157`: all public access
  blocked, bucket-owner-enforced ownership, versioning, SSE-S3 (bucket key),
  a policy that denies non-TLS requests, Object Lock in **governance** mode
  with a 30-day default retention (set at creation). Lifecycle: current
  objects expire after 180 days, noncurrent versions 30 days after they
  become noncurrent, incomplete uploads after 7 days.
- **IAM user** `fiscalis-convex-backup-writer`: one inline policy,
  `s3:PutObject` on `backups/*` and `s3:ListBucket` on the bucket. It has no
  Get, Delete, retention or version permission: a stolen key can add
  objects, but cannot read, shorten or remove a backup. Created by
  `provision-writer.sh`, which stores the key in the Mya vault as
  **Fiscalis Convex backup writer - AWS** and in
  `~/.config/fiscalis/convex-backup-writer.env` (0600) for the install.

Restores download with an SSO session (`docs/ROLLBACK.md`), never with the
writer key.

## Install or upgrade (Mya VPS)

The health monitor (`ops/health-monitor`) must be installed: this job uses
its script and its `monitor.env`.

1. Create the writer key, once (MacBook, SSO session):

   ```bash
   aws sso login --profile fiscalis
   bash ops/convex-backup/provision-writer.sh --dry-run
   bash ops/convex-backup/provision-writer.sh
   ```

2. Copy both key files to root-only files on the VPS, without printing them:

   ```bash
   ssh mya 'install -d -m 700 /root/fiscalis-setup'
   scp ~/.config/fiscalis/convex-prod.env mya:/root/fiscalis-setup/convex.env
   scp ~/.config/fiscalis/convex-backup-writer.env mya:/root/fiscalis-setup/writer.env
   ssh mya 'chmod 600 /root/fiscalis-setup/*.env'
   rm -P ~/.config/fiscalis/convex-backup-writer.env   # the vault item is the copy that stays
   ```

3. From an up-to-date `main` checkout, install, send a test alert, then remove
   the copies:

   ```bash
   scp -r ops/convex-backup mya:/tmp/fiscalis-convex-backup
   ssh mya 'bash /tmp/fiscalis-convex-backup/install.sh --dry-run --convex-env /root/fiscalis-setup/convex.env --writer-env /root/fiscalis-setup/writer.env'
   ssh mya 'bash /tmp/fiscalis-convex-backup/install.sh --convex-env /root/fiscalis-setup/convex.env --writer-env /root/fiscalis-setup/writer.env --test-alert'
   ssh mya 'shred -u /root/fiscalis-setup/*.env; rmdir /root/fiscalis-setup; rm -rf /tmp/fiscalis-convex-backup'
   ```

4. Run the first backup and check it:

   ```bash
   ssh mya 'systemctl start fiscalis-convex-backup.service; journalctl -u fiscalis-convex-backup.service -n 15 --no-pager -o cat'
   AWS_PROFILE=fiscalis aws s3api list-objects-v2 --bucket fiscalis-convex-backups-866827143157 --prefix backups/ --query 'Contents[].[Key,Size]'
   ```

`install.sh` is idempotent. It downloads node from nodejs.org and checks it
against the SHA-256 pinned in the script, installs the CLI with
`npm ci --ignore-scripts`, copies only the named keys into
`/etc/fiscalis-convex-backup/{convex,writer}.env` (0600 root), and enables the
timer. Run without `--convex-env`/`--writer-env`, it keeps the installed keys,
so `ssh mya 'bash /tmp/fiscalis-convex-backup/install.sh'` updates the script,
units or CLI. To bump the CLI, change `package.json`, run
`npm install --package-lock-only --ignore-scripts` here, and reinstall.

The unit runs as a dynamic user. Its cache directory, where the ZIP sits for
the minutes between export and upload, is readable only by it. The keys
arrive as systemd credentials. The sandbox allows the internet but no
private ranges, as for the health monitor.

## Operate

```bash
ssh mya 'systemctl list-timers fiscalis-convex-backup.timer --no-pager'
ssh mya 'journalctl -u fiscalis-convex-backup.service -n 30 --no-pager -o cat'
ssh mya 'systemctl start fiscalis-convex-backup.service'       # a backup now (same day: a new S3 version)
```

**Rotate the writer key:** delete the old key
(`aws iam delete-access-key --user-name fiscalis-convex-backup-writer --access-key-id …`)
and the vault item, rerun `provision-writer.sh`, then install steps 2 and 3
with `--writer-env` only.

**Rotate the prod deploy key:** after updating
`~/.config/fiscalis/convex-prod.env`, run install steps 2 and 3 with
`--convex-env` only.

**Remove:** `systemctl disable --now fiscalis-convex-backup.timer`, delete the
two units, `/usr/local/lib/fiscalis-convex-backup` and
`/etc/fiscalis-convex-backup`, then the IAM user. Leave the bucket: its
lifecycle empties it over 180 days.

## Tests

```bash
python3 -m unittest discover -s ops/convex-backup -v
```

They run the whole job against a fake CLI, S3 and Slack: upload headers and
checksum, the refused dev key, an empty export, S3 retries, the failure
alert, the dry run and the test alert. The real PUT (with Object Lock) was
checked once against the bucket.
