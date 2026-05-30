// scripts/dedup-sl0004-media-rows.ts
// SL-0004 media de-duplication + order/quality cleanup — DRY RUN by default.
//
//   npx tsx scripts/dedup-sl0004-media-rows.ts                 # DRY RUN (no writes)
//   npx tsx scripts/dedup-sl0004-media-rows.ts --apply         # WRITE (Maya-approved only)
//   npx tsx scripts/dedup-sl0004-media-rows.ts --apply --cover=3   # also set photo #3 as hero
//
// What it does (Maya 2026-05-30, media quality/dedup PR):
//   - Collapses VISUAL duplicates among active rows (same image stored as
//     multiple rows — legacy basis-key vs content-hash key, or card vs hero
//     variant). Keeps ONE row per visual identity: preferred → lowest order →
//     first-seen. Extras are SOFT-deleted (status='deleted'), never hard-deleted.
//   - Re-numbers survivors: photos order 1..N, floor plans (N+1)..(N+M).
//   - Floor plans stay FloorPlan and are NEVER the hero.
//   - Hero (preferred_photo_yn): left exactly as-is UNLESS --cover=N is given,
//     in which case photo #N (from the clean list) becomes the sole hero.
//   - Scoped to SL-0004 only; only `crm:`-keyed rows exist for it, so Trestle/RLS
//     rows are never touched.
//
// Uses the SAME visualIdentity()/pickFullSizeUrl() the public resolver uses, so
// the dry-run collapses EXACTLY what the gallery already collapses at render time.

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { visualIdentity, pickFullSizeUrl } from "../lib/media/listing-media-resolver";

const APPLY = process.argv.includes("--apply");
const coverArg = process.argv.find((a) => a.startsWith("--cover="));
const COVER = coverArg ? parseInt(coverArg.split("=")[1], 10) : null;
const LISTING_ID = "SL-0004";

// Load .env.local (DATABASE_URL) without a dependency — script reads it, not the human.
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

interface Row {
  id: bigint;
  media_key: string | null;
  media_type: string;
  order: number;
  preferred_photo_yn: boolean;
  media_url_cached: string | null;
  media_url_original: string | null;
}

/** preferred → lowest order → first-seen (matches resolver isBetterDuplicate). */
function isBetter(cand: Row, cur: Row): boolean {
  if (cand.preferred_photo_yn !== cur.preferred_photo_yn) return cand.preferred_photo_yn;
  return cand.order < cur.order;
}

