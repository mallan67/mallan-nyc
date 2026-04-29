#!/usr/bin/env tsx
/**
 * backfill-listing-search-projection — One-shot backfill that populates
 * `listing_search_projection` rows for existing `Listing` rows that don't
 * yet have a projection.
 *
 * The PR 5B dual-write in lib/idx/sync.ts already populates the projection
 * for any listing the next sync cycle touches. This script handles the
 * tail of rows that haven't been touched since dual-write went live —
 * quiet listings that won't get a Trestle ModificationTimestamp update
 * for days/weeks.
 *
 * SAFETY:
 *   - Default mode is DRY-RUN: prints projected counts + a sample payload,
 *     never writes to the DB. `--execute` is required to actually mutate.
 *   - Idempotent — only selects listings without an existing projection
 *     (Prisma 1:1 relation filter `listing_search_projection: null`).
 *     Re-running is safe.
 *   - Cursor by `id ASC` so a long execute is interruptible (last batch's
 *     max id becomes the next batch's lower bound).
 *   - Pure projection logic via the existing helpers in
 *     `lib/search/listing-search-projection.ts` — same code path as
 *     the dual-write in `lib/idx/sync.ts`. Fail-closed gate fields
 *     round-trip verbatim (null → null, false → false).
 *   - Reads only from existing DB Listing rows. Never touches Trestle.
 *   - Never deletes projection rows.
 *
 * Usage:
 *   # Dry-run (default — projects counts + sample, no writes):
 *   npm run ops:projection-backfill
 *
 *   # Execute (real writes):
 *   npm run ops:projection-backfill:execute
 *
 *   # Custom batch size + cap:
 *   npx tsx scripts/backfill-listing-search-projection.ts --execute --batch=500 --max-batches=50
 *
 *   # Limit total rows processed (e.g. for staging probe):
 *   npx tsx scripts/backfill-listing-search-projection.ts --execute --limit=1000
 */
import prisma from "@/lib/prisma";
import {
  buildListingSearchProjectionFromListing,
  buildProjectionUpsertPayload,
  type ListingProjectionSource,
  type ListingSearchProjectionRow,
} from "@/lib/search/listing-search-projection";

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const BATCH = positiveInt(arg("--batch="), 500);
const MAX_BATCHES = positiveInt(arg("--max-batches="), Number.POSITIVE_INFINITY);
const LIMIT = positiveInt(arg("--limit="), Number.POSITIVE_INFINITY);

