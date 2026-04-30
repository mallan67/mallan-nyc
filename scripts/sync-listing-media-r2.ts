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

async function loadListings(limit: number): Promise<MediaSyncListing[]> {
  return prisma.$queryRaw<MediaSyncListing[]>`
    SELECT
      listing_id,
      status,
      media,
      rls_eligible,
      idx_display_yn,
      internet_entire_listing_display_yn,
      owner_opt_out,
      participant_only
    FROM "listings"
    WHERE media IS NOT NULL
      AND media::text != '[]'
      AND media::text != '{}'
      AND (media::text LIKE '%cotality.com%' OR media::text LIKE '%corelogic.com%')
    ORDER BY updated_at DESC NULLS LAST
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