async function main() {
  console.log(`\n[dedup-sl0004] mode = ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
  console.log(`[dedup-sl0004] target = ${LISTING_ID}${COVER ? `  cover=#${COVER}` : ""}\n`);

  const all = (await prisma.listingMedia.findMany({
    where: { listing_id: LISTING_ID, status: "active" },
    orderBy: { order: "asc" },
    select: {
      id: true, media_key: true, media_type: true, order: true,
      preferred_photo_yn: true, media_url_cached: true, media_url_original: true,
    },
  })) as Row[];

  if (all.length === 0) {
    console.log("No active rows for SL-0004. Nothing to do.");
    return;
  }

  // ── Group by visual identity; pick the survivor per group ──
  const survivorByIdentity = new Map<string, Row>();
  const firstSeen = new Map<string, number>();
  const dropped: Row[] = [];
  let seen = 0;
  for (const r of all) {
    const cached = (r.media_url_cached || "").trim();
    const original = (r.media_url_original || "").trim();
    const id = visualIdentity(cached, original) || `__row_${r.id}`;
    const cur = survivorByIdentity.get(id);
    if (!cur) {
      survivorByIdentity.set(id, r);
      firstSeen.set(id, seen++);
    } else if (isBetter(r, cur)) {
      survivorByIdentity.set(id, r);
      dropped.push(cur); // demoted incumbent is now a duplicate to soft-delete
    } else {
      dropped.push(r);
    }
  }

  const survivors = [...survivorByIdentity.entries()]
    .sort((a, b) => (firstSeen.get(a[0]) ?? 0) - (firstSeen.get(b[0]) ?? 0))
    .map(([, r]) => r);

  // ── Re-number: photos 1..N (current order asc), then floor plans, then other ──
  const rank = (t: string) => (t === "Photo" ? 0 : t === "FloorPlan" ? 1 : 2);
  const ordered = [...survivors].sort((a, b) => rank(a.media_type) - rank(b.media_type) || a.order - b.order);
  const photos = ordered.filter((r) => r.media_type === "Photo");
  const floorplans = ordered.filter((r) => r.media_type === "FloorPlan");
  const others = ordered.filter((r) => r.media_type !== "Photo" && r.media_type !== "FloorPlan");

  const heroUrl = (r: Row) => pickFullSizeUrl((r.media_url_cached || "").trim(), (r.media_url_original || "").trim());
  const newOrderOf = new Map<bigint, number>();
  ordered.forEach((r, i) => newOrderOf.set(r.id, i + 1));

  // ── Report ──
  console.log(`=== ACTIVE NOW: ${all.length} rows → AFTER DEDUP: ${survivors.length} rows (drop ${dropped.length}) ===\n`);

  console.log(`=== CLEAN PHOTO LIST (choose your cover by number) ===`);
  photos.forEach((r, i) => {
    const isHero = r.preferred_photo_yn;
    const willBeHero = COVER === i + 1;
    const tag = willBeHero ? "  ← NEW COVER" : isHero ? "  (current cover)" : "";
    console.log(`  ${String(i + 1).padStart(2)}. order ${String(newOrderOf.get(r.id)).padStart(2)}  ${heroUrl(r)}${tag}`);
  });

  if (floorplans.length) {
    console.log(`\n=== FLOOR PLANS (never hero) ===`);
    floorplans.forEach((r) => console.log(`  order ${newOrderOf.get(r.id)}  ${heroUrl(r)}`));
  }
  if (others.length) {
    console.log(`\n=== OTHER (video/unknown) ===`);
    others.forEach((r) => console.log(`  order ${newOrderOf.get(r.id)}  ${heroUrl(r)}  [${r.media_type}]`));
  }

  console.log(`\n=== DUPLICATES TO SOFT-DELETE (${dropped.length}) ===`);
  for (const r of dropped) {
    console.log(`  id ${r.id}  order ${r.order}  ${r.media_type}  key ${r.media_key}  ${heroUrl(r)}`);
  }

  if (!APPLY) {
    console.log(`\n[dedup-sl0004] DRY RUN — no writes. Re-run with --apply (Maya-approved) to:`);
    console.log(`  • soft-delete the ${dropped.length} duplicate row(s) (status='deleted')`);
    console.log(`  • renumber survivors (photos 1..${photos.length}, floor plans ${photos.length + 1}..${photos.length + floorplans.length})`);
    console.log(`  • ${COVER ? `set photo #${COVER} as the sole hero` : "leave the current hero unchanged (pass --cover=N to set one)"}`);
    return;
  }

  // ── APPLY (Maya-approved only) ──
  if (COVER != null && (COVER < 1 || COVER > photos.length)) {
    console.error(`--cover=${COVER} is out of range (1..${photos.length}). Aborting, no writes.`);
    process.exit(1);
  }

  let softDeleted = 0;
  let renumbered = 0;
  for (const r of dropped) {
    await prisma.listingMedia.update({ where: { id: r.id }, data: { status: "deleted" } });
    softDeleted++;
  }
  for (const r of ordered) {
    const data: { order: number; preferred_photo_yn?: boolean } = { order: newOrderOf.get(r.id)! };
    if (COVER != null) data.preferred_photo_yn = r.media_type === "Photo" && photos[COVER - 1]?.id === r.id;
    await prisma.listingMedia.update({ where: { id: r.id }, data });
    renumbered++;
  }
  // Touch the listing so ISR re-renders.
  await prisma.listing.update({ where: { listing_id: LISTING_ID }, data: { modification_timestamp: new Date() } });

  console.log(`\n[dedup-sl0004] APPLIED — soft-deleted ${softDeleted}, renumbered ${renumbered}.`);
  console.log(`[dedup-sl0004] hero: ${COVER ? `photo #${COVER} set as sole cover` : "left unchanged"}. listing.media JSON left intact.`);
}

main()
  .catch((e) => {
    console.error("[dedup-sl0004] ERROR:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
