// scripts/ops/set-listing-primary-photo.mjs
//
// OPS: set a listing's PRIMARY (hero) photo and move it to a position, for ONE
// listing. Operates only on CRM-managed media (media_key prefix "crm:") so it
// never touches Trestle/RLS-synced rows. Writes the `listing_media` table:
//   - preferred_photo_yn = true on the target (false on all other active rows)
//   - order renumbered so the target sits at --position (1-based) among photos
//
// A UI already exists for this in the CRM (POST upload / PATCH media-order /
// PATCH media/[id] {action:"set-main"} / DELETE) — this script is a safe,
// direct fallback for ops/admin use.
//
// Generic: no hardcoded listing. Affects only the --listing you pass.
//
// Usage:
//   node scripts/ops/set-listing-primary-photo.mjs --listing=SL-0004                 # DRY-RUN, lists current order
//   node scripts/ops/set-listing-primary-photo.mjs --listing=SL-0004 --media-id=crm:SL-0004:abcd1234
//   node scripts/ops/set-listing-primary-photo.mjs --listing=SL-0004 --photo-url="https://…/living-room-hero.webp"
//   node scripts/ops/set-listing-primary-photo.mjs --listing=SL-0004 --media-id=crm:… --position=1 --apply --verify
//
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const arg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
};
const LISTING = arg("listing");
const MEDIA_ID = arg("media-id"); // media_key
const PHOTO_URL = arg("photo-url");
const POSITION = Math.max(1, parseInt(arg("position") || "1", 10) || 1);
const APPLY = args.includes("--apply");
const VERIFY = args.includes("--verify");

if (!LISTING) {
  console.error("ERROR: --listing=LISTING_ID is required.");
  process.exit(1);
}

try {
  const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch (e) {
  console.error("Could not read .env.local:", e.message);
  process.exit(1);
}

const prisma = new PrismaClient();
const isCrmKey = (k) => String(k || "").startsWith("crm:");

async function main() {
  console.log(`\n=== set-listing-primary-photo — ${APPLY ? "APPLY (writing)" : "DRY-RUN"} — listing=${LISTING} ===\n`);

  // Active PHOTO rows for this listing, in current order.
  const photos = await prisma.listingMedia.findMany({
    where: { listing_id: LISTING, status: "active", media_type: "Photo" },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { id: true, media_key: true, order: true, preferred_photo_yn: true, media_url_cached: true, media_url_original: true },
  });

  if (photos.length === 0) {
    console.log("No active Photo rows in listing_media for this listing. (Has its media been imported into the table? See scripts/normalize-* / the CRM upload.)");
    return;
  }

  console.log(`Current photo order (${photos.length} photos):`);
  for (const p of photos) {
    console.log(`  [${String(p.order).padStart(2)}] ${p.preferred_photo_yn ? "HERO " : "     "} ${p.media_key}  ${(p.media_url_cached || p.media_url_original || "").slice(0, 70)}`);
  }

  if (!MEDIA_ID && !PHOTO_URL) {
    console.log("\n(no --media-id or --photo-url given — listing only. Re-run with one of them to set the hero.)");
    return;
  }

  // Resolve the target row.
  const target = photos.find((p) =>
    (MEDIA_ID && p.media_key === MEDIA_ID) ||
    (PHOTO_URL && (p.media_url_cached === PHOTO_URL || p.media_url_original === PHOTO_URL)),
  );
  if (!target) {
    console.error(`\nERROR: target photo not found among active photos (media-id=${MEDIA_ID || "-"}, photo-url=${PHOTO_URL || "-"}).`);
    process.exit(2);
  }
  if (!isCrmKey(target.media_key)) {
    console.error(`\nERROR: target ${target.media_key} is NOT CRM-managed (must start "crm:"). Trestle/RLS media is read-only here.`);
    process.exit(2);
  }

  // Mixed-media guard (Codex review): the clear-preferred updateMany and the
  // renumber loop below touch EVERY active photo. On a listing that also has
  // Trestle/RLS photo rows (media_key not "crm:"), that would mutate read-only
  // RLS media. So refuse unless ALL active photos are CRM-managed. (CRM
  // exclusives are fully CRM media; mixed/IDX listings must use the CRM UI.)
  const nonCrm = photos.filter((p) => !isCrmKey(p.media_key));
  if (nonCrm.length > 0) {
    console.error(
      `\nERROR: listing has ${nonCrm.length} non-CRM (Trestle/RLS) active photo(s) — refusing to renumber/clear them.\n` +
        `This script manages fully CRM-managed media only. Non-CRM keys: ${nonCrm.map((p) => p.media_key).join(", ")}`,
    );
    process.exit(2);
  }

  // Build the new order: target at POSITION (1-based) among photos, others keep relative order.
  const rest = photos.filter((p) => p.id !== target.id);
  const insertAt = Math.min(POSITION - 1, rest.length);
  const ordered = [...rest.slice(0, insertAt), target, ...rest.slice(insertAt)];

  console.log(`\nPlan: set HERO = ${target.media_key} at position ${POSITION}.`);
  ordered.forEach((p, i) => {
    const newOrder = i + 1;
    const changed = p.order !== newOrder || (p.id === target.id) !== p.preferred_photo_yn;
    console.log(`  ${changed ? "*" : " "} [${String(newOrder).padStart(2)}] ${p.id === target.id ? "HERO " : "     "} ${p.media_key}`);
  });

  if (!APPLY) {
    console.log("\nDRY-RUN only — no rows written. Re-run with --apply to write.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Clear hero on all active photos, then renumber + set hero on target.
    await tx.listingMedia.updateMany({
      where: { listing_id: LISTING, status: "active", media_type: "Photo" },
      data: { preferred_photo_yn: false },
    });
    for (let i = 0; i < ordered.length; i++) {
      await tx.listingMedia.update({
        where: { id: ordered[i].id },
        data: { order: i + 1, preferred_photo_yn: ordered[i].id === target.id },
      });
    }
  });
  console.log(`\n✓ Applied. ${target.media_key} is now HERO at position ${POSITION}.`);

  if (VERIFY) {
    const after = await prisma.listingMedia.findMany({
      where: { listing_id: LISTING, status: "active", media_type: "Photo" },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: { media_key: true, order: true, preferred_photo_yn: true },
    });
    const first = after[0];
    const heroRows = after.filter((p) => p.preferred_photo_yn);
    const ok = first && first.media_key === target.media_key && heroRows.length === 1 && heroRows[0].media_key === target.media_key;
    console.log(`\nVERIFY: first=${first?.media_key} hero_count=${heroRows.length} → ${ok ? "✓ PASS" : "✗ FAIL"}`);
    if (!ok) process.exit(3);
  }
}

main()
  .catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
