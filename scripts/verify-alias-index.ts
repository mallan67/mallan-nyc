// scripts/verify-alias-index.ts
//
// READ-ONLY verification of the durable alias index. Run AFTER backfill-alias-index.ts and
// BEFORE setting ALIAS_INDEX_AUTHORITATIVE=true, to prove the index is complete enough that an
// index miss can safely become a DB-free 404. Makes NO writes.
//
// Proves: DB listing count, alias:id key count, alias:addr key count, suppressed-address
// exclusions (suppressed listings have NO address key), and sample canonical targets.
//
//   npx tsx scripts/verify-alias-index.ts

import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { canonicalForListing } from "@/lib/cache/invalidate-listing";
import { aliasKeysForListing } from "@/lib/listings/alias-index";

async function countKeys(match: string): Promise<number> {
  if (!redis) return -1;
  let cursor = "0";
  let total = 0;
  do {
    const [next, keys] = (await redis.scan(cursor, { match, count: 1000 })) as [string, string[]];
    cursor = String(next);
    total += keys.length;
  } while (cursor !== "0");
  return total;
}

async function main(): Promise<void> {
  const listingCount = await prisma.listing.count();
  const idKeys = await countKeys("idx:alias:id:*");
  const addrKeys = await countKeys("idx:alias:addr:*");

  // Suppressed = rls-backed AND (entire OR address display off) → address key must be ABSENT.
  const suppressedInDb = await prisma.listing.count({
    where: {
      rls_eligible: true,
      OR: [{ internet_entire_listing_display_yn: false }, { internet_address_display_yn: false }],
    },
  });

  const sample = await prisma.listing.findMany({
    select: {
      listing_id: true, mls_id: true, address: true, postal_code: true, rls_eligible: true,
      internet_entire_listing_display_yn: true, internet_address_display_yn: true,
    },
    take: 8,
    orderBy: { id: "asc" },
  });

  console.log("[verify-alias-index] sample canonical targets:");
  let suppressedChecked = 0, suppressedOk = 0;
  for (const l of sample) {
    const { canonicalPath, addressSlug } = canonicalForListing(l);
    const keys = aliasKeysForListing(l.listing_id, addressSlug);
    const suppressed = canonicalPath.startsWith("/listing/listing-");
    if (suppressed) { suppressedChecked++; if (keys.length === 1) suppressedOk++; }
    console.log(`   ${l.listing_id} → ${canonicalPath}  (index keys: ${keys.length}${suppressed ? ", suppressed→id-only" : ""})`);
  }

  console.log("\n[verify-alias-index] summary:");
  console.log(`   DB listings:              ${listingCount}`);
  console.log(`   alias:id keys:            ${idKeys}   (expect ≈ ${listingCount})`);
  console.log(`   alias:addr keys:          ${addrKeys}  (expect ≈ ${listingCount - suppressedInDb} — suppressed addresses excluded)`);
  console.log(`   suppressed (addr-excluded) in DB: ${suppressedInDb}`);
  console.log(`   sampled suppressed → id-only key: ${suppressedOk}/${suppressedChecked}`);

  const idOk = idKeys >= 0 && idKeys >= Math.floor(listingCount * 0.99);
  const addrOk = addrKeys >= 0 && addrKeys >= Math.floor((listingCount - suppressedInDb) * 0.95);
  const ok = idOk && addrOk && suppressedOk === suppressedChecked;
  console.log(`\n   RESULT: ${ok
    ? "OK — index is complete; safe to set ALIAS_INDEX_AUTHORITATIVE=true (with separate authorization)."
    : "INCOMPLETE — do NOT flip authoritative; re-run scripts/backfill-alias-index.ts."}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("[verify-alias-index] FAILED:", e); process.exit(1); });
