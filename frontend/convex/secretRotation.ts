import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Storage side of the encryption key rotation (ENG-240): the rows holding
 * an encrypted provider secret, read and rewritten by
 * actions/secretRotation.ts reencryptSecrets. Internal only; the
 * ciphertexts never leave the backend.
 */

export const encryptedSecretTable = v.union(
  v.literal("plaidItems"),
  v.literal("snaptradeUsers"),
  v.literal("bitpandaConnections"),
);

/**
 * Every stored secret as { table, id, ciphertext }. These tables hold one
 * row per connection (a handful per user), so they are read whole.
 */
export const listEncryptedSecrets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [items, snaptradeUsers, bitpanda] = await Promise.all([
      ctx.db.query("plaidItems").collect(),
      ctx.db.query("snaptradeUsers").collect(),
      ctx.db.query("bitpandaConnections").collect(),
    ]);
    return [
      ...items.map((row) => ({
        table: "plaidItems" as const,
        id: row._id as string,
        ciphertext: row.accessToken,
      })),
      ...snaptradeUsers.map((row) => ({
        table: "snaptradeUsers" as const,
        id: row._id as string,
        ciphertext: row.snaptradeUserSecret,
      })),
      ...bitpanda.map((row) => ({
        table: "bitpandaConnections" as const,
        id: row._id as string,
        ciphertext: row.apiKey,
      })),
    ];
  },
});

/**
 * Replace one row's ciphertext, only if it still holds `expected`: a row
 * rewritten in between (a reconnect stored a new token) is left alone and
 * reported as skipped, so the migration never overwrites a newer secret.
 */
export const replaceEncryptedSecret = internalMutation({
  args: {
    table: encryptedSecretTable,
    id: v.string(),
    expected: v.string(),
    ciphertext: v.string(),
  },
  handler: async (ctx, { table, id, expected, ciphertext }): Promise<boolean> => {
    switch (table) {
      case "plaidItems": {
        const docId = ctx.db.normalizeId("plaidItems", id);
        const row = docId && (await ctx.db.get(docId));
        if (!docId || !row || row.accessToken !== expected) return false;
        await ctx.db.patch(docId, { accessToken: ciphertext });
        return true;
      }
      case "snaptradeUsers": {
        const docId = ctx.db.normalizeId("snaptradeUsers", id);
        const row = docId && (await ctx.db.get(docId));
        if (!docId || !row || row.snaptradeUserSecret !== expected) return false;
        await ctx.db.patch(docId, { snaptradeUserSecret: ciphertext });
        return true;
      }
      case "bitpandaConnections": {
        const docId = ctx.db.normalizeId("bitpandaConnections", id);
        const row = docId && (await ctx.db.get(docId));
        if (!docId || !row || row.apiKey !== expected) return false;
        await ctx.db.patch(docId, { apiKey: ciphertext });
        return true;
      }
    }
  },
});
