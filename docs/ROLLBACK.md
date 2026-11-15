# Rollback and restore runbook

Production is the Vercel project `fiscalis` (https://fiscalis.joshua-fehn.de)
and the Convex deployment `handsome-gecko-941`. The Vercel production build
deploys both from the same commit (`frontend/scripts/vercel-build.sh`).

**Never point production at the dev deployment** (`blessed-ermine-693`). Do
not swap the Production `NEXT_PUBLIC_CONVEX_URL` or `CONVEX_DEPLOY_KEY` to dev
as a rollback. Dev has none of the users' data and its own encryption key.
Users would see an empty app, every write in that window would land in the
wrong deployment, and the stored provider tokens could not be decrypted.

Pick the section that matches the failure:

| What broke | Do |
| --- | --- |
| The frontend (pages, client code), Convex is fine | [1. Code rollback: frontend](#1-code-rollback-frontend) |
| Convex functions (queries, mutations, crons) | [2. Code rollback: backend](#2-code-rollback-backend) |
| Data is lost or corrupted | [3. Restore from a backup](#3-restore-from-a-backup) |

## 1. Code rollback: frontend

Promote the last good production deployment. Nothing is rebuilt, so this
takes seconds.

```bash
vercel ls fiscalis --environment production   # newest first; pick the last good one
vercel rollback <deployment-url>               # Pro: any deployment that was in production
vercel rollback status fiscalis
vercel inspect fiscalis.joshua-fehn.de         # check the domain now serves it
```

The dashboard does the same: Project → Deployments → the good deployment →
**Instant Rollback**.

- This rolls back **only the frontend**. The Convex functions stay at the
  newer version. That is fine when the newer functions are a superset of the
  older ones (the usual case for additive changes). If the older frontend
  calls something the newer backend removed or changed, use section 2.
- After a rollback Vercel stops assigning the production domain to new
  production builds (the Convex part of those builds still deploys). Once
  the fix is merged and built, promote that build with
  `vercel promote <url>`, or with **Manage** on the dashboard's production
  tile. That turns auto-assignment back on. Until then the fix's frontend is
  built but nobody sees it.
- Environment variables are not rolled back: the old build keeps the values
  it was built with.

## 2. Code rollback: backend

Convex functions are deployed only by the Vercel production build. Never push
functions to prod by hand.

1. **Revert on `main` (preferred).** `git revert <bad merge commit>` on a
   branch, open a PR, merge it. The production build deploys the reverted
   functions and the matching frontend together.
2. **Faster, when a PR is too slow:** in the Vercel dashboard, open the last
   good production deployment → **Redeploy** (without the build cache). That
   reruns `convex deploy` from the old commit, then builds the old frontend.
   Afterwards revert on `main` anyway, or the next merge ships the bad code
   again.

Schema caveat: `convex deploy` validates the schema against the data. If the
bad version wrote documents the old schema does not accept, the old deploy
fails and the bad version stays live. Then fix forward (a new PR that relaxes
the schema or repairs the documents). Restore a backup (section 3) only if
the data itself is wrong.

## 3. Restore from a backup

### Where the backups are

- **Weekly S3 snapshots** (ENG-220): `s3://fiscalis-convex-backups-866827143157/backups/YYYY-MM-DD.zip`,
  account `866827143157` (AWS SSO profile `fiscalis`), eu-central-1. The
  Mya VPS writes one every Sunday at 03:15 UTC (`ops/convex-backup/`). The
  bucket is versioned, Object Lock (governance, 30 days) protects every
  version, current objects expire after 180 days and noncurrent versions
  after 30 days.
- **Convex snapshot exports**: dashboard → `handsome-gecko-941` → Settings →
  Snapshot Export. Every `convex export`, including the weekly job's, appears
  there for a while.
- **Convex scheduled backups**, if enabled (dashboard → Settings → Backups).
- `~/fiscalis-backups/` on the MacBook: older one-off exports.

A snapshot holds every table's documents, `_id` and `_creationTime`
included, and the `rateLimiter` component's tables. It does **not** hold the
deployment's environment variables (encryption key, provider secrets) or
file storage (Fiscalis stores no files). Prod's environment stays in place
during a restore, so the encrypted fields in the snapshot remain readable.

### Download

Download with your own SSO session, not the backup writer key. The writer key
can only upload.

```bash
aws sso login --profile fiscalis
export AWS_PROFILE=fiscalis AWS_REGION=eu-central-1
aws s3api list-objects-v2 --bucket fiscalis-convex-backups-866827143157 --prefix backups/ \
  --query 'Contents[].[Key,Size,LastModified]' --output table
umask 077 && mkdir -p ~/fiscalis-restore && cd ~/fiscalis-restore
aws s3api get-object --bucket fiscalis-convex-backups-866827143157 \
  --key backups/YYYY-MM-DD.zip --checksum-mode ENABLED backup.zip
unzip -tq backup.zip
```

`--checksum-mode ENABLED` makes the CLI check the download against the
SHA-256 stored at upload. `list-object-versions` shows older versions of the
same day, if a day was uploaded twice.

### Rehearse on a scratch deployment

Always import into a throwaway deployment first, never into dev
(`blessed-ermine-693`). Run these from `frontend/` of a checkout **without**
a `.env.local` (a fresh worktree), so no deploy key overrides `--deployment`:

```bash
bunx convex deployment create joshua-fehn:fiscalis-8dea4:dev/restore-YYYYMMDD --type dev --expiration "in 2 days"
# prints the new deployment's name, e.g. reliable-tern-428
bunx convex import --deployment <scratch-name> --yes ~/fiscalis-restore/backup.zip
bunx convex export --deployment <scratch-name> --path ~/fiscalis-restore/roundtrip.zip
```

Compare the document counts per table of `backup.zip` and `roundtrip.zip`
(each `<table>/documents.jsonl` has one document per line). Then delete the
scratch deployment: dashboard → the deployment → Settings → Delete, or
`POST https://api.convex.dev/v1/deployments/<scratch-name>/delete` with your
Convex access token. The `--expiration` removes it anyway.

### Import into production

This replaces production's data. Everything written after the snapshot is
lost, so first decide whether a partial repair (a one-off mutation fixing
specific documents) would do.

1. Take a fresh export of the current state, so the restore can be undone:
   `bunx convex export --env-file ~/.config/fiscalis/convex-prod.env --path ~/fiscalis-restore/before-restore.zip`.
2. Stop the provider sync crons for the duration:
   `bunx convex env set SCHEDULED_SYNC_ENABLED false --env-file ~/.config/fiscalis/convex-prod.env`.
3. Import, replacing every table:

   ```bash
   bunx convex import --env-file ~/.config/fiscalis/convex-prod.env --replace-all ~/fiscalis-restore/backup.zip
   ```

   The CLI prints the tables and document counts it will delete and asks to
   confirm. Read the deployment name in that prompt: it must be
   `handsome-gecko-941`. `--replace-all` also clears tables that are not in
   the snapshot.
4. Turn the crons back on (`SCHEDULED_SYNC_ENABLED true`), open the app,
   check net worth and a connected account, and watch `/health/deep`
   (`ops/health-monitor`).
5. Delete `~/fiscalis-restore` (`rm -P` the ZIPs). They hold every user's data.

Never pass `--env-file` with the dev key, and never source the env files:
the keys contain `|`.

## Restore drills

| Date | Snapshot | Target | Result |
| --- | --- | --- | --- |
| 2026-11-15 | prod export, 10.6 MB, 43 tables, 153,318 documents (`backups/drill-2026-11-15.zip`) | scratch dev deployment `reliable-tern-428`, deleted afterwards | Uploaded, downloaded with the SSO profile (SHA-256 matched), imported, re-exported: the same count in every table, and identical documents (`_id`, `_creationTime` and fields), table by table. |

Repeat the drill after a schema overhaul, and at least once a quarter.
