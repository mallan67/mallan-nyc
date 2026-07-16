// scripts/backfill-alias-index.ts
//
// One-time (idempotent, re-runnable) backfill of the durable alias→canonical index
// (lib/listings/alias-index.ts) for EVERY listing, so middleware.ts can serve alias
// redirects — and authoritative 404s — without touching Neon.
//
// Run ONCE in an environment that has Upstash + Neon configured, THEN set
// ALIAS_INDEX_AUTHORITATIVE=true so an index miss becomes a DB-free 404. Until this has
// run, leave the flag OFF: middleware falls open (a not-yet-indexed alias renders via the
// page) so a valid listing is never wrongly 404'd.
//
//   npx tsx scripts/backfill-alias-index.ts     (or the repo's ts runner)

import prisma from "@/lib/prisma";
import { canonicalForListing } from "@/lib/cache/invalidate-listing";
import { writeAliasEntries } from "@/lib/listings/alias-index";

const SELECT = {
  id: true,
  listing_id: true,
  mls_id: true,
  address: true,
  postal_code: true,
  rls_eligible: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
} as const;

async function main(): Promise<void> {
  let cursor: bigint | undefined;
  let n = 0;
  for (;;) {
    const rows = await prisma.listing.findMany({
      select: SELECT,
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      const { canonicalPath, addressSlug } = canonicalForListing(r);
      await writeAliasEntries(r.listing_id, addressSlug, canonicalPath);
      n++;
    }
    cursor = rows[rows.length - 1].id;
    if (n % 2000 === 0) console.log(`[backfill-alias-index] ${n} listings indexed...`);
  }
  console.log(`[backfill-alias-index] DONE — ${n} listings indexed. Now set ALIAS_INDEX_AUTHORITATIVE=true.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[backfill-alias-index] FAILED:", e);
    process.exit(1);
  });
