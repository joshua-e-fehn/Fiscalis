"use node";

import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { AwsClient } from "aws4fetch";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  archiveKey,
  archiveLines,
} from "../../../services/finance/metalPriceFeed";

/**
 * Archive the minutely price ticks to S3-compatible object storage, one
 * gzipped JSON-lines file per finished UTC day (services/finance/
 * metalPriceFeed.ts archiveRow: the old SQL columns), and log each day in
 * `metalPriceArchive`. pruneTicks deletes only logged days, so the archive
 * is the minutely history and Convex keeps just the last week.
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
    prefix: process.env.METAL_ARCHIVE_PREFIX ?? "metal-prices",
    client: new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" }),
  };
}

export const archiveTicks = internalAction({
  args: {},
  returns: v.object({ archived: v.array(v.string()), skipped: v.boolean() }),
  handler: async (ctx): Promise<{ archived: string[]; skipped: boolean }> => {
    const config = archiveConfig();
    if (!config) {
      console.warn(
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
      const body = gzipSync(Buffer.from(archiveLines(ticks), "utf8"));
      const sha256 = createHash("sha256").update(body).digest("hex");
      const key = archiveKey(config.prefix, day);

      const url = `${config.endpoint}/${config.bucket}/${key}`;
      const response = await config.client.fetch(url, {
        method: "PUT",
        body,
        headers: {
          "Content-Type": "application/gzip",
          "x-amz-checksum-sha256": Buffer.from(sha256, "hex").toString("base64"),
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        // Not logged, so the day is retried next run and its ticks stay
        throw new Error(
          `Archive upload of ${key} failed: HTTP ${response.status} ${await response.text()}`,
        );
      }

      await ctx.runMutation(internal.metalPrices.markArchived, {
        day,
        key,
        rows: ticks.length,
        bytes: body.length,
        sha256,
      });
      archived.push(day);
    }
    return { archived, skipped: false };
  },
});
