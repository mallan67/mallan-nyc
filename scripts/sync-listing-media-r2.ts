import { config as dotenvConfig } from "dotenv";
import path from "node:path";
import process from "node:process";
import prisma from "@/lib/prisma";
import {
  mirrorListingMediaBatch,
  type MediaSyncListing,
} from "@/lib/media/media-sync-service";
import { hasR2Config } from "@/lib/media/r2-client";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local"), override: true });

function parseArgs(argv: string[]) {
  let execute = false;
  let limit = 50;
  let batchSize = 10;
  let maxBatches: number | undefined;

  for (const arg of argv) {
    if (arg === "--execute") {
      execute = true;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      limit = Math.max(1, Number(arg.slice("--limit=".length)) || 50);
      continue;
    }

    if (arg.startsWith("--batch-size=") || arg.startsWith("--batch=")) {
      const value = arg.includes("=")
        ? arg.slice(arg.indexOf("=") + 1)
        : "";
      batchSize = Math.max(1, Number(value) || 10);
      continue;
    }

    if (arg.startsWith("--max-batches=")) {
      maxBatches = Math.max(1, Number(arg.slice("--max-batches=".length)) || 1);
      continue;
    }
  }

  return { execute, limit, batchSize, maxBatches };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Load listings with their media, sourced from the RELATIONAL `listing_media`
 * table rather than the legacy `listings.media` JSON column.
 *
 * WHY THIS CHANGED (#575, Codex review):
 *   Object identity is now the stable Cotality `MediaKey`, and this path is
 *   fail-closed — an item without a MediaKey is skipped rather than keyed by
 *   `Order`. But `listings.media` JSON structurally CANNOT supply one: every
 *   producer (`lib/idx/trestle-mapper.ts`, the three batch writers in
 *   `lib/idx/sync.ts`) emits only `{url, mediaType, order}`, and the batch
 *   queries never even select MediaKey. Live confirmation against canonical
 *   production (2026-07-28, read-only): across 86,460 media JSON elements the
 *   keys present are url (86,460), order (85,508), mediaType (85,482), Order /
 *   MediaCategory (1,817), MediaURL (865) — and MediaKey appears ZERO times.
 *
 *   Reading the JSON would therefore have filtered EVERY item out and reported
 *   `scanned_media: 0` — a silent no-op that looks like "nothing to do".
 *
 *   `listing_media.media_key` is `@unique` and 100% populated (0 NULL across
 *   320,913 rows), so the relational table is the correct source. It is also
 *   the source the production ten-minute cron already uses
 *   (`lib/idx/media-sync.ts`), so this aligns the operator script with
 *   production instead of diverging from it. The legacy JSON column is slated
 *   for removal (NEON.md §8).
 *
 * Only `status='active'` rows with a non-null `media_key` and a Cotality/
 * CoreLogic source URL are considered — the same population the JSON filter
 * targeted, minus rows that could never produce a stable key.
 */
async function loadListings(limit: number): Promise<MediaSyncListing[]> {
  return prisma.$queryRaw<MediaSyncListing[]>`
    SELECT
      l.listing_id,
      l.status,
      l.rls_eligible,
      l.idx_display_yn,
      l.internet_entire_listing_display_yn,
      l.owner_opt_out,
      l.participant_only,
      jsonb_agg(
        jsonb_build_object(
          'url',       lm.media_url_original,
          'mediaType', lm.media_type,
          'order',     lm."order",
          'media_key', lm.media_key
        )
        ORDER BY lm."order", lm.media_key
      ) AS media
    FROM "listings" l
    JOIN "listing_media" lm
      ON lm.listing_id = l.listing_id
     AND lm.status = 'active'
     AND lm.media_key IS NOT NULL
     AND lm.media_url_original IS NOT NULL
     AND (lm.media_url_original LIKE '%cotality.com%' OR lm.media_url_original LIKE '%corelogic.com%')
    GROUP BY
      l.listing_id, l.status, l.rls_eligible, l.idx_display_yn,
      l.internet_entire_listing_display_yn, l.owner_opt_out,
      l.participant_only, l.updated_at
    ORDER BY l.updated_at DESC NULLS LAST
    LIMIT ${limit}
  `;
}

async function main() {
  const { execute, limit, batchSize, maxBatches } = parseArgs(process.argv.slice(2));

  if (!hasR2Config()) {
    console.error("[Media Sync] R2 configuration missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL.");
    process.exit(1);
  }

  const listings = await loadListings(limit);
  const batches = chunk(listings, batchSize);
  const selectedBatches = typeof maxBatches === "number" ? batches.slice(0, maxBatches) : batches;

  let total = {
    dry_run: !execute,
    scanned_listings: 0,
    eligible_listings: 0,
    scanned_media: 0,
    would_copy: 0,
    copied: 0,
    skipped_existing: 0,
    skipped_ineligible: 0,
    skipped_no_media_key: 0,
    failed: 0,
  };

  for (const batch of selectedBatches) {
    const result = await mirrorListingMediaBatch(batch, {
      execute,
      batchSize,
      logger: console,
    });

    total.scanned_listings += result.scanned_listings;
    total.eligible_listings += result.eligible_listings;
    total.scanned_media += result.scanned_media;
    total.would_copy += result.would_copy;
    total.copied += result.copied;
    total.skipped_existing += result.skipped_existing;
    total.skipped_ineligible += result.skipped_ineligible;
    total.skipped_no_media_key += result.skipped_no_media_key;
    total.failed += result.failed;
  }

  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run",
    limit,
    batchSize,
    maxBatches: maxBatches ?? null,
    ...total,
  }, null, 2));
}

main().catch((err) => {
  console.error("[Media Sync] Unexpected error:", err instanceof Error ? err.message : String(err));
  process.exit(2);
});
