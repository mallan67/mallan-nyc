// scripts/migrate-crm-media-to-rows.ts
// Migrate CRM exclusives' legacy `listing.media` JSON → Cotality-shaped
// `listing_media` rows (crm: key namespace). Reuses the SAME importer the upload
// route uses (lib/media/crm-media.ts) so dry-run and runtime stay identical.
//
//   npx tsx scripts/migrate-crm-media-to-rows.ts                 # DRY RUN (no writes)
//   npx tsx scripts/migrate-crm-media-to-rows.ts --listing SL-0004
//   npx tsx scripts/migrate-crm-media-to-rows.ts --apply         # WRITE (Maya-approved only)
//
// Idempotent: skips items whose media_key already exists. Leaves listing.media
// JSON intact (read-compat). Never touches Trestle-synced rows (different key
// namespace). PROD --apply requires explicit Maya approval per the plan.

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { importJsonMediaToRows } from "../lib/media/crm-media";

const APPLY = process.argv.includes("--apply");
const listingArgIdx = process.argv.indexOf("--listing");
const ONLY_LISTING = listingArgIdx >= 0 ? process.argv[listingArgIdx + 1] : null;

// Load .env.local (DATABASE_URL) without a dependency.
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const v = m[2].replace(/^['"]|['"]$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
} catch (e) {
  console.error("Could not read .env.local:", (e as Error).message);
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  console.log(`\n[migrate-crm-media] mode = ${APPLY ? "APPLY (writing rows)" : "DRY RUN (no writes)"}`);
  console.log(`[migrate-crm-media] target = ${ONLY_LISTING || "all CRM exclusives (SL-/RL-) with media JSON"}\n`);

  const listings = await prisma.listing.findMany({
    where: ONLY_LISTING
      ? { listing_id: ONLY_LISTING }
      : { OR: [{ listing_id: { startsWith: "SL-" } }, { listing_id: { startsWith: "RL-" } }] },
    // `last_synced_from_trestle` drives the importer's provenance gate. It is
    // REQUIRED: omitting it makes the importer fail closed (unknown sync state)
    // and silently migrate nothing. See lib/media/media-provenance.ts.
    select: { listing_id: true, media: true, last_synced_from_trestle: true },
  });

  let totalPlanned = 0;
  let totalImported = 0;
  let totalSkipped = 0;
  let totalSkippedByProvenance = 0;
  let listingsWithJson = 0;

  for (const listing of listings) {
    const items = Array.isArray(listing.media) ? (listing.media as unknown[]) : [];
    if (items.length === 0) continue;
    listingsWithJson++;

    const res = await importJsonMediaToRows(
      prisma,
      {
        listing_id: listing.listing_id,
        media: listing.media,
        last_synced_from_trestle: listing.last_synced_from_trestle,
      },
      { apply: APPLY },
    );
    totalPlanned += res.planned.length;
    totalImported += res.imported;
    totalSkipped += res.skipped;
    totalSkippedByProvenance += res.skippedByProvenance;

    if (res.planned.length > 0 || res.skipped > 0) {
      console.log(`• ${listing.listing_id}: ${items.length} JSON item(s) → ` +
        `${APPLY ? res.imported + " imported" : res.planned.length + " would import"}, ${res.skipped} skipped (already rows)`);
      for (const p of res.planned) {
        console.log(`    ${APPLY ? "+" : "would +"} ${p.media_type.padEnd(9)} order=${p.order}  ${p.media_key}`);
      }
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  CRM listings with JSON media: ${listingsWithJson}`);
  console.log(`  rows ${APPLY ? "imported" : "to import"}: ${APPLY ? totalImported : totalPlanned}`);
  console.log(`  skipped (already rows):       ${totalSkipped}`);
  // Never a silent drop: items refused by the provenance gate are reported, so
  // a run that migrates less than expected is visibly explained rather than
  // looking like "there was nothing to do".
  console.log(`  refused (not provably Mallan-owned): ${totalSkippedByProvenance}`);
  if (!APPLY) {
    console.log(`\n[migrate-crm-media] DRY RUN — re-run with --apply (Maya-approved) to write. listing.media JSON is left intact.`);
  } else {
    console.log(`\n[migrate-crm-media] APPLIED. listing.media JSON left intact (rows are now authoritative when present).`);
  }
}

main()
  .catch((e) => {
    console.error("[migrate-crm-media] ERROR:", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
