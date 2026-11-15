# Encryption key rotation

Fiscalis stores three kinds of provider secret encrypted (AES-256-GCM):
Plaid access tokens (`plaidItems.accessToken`), SnapTrade user secrets
(`snaptradeUsers.snaptradeUserSecret`) and Bitpanda API keys
(`bitpandaConnections.apiKey`). Since ENG-240 the keys are versioned.

## Format and keys

| Env var (Convex deployment) | Key version |
| --- | --- |
| `CONVEX_ENCRYPTION_KEY` | 1 |
| `ENCRYPTION_KEY_V2`, `ENCRYPTION_KEY_V3`, ... | 2, 3, ... |

- Each key is base64 of 32 random bytes: `openssl rand -base64 32`.
- The **highest** version present encrypts every new secret. **Any**
  configured version decrypts.
- Ciphertexts are `v<version>:<iv>:<authTag>:<data>`. One without the
  `v<n>:` prefix was written before versioning and is version 1.
- Code: `services/security/secretEncryption.ts` (format, keyring, tests),
  `frontend/convex/lib/encryption.ts` (reads the env),
  `frontend/convex/actions/secretRotation.ts` (re-encrypt migration).

Once this change is deployed, new secrets are written as `v1:...`. Code from
before ENG-240 cannot read that prefix, so rolling back past ENG-240 breaks
secrets stored after the deploy (their users would have to reconnect).

## Rotating (prod: `handsome-gecko-941`)

Run every command from `frontend/`. For prod, pass
`--env-file ~/.config/fiscalis/convex-prod.env`. Try the whole procedure on dev
(`blessed-ermine-693`) first.

1. **Generate the new key** and keep it in the vault next to the current one.
   Never paste it into chat, a ticket or a commit.

   ```bash
   openssl rand -base64 32
   ```

2. **Add it as the next version** (here v2) without touching
   `CONVEX_ENCRYPTION_KEY`:

   ```bash
   bunx convex env set ENCRYPTION_KEY_V2 '<new key>' --env-file ~/.config/fiscalis/convex-prod.env
   ```

   New secrets now use v2, and old ones still decrypt with v1.

3. **Dry run** the migration. It writes nothing and reports, per table, the rows
   on each version, how many are `stale` (not on v2) and how many `failed` to
   decrypt:

   ```bash
   bunx convex run actions/secretRotation:reencryptSecrets --env-file ~/.config/fiscalis/convex-prod.env
   ```

   `failed` must be 0. If it is not, stop: a secret cannot be read with any
   configured key, and the logs name the row.

4. **Re-encrypt:**

   ```bash
   bunx convex run actions/secretRotation:reencryptSecrets '{"dryRun":false}' --env-file ~/.config/fiscalis/convex-prod.env
   ```

   Rerun it until a dry run shows `stale: 0` in every table. `skipped` rows
   changed during the run, and the next run picks them up.

5. **Check that the app still works.** Do a Sync all for one Plaid, one
   SnapTrade and one Bitpanda connection, and watch the logs for decrypt
   errors.

6. **Retire the old key**, only once step 4 shows `stale: 0` and step 5
   passed. Back up its value in the vault, then remove it:

   ```bash
   bunx convex env remove CONVEX_ENCRYPTION_KEY --env-file ~/.config/fiscalis/convex-prod.env
   ```

   Run a final dry run: every row should be on `v2` and none should have
   `failed`. Keep the vault backup until a later rotation has replaced it.

For the next rotation, add `ENCRYPTION_KEY_V3` and repeat from step 2.

## If a key leaks

Rotate as above right away, then rotate the secrets themselves. A leaked key
plus a database export exposes every token it encrypted, and re-encrypting
does not change the tokens. Reconnecting creates a new Plaid access token;
SnapTrade user secrets and Bitpanda API keys have to be reissued at the
provider.