function arg(prefix: string): string | undefined {
  return args.find((a) => a.startsWith(prefix))?.split("=")[1];
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid argument value: ${value}`);
  }
  return n;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

interface BackfillStats {
  scanned: number;
  upserted: number;
  skipped: number;
  errors: number;
}

async function buildProjectionInput(
  listing: Awaited<ReturnType<typeof fetchBatch>>[number],
): Promise<ListingProjectionSource> {
  return {
    listing_id: listing.listing_id,
    status: listing.status,
    listing_type: listing.listing_type,
    property_type: listing.property_type,
    property_sub_type: listing.property_sub_type,
    list_price: listing.list_price,
    bedrooms_total: listing.bedrooms_total,
    bathrooms_full: listing.bathrooms_full,
    bathrooms_half: listing.bathrooms_half,
    living_area: listing.living_area,
    borough: listing.borough,
    neighborhood: listing.neighborhood,
    city: listing.city,
    postal_code: listing.postal_code,
    rls_eligible: listing.rls_eligible,
    commercial_sub_type: listing.commercial_sub_type,
    idx_display_yn: listing.idx_display_yn,
    internet_entire_listing_display_yn: listing.internet_entire_listing_display_yn,
    internet_address_display_yn: listing.internet_address_display_yn,
    participant_only: listing.participant_only,
    agent_id: listing.agent_id,
    modification_timestamp: listing.modification_timestamp,
    address: (listing.address ?? {}) as Record<string, unknown>,
    features: (listing.features ?? {}) as Record<string, unknown>,
    media: Array.isArray(listing.media) ? (listing.media as unknown[]) : [],
  };
}

async function fetchBatch(lastId: bigint | null, take: number) {
  return prisma.listing.findMany({
    where: {
      // Prisma 1:1 relation filter — only Listings without an existing
      // projection row. In execute mode this filter alone is sufficient
      // (writes flip the relation); in dry-run we still rely on the
      // cursor to advance.
      listing_search_projection: null,
      ...(lastId !== null ? { id: { gt: lastId } } : {}),
    },
    take,
    orderBy: { id: "asc" },
    select: {
      id: true,
      listing_id: true,
      status: true,
      listing_type: true,
      property_type: true,
      property_sub_type: true,
      list_price: true,
      bedrooms_total: true,
      bathrooms_full: true,
      bathrooms_half: true,
      living_area: true,
      borough: true,
      neighborhood: true,
      city: true,
      postal_code: true,
      rls_eligible: true,
      commercial_sub_type: true,
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: true,
      participant_only: true,
      agent_id: true,
      modification_timestamp: true,
      address: true,
      features: true,
      media: true,
    },
  });
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

async function run(): Promise<void> {
  const startTime = Date.now();

  console.log("─── listing search projection backfill ───");
  console.log(`Mode: ${EXECUTE ? "\x1b[31mEXECUTE (real writes)\x1b[0m" : "DRY-RUN"}`);
  console.log(`Batch size: ${BATCH}`);
  console.log(`Max batches: ${MAX_BATCHES === Number.POSITIVE_INFINITY ? "unlimited" : MAX_BATCHES}`);
  console.log(`Row limit: ${LIMIT === Number.POSITIVE_INFINITY ? "unlimited" : LIMIT}`);

  // Pre-flight counts.
  const totalListings = await prisma.listing.count();
  const existingProjections = await prisma.listingSearchProjection.count();
  const expected = totalListings - existingProjections;

  console.log(`\nPre-flight counts:`);
  console.log(`  listings:                  ${totalListings}`);
  console.log(`  existing projections:      ${existingProjections}`);
  console.log(`  expected to backfill:      ${expected}`);

  if (expected <= 0) {
    console.log("\nNothing to backfill — every listing already has a projection.");
    await prisma.$disconnect();
    return;
  }

  const stats: BackfillStats = { scanned: 0, upserted: 0, skipped: 0, errors: 0 };
  let firstSample: ListingSearchProjectionRow | null = null;
  let lastId: bigint | null = null;
  let batchN = 0;

  while (batchN < MAX_BATCHES && stats.scanned < LIMIT) {
    const remaining = LIMIT - stats.scanned;
    const take = Math.min(BATCH, remaining);

    const batch = await fetchBatch(lastId, take);
    if (batch.length === 0) break;
    batchN++;

    const batchStart = Date.now();
    for (const listing of batch) {
      stats.scanned++;
      try {
        const input = await buildProjectionInput(listing);
        const projection = buildListingSearchProjectionFromListing(input);
        const payload = buildProjectionUpsertPayload(projection);

        if (firstSample === null) firstSample = projection;

        if (EXECUTE) {
          await prisma.listingSearchProjection.upsert(payload);
          stats.upserted++;
        } else {
          stats.skipped++;
        }
      } catch (err) {
        stats.errors++;
        console.error(
          `[backfill] error on listing_id=${listing.listing_id} (id=${listing.id.toString()}):`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    lastId = batch[batch.length - 1].id;

    const batchMs = Date.now() - batchStart;
    console.log(
      `[batch ${batchN}] processed=${batch.length} scanned=${stats.scanned} upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors} ${fmtDuration(batchMs)}`,
    );
  }

  const elapsedMs = Date.now() - startTime;

  console.log("\n─── result ───");
  console.log(`Mode:       ${EXECUTE ? "EXECUTE" : "DRY-RUN"}`);
  console.log(`Scanned:    ${stats.scanned}`);
  console.log(`Upserted:   ${stats.upserted}`);
  console.log(`Skipped:    ${stats.skipped}  (dry-run rows that were not written)`);
  console.log(`Errors:     ${stats.errors}`);
  console.log(`Elapsed:    ${fmtDuration(elapsedMs)}`);
  console.log(`Batches:    ${batchN}`);

  if (firstSample !== null) {
    console.log("\n─── sample projection payload (first row processed) ───");
    console.log(JSON.stringify(firstSample, bigintReplacer, 2));
  }

  // Re-count after execute so the operator sees convergence.
  if (EXECUTE) {
    const finalProjections = await prisma.listingSearchProjection.count();
    const finalListings = await prisma.listing.count();
    const finalMissing = finalListings - finalProjections;
    console.log("\n─── post-execute counts ───");
    console.log(`  listings:              ${finalListings}`);
    console.log(`  projections:           ${finalProjections}`);
    console.log(`  remaining missing:     ${finalMissing}`);
  }

  await prisma.$disconnect();

  // Fail loudly so CI/cron treats projection-write errors as a failure.
  if (stats.errors > 0) {
    console.error(`\n❌ Exiting non-zero — ${stats.errors} row(s) errored.`);
    process.exit(1);
  }
}

run().catch(async (err) => {
  console.error("[backfill] fatal:", err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
