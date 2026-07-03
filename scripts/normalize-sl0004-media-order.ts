// scripts/normalize-sl0004-media-order.ts
// SL-0004 media ORDER normalization — dry-run by default.
//
//   npx tsx scripts/normalize-sl0004-media-order.ts            # DRY RUN (no writes)
//   npx tsx scripts/normalize-sl0004-media-order.ts --apply    # WRITE (Maya-approved only)
//
// Rules (Maya 2026-05-30):
//   - Photos get sequential order 1..N (N = photo count, expected 15),
//     preserving their existing relative order (oldOrder asc, then JSON index).
//   - Floor plans come AFTER photos: order (N+1)..(N+M) (expected 16..17).
//   - Keep ALL items. Delete nothing.
//   - Floor plans stay FloorPlan, preferred_photo_yn=false.
//   - Hero is NOT set here (no preferred_photo_yn=true) — agent chooses later.
//   - media_key stays deterministic (crm:{id}:{sha256(basis)[:24]}), matching
//     the real importer so a later import/normalize is idempotent.
//   - SL-0004 (a CRM exclusive) ONLY. Trestle/RLS rows are never touched
//     (their keys are not `crm:`-prefixed and this script is scoped to SL-0004).
//
// Idempotent + read-compat: leaves listing.media JSON intact. On --apply it
// upserts listing_media rows by media_key with the normalized order (status
// 'active', preferred_photo_yn=false), creating rows that don't exist yet and
// only updating `order` on rows that do. Trestle rows are unreachable here.

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  crmMediaKey,
  crmMediaType,
  crmMediaCategory,
  crmMediaClassification,
  legacyItemUrl,
  legacyItemBasis,
  type LegacyMediaItem,
} from "../lib/media/crm-media";

const APPLY = process.argv.includes("--apply");
const LISTING_ID = "SL-0004";

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

interface Plan {
  mediaKey: string;
  classification: "Photo" | "FloorPlan" | "Video";
  oldOrder: number;
  newOrder: number;
  url: string;
  caption: string;
}

async function main() {
  console.log(`\n[normalize-sl0004-order] mode = ${APPLY ? "APPLY (writing order)" : "DRY RUN (no writes)"}`);
  console.log(`[normalize-sl0004-order] target = ${LISTING_ID}\n`);

  const listing = await prisma.listing.findUnique({
    where: { listing_id: LISTING_ID },
    select: { listing_id: true, media: true },
  });
  if (!listing) {
    console.error(`Listing ${LISTING_ID} not found.`);
    process.exit(1);
  }

  const items: LegacyMediaItem[] = Array.isArray(listing.media) ? (listing.media as LegacyMediaItem[]) : [];

  // Build per-item facts (deterministic key + classification + url/caption + old order).
  const enriched = items
    .map((item, idx) => {
      const url = legacyItemUrl(item);
      if (!url) return null;
      const classification = crmMediaType(item.type, item.caption); // Photo | FloorPlan | Video
      return {
        idx,
        mediaKey: crmMediaKey(LISTING_ID, legacyItemBasis(item)),
        classification,
        url,
        caption: (item.caption || "").trim(),
        oldOrder: Number.isFinite(item.order as number) ? (item.order as number) : idx,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Photos first (preserve relative order: oldOrder asc, then JSON index), then
  // floor plans (and any non-photo) after. Videos, if ever present, trail.
  const rank = (c: string) => (c === "Photo" ? 0 : c === "FloorPlan" ? 1 : 2);
  const sorted = [...enriched].sort((a, b) => {
    const r = rank(a.classification) - rank(b.classification);
    if (r !== 0) return r;
    if (a.oldOrder !== b.oldOrder) return a.oldOrder - b.oldOrder;
    return a.idx - b.idx;
  });

  // Assign sequential order starting at 1 (photos 1..N, floor plans N+1..).
  const plan: Plan[] = sorted.map((e, i) => ({
    mediaKey: e.mediaKey,
    classification: e.classification,
    oldOrder: e.oldOrder,
    newOrder: i + 1,
    url: e.url,
    caption: e.caption,
  }));

  const photos = plan.filter((p) => p.classification === "Photo");
  const floorplans = plan.filter((p) => p.classification === "FloorPlan");
  const others = plan.filter((p) => p.classification !== "Photo" && p.classification !== "FloorPlan");

  // ── Before/after table ──
  console.log("=== BEFORE → AFTER (order normalization) ===");
  console.log("new  old  class      media_key                              url / caption");
  for (const p of plan) {
    const cap = p.caption ? `  «${p.caption}»` : "";
    console.log(
      `${String(p.newOrder).padStart(3)}  ${String(p.oldOrder).padStart(3)}  ${p.classification.padEnd(9)}  ${p.mediaKey.padEnd(36)}  ${p.url}${cap}`,
    );
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  total items kept:     ${plan.length}`);
  console.log(`  photos  → order 1..${photos.length}`);
  console.log(`  floor plans → order ${photos.length + 1}..${photos.length + floorplans.length}`);
  if (others.length) console.log(`  other (video/unknown) → order ${photos.length + floorplans.length + 1}..${plan.length}`);
  console.log(`  hero (preferred_photo_yn=true): NONE set (agent chooses)`);

  // ── Numbered photo list for hero/cover selection ──
  console.log(`\n=== PHOTOS (choose hero/cover by number) ===`);
  photos.forEach((p, i) => {
    const cap = p.caption ? `  «${p.caption}»` : "";
    console.log(`  ${String(i + 1).padStart(2)}. ${p.url}${cap}`);
  });

  if (!APPLY) {
    console.log(`\n[normalize-sl0004-order] DRY RUN — no writes. listing.media JSON left intact.`);
    console.log(`[normalize-sl0004-order] Re-run with --apply (Maya-approved) to write the normalized order.`);
    return;
  }

  // ── APPLY (Maya-approved only) ──
  // Upsert by media_key: create missing rows with normalized order; update
  // `order` on existing rows. preferred_photo_yn stays false (no hero set).
  // Scoped to SL-0004 crm: keys — Trestle/RLS rows are never matched.
  let created = 0;
  let updated = 0;
  for (const p of plan) {
    const existing = await prisma.listingMedia.findUnique({ where: { media_key: p.mediaKey }, select: { id: true } });
    if (existing) {
      await prisma.listingMedia.update({ where: { media_key: p.mediaKey }, data: { order: p.newOrder } });
      updated++;
    } else {
      await prisma.listingMedia.create({
        data: {
          listing_id: LISTING_ID,
          media_key: p.mediaKey,
          resource_record_key: LISTING_ID,
          media_url_original: p.url,
          media_url_cached: p.url,
          media_type: p.classification,
          media_category: crmMediaCategory(p.classification),
          media_classification: crmMediaClassification(p.classification),
          order: p.newOrder,
          preferred_photo_yn: false,
          media_modification_ts: new Date(),
          status: "active",
        },
      });
      created++;
    }
  }
  console.log(`\n[normalize-sl0004-order] APPLIED — created ${created}, updated ${updated}. No hero set. listing.media JSON left intact.`);
}

main()
  .catch((e) => {
    console.error("[normalize-sl0004-order] ERROR:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
