"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getKeyring } from "../lib/encryption";
import {
  ciphertextVersion,
  reencryptSecret,
} from "../../../services/security/secretEncryption";

type TableReport = {
  total: number;
  /** Rows per key version, before this run. */
  versions: Record<string, number>;
  /** Rows not on the current key (would be / were rewritten). */
  stale: number;
  rewritten: number;
  /** Rows changed by something else during the run; rerun to pick them up. */
  skipped: number;
  /** Rows that could not be decrypted with any configured key. */
  failed: number;
};

/**
 * Re-encrypt every stored provider secret with the newest key (ENG-240).
 * Dry run by default: reports per table how many rows sit on each key
 * version and how many would be rewritten, and checks each stale row
 * decrypts, without writing. With dryRun: false the stale rows are
 * rewritten. Idempotent; rerun until `stale` is 0 everywhere before
 * removing an old key. Never returns or logs a secret.
 *
 *   bunx convex run actions/secretRotation:reencryptSecrets
 *   bunx convex run actions/secretRotation:reencryptSecrets '{"dryRun":false}'
 *
 * Procedure: docs/ENCRYPTION_KEY_ROTATION.md.
 */
export const reencryptSecrets = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const keyring = getKeyring();
    const rows = await ctx.runQuery(internal.secretRotation.listEncryptedSecrets, {});

    const tables: Record<string, TableReport> = {};
    for (const row of rows) {
      const report = (tables[row.table] ??= {
        total: 0,
        versions: {},
        stale: 0,
        rewritten: 0,
        skipped: 0,
        failed: 0,
      });
      report.total++;

      let version: number;
      try {
        version = ciphertextVersion(row.ciphertext);
      } catch {
        report.failed++;
        console.error(`[secretRotation] ${row.table} ${row.id}: malformed ciphertext`);
        continue;
      }
      report.versions[`v${version}`] = (report.versions[`v${version}`] ?? 0) + 1;
      if (version === keyring.current) continue;
      report.stale++;

      let ciphertext: string;
      try {
        ciphertext = reencryptSecret(row.ciphertext, keyring);
      } catch {
        report.failed++;
        console.error(
          `[secretRotation] ${row.table} ${row.id}: cannot decrypt (key v${version})`,
        );
        continue;
      }
      if (dryRun) continue;

      const replaced = await ctx.runMutation(
        internal.secretRotation.replaceEncryptedSecret,
        { table: row.table, id: row.id, expected: row.ciphertext, ciphertext },
      );
      if (replaced) report.rewritten++;
      else report.skipped++;
    }

    return { dryRun, currentVersion: keyring.current, tables };
  },
});
