"use node";

import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { AwsClient } from "aws4fetch";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { metalArchivePrefix, metalArchiveRequired } from "../lib/scheduledSync";
import {
  archiveKey,
  mergeArchiveLines,
} from "../../../services/finance/metalPriceFeed";

/**
 * Archive the minutely price ticks to S3-compatible object storage, one
 * gzipped JSON-lines file per finished UTC day (services/finance/
 * metalPriceFeed.ts archiveRow: the old SQL columns), and log each day in
 * `metalPriceArchive`. pruneTicks deletes only logged days, so the archive
 * is the minutely history and Convex keeps just the last week.
 *
 * An upload never replaces stored rows: an existing object (a day reopened
 * by a late tick, or a day of the one-off Supabase export, which is in the
 * bucket but not in the log) is read and merged with the ticks
 * (mergeArchiveLines), and the PUT is conditional on the object being
 * unchanged since (If-Match its ETag, If-None-Match: * when there was none),
 * so a concurrent writer or a misread cannot overwrite it either.
 *
 * Config (Convex env vars); without the bucket or keys the run is skipped
 * and every tick stays in Convex:
 * - METAL_ARCHIVE_BUCKET, METAL_ARCHIVE_REGION (e.g. eu-central-1)
 * - METAL_ARCHIVE_ACCESS_KEY_ID, METAL_ARCHIVE_SECRET_ACCESS_KEY: a key
 *   that may only put/get objects in that bucket
 * - METAL_ARCHIVE_PREFIX (default "metal-prices"), e.g. "dev/metal-prices"
 * - METAL_ARCHIVE_ENDPOINT (optional; default AWS S3 for the region)
 */

/** Days uploaded per run; a backlog catches up over consecutive runs. */
const MAX_DAYS_PER_RUN = 14;

function archiveConfig() {
  const bucket = process.env.METAL_ARCHIVE_BUCKET;
  const region = process.env.METAL_ARCHIVE_REGION;
  const accessKeyId = process.env.METAL_ARCHIVE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.METAL_ARCHIVE_SECRET_ACCESS_KEY;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;
  const endpoint =
    process.env.METAL_ARCHIVE_ENDPOINT ?? `https://s3.${region}.amazonaws.com`;
  return {
    bucket,
    endpoint: endpoint.replace(/\/+$/, ""),
    prefix: metalArchivePrefix(),
    client: new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" }),
  };
}

export const archiveTicks = internalAction({
  args: {},
  returns: v.object({ archived: v.array(v.string()), skipped: v.boolean() }),
  handler: async (ctx): Promise<{ archived: string[]; skipped: boolean }> => {
    const config = archiveConfig();
    if (!config) {
      (metalArchiveRequired() ? console.error : console.warn)(
        "[metalPriceArchive] METAL_ARCHIVE_* not set: skipping, ticks stay in Convex",
      );
      return { archived: [], skipped: true };
    }

    const archived: string[] = [];
    for (let i = 0; i < MAX_DAYS_PER_RUN; i++) {
      const day: string | null = await ctx.runQuery(
        internal.metalPrices.nextDayToArchive,
        {},
      );
      if (day === null) break;
      const ticks = await ctx.runQuery(internal.metalPrices.ticksForDay, { day });
      const key = archiveKey(config.prefix, day);
      const url = `${config.endpoint}/${config.bucket}/${key}`;

      // Any stored file is merged in, never replaced. A key that does not
      // exist reads as 404, or 403 for a key without s3:ListBucket; both
      // upload with If-None-Match: *, which S3 refuses if it does exist.
      const current = await config.client.fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(30_000),
      });
      let storedText: string | null = null;
      let condition: Record<string, string> = { "If-None-Match": "*" };
      if (current.ok) {
        const etag = current.headers.get("etag");
        if (!etag) throw new Error(`Archive read of ${key} returned no ETag`);
        const raw = Buffer.from(await current.arrayBuffer());
        // gzip magic, unless the transport already decoded it
        storedText = (raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString("utf8");
        condition = { "If-Match": etag };
      } else if (current.status !== 404 && current.status !== 403) {
        throw new Error(`Archive read of ${key} failed: HTTP ${current.status}`);
      }
      const merged = mergeArchiveLines(storedText, ticks);
      const body = gzipSync(Buffer.from(merged.text, "utf8"));
      const sha256 = createHash("sha256").update(body).digest("hex");
      const checksum = Buffer.from(sha256, "hex").toString("base64");

      const response = await config.client.fetch(url, {
        method: "PUT",
        body,
        headers: {
          "Content-Type": "application/gzip",
          "x-amz-checksum-sha256": checksum,
          ...condition,
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        // Not logged, so the day is retried next run and its ticks stay.
        // 412: the object changed or appeared since the read; nothing written.
        throw new Error(
          `Archive upload of ${key} failed: HTTP ${response.status} ${await response.text()}`,
        );
      }

      // Read back what S3 stored before logging the day: a throw here also
      // leaves it unlogged, so its ticks are never pruned and it is retried.
      const stored = await config.client.fetch(url, {
        method: "HEAD",
        headers: { "x-amz-checksum-mode": "ENABLED" },
        signal: AbortSignal.timeout(30_000),
      });
      const storedChecksum = stored.headers.get("x-amz-checksum-sha256");
      const storedLength = stored.headers.get("content-length");
      if (
        !stored.ok ||
        storedChecksum !== checksum ||
        storedLength !== String(body.length)
      ) {
        throw new Error(
          `Archive read-back of ${key} failed: HTTP ${stored.status}, ` +
            `sha256 ${storedChecksum ?? "missing"} (sent ${checksum}), ` +
            `length ${storedLength ?? "missing"} (sent ${body.length})`,
        );
      }

      // Logged only if the day still holds exactly the ticks just uploaded;
      // a tick inserted meanwhile leaves it unlogged (never pruned), and
      // the next pass merges it into the file it just wrote.
      const logged: boolean = await ctx.runMutation(internal.metalPrices.markArchived, {
        day,
        key,
        rows: merged.rows,
        bytes: body.length,
        sha256,
        ticks: ticks.length,
      });
      if (logged) archived.push(day);
    }
    return { archived, skipped: false };
  },
});
