#!/usr/bin/env npx tsx
// scripts/audit-media-mediatype-corruption.ts
//
// Audit + targeted repair tool for the floor-plan-as-photo bug.
//
// THE BUG (2026-05-01 audit, fixed in lib/media/media-sync-service.ts +
// lib/idx/sync.ts):
//   Trestle's MediaCategory enum value "FloorPlan" was failing the writer's
//   detection check `cat.toLowerCase().includes("floor plan")` (with space)
//   because lowercased "floorplan" does NOT include "floor plan". Floor-plan
//   media items were therefore tagged mediaType="Photo" on write, then routed
//   into `photos/{listingId}/{order}.jpg` in R2 where they collided with the
//   actual photo at the same Order. Last-writer-wins meant 5/6 homepage
//   Featured listings ended up serving the FloorPlan image as the hero.
//
// THIS SCRIPT does NOT re-fetch from Trestle. It reads the DB media JSONB and
// reports listings whose media array shows the corruption fingerprint:
//   - duplicate URLs in `media[]` (same URL appears twice)
//   - URL path containing `/floorplans/` but mediaType !== "FloorPlan"
//   - URL path containing `/photos/` and mediaType === "FloorPlan"
//
// This script is now READ-ONLY (audit/report only).
//
// EXECUTE MODE REMOVED (QUAL-006 / OPS-008, 2026-07-02):
//   The old `--execute` mode cleared corrupted listings' `media` JSONB to `[]`
//   on the assumption that "the next media-backfill cron run (every 8 minutes)"
//   would re-fetch from Trestle and repopulate. That assumption has been false
//   since 2026-05-21: PR #176 removed /api/cron/media-backfill from vercel.json
//   (2026-05-21 P0 Neon/media incident mitigation), and the route itself was
//   deleted 2026-07-02 (QUAL-006). Nothing repopulates `listings.media` after a
//   clear — running the old execute mode would have PERMANENTLY emptied media
//   for every affected listing (OPS-008 data-loss footgun). `--execute` is
//   therefore refused with an error. See docs/PLATFORM-ISSUE-REGISTRY.md
//   (OPS-008, QUAL-006) and docs/audits/lane-c-ci3-media-backfill-cron-audit-2026-06-10.md.
//
// Usage:
//   npx tsx scripts/audit-media-mediatype-corruption.ts                              # dry-run, default (sale Manhattan ≥$500K, take 200)
//   npx tsx scripts/audit-media-mediatype-corruption.ts --ids RLS123,RLS456
//   npx tsx scripts/audit-media-mediatype-corruption.ts --scope active-rentals       # all active rentals
//   npx tsx scripts/audit-media-mediatype-corruption.ts --scope active-sales         # all active sales
//   npx tsx scripts/audit-media-mediatype-corruption.ts --scope all-active           # all active listings
//   npx tsx scripts/audit-media-mediatype-corruption.ts --scope active-rentals --limit 1000
//
// Scope flags (mutually exclusive with --ids):
//   active-rentals  — { status: "Active", listing_type: "rent" }
//   active-sales    — { status: "Active", listing_type: "sale" }
//   all-active      — { status: "Active" }
//   (default)       — { status: "Active", listing_type: "sale", borough: "Manhattan", list_price ≥ 500000 }
//
// Pagination:
//   --limit N    — override default Prisma `take` (default 200; raised to 50000
//                  when --scope is supplied so coverage is complete).
//   --offset N   — Prisma `skip` for paginated runs (default 0).
//
// Exit codes:
//   0 — audit complete, regardless of how many listings affected
//   1 — DB connection error or query failure
//   2 — invalid arguments (including the removed --execute flag)

import prisma from "../lib/prisma";

type MediaItem = {
  url?: string;
  mediaType?: string;
  order?: number;
};

interface ListingFinding {
  listing_id: string;
  status: string | null;
  media_count: number;
  duplicate_url_count: number;
  duplicate_urls: string[];
  type_path_mismatches: Array<{ url: string; mediaType: string; reason: string }>;
  type_distribution_before: Record<string, number>;
  recommended_action: "no_change" | "corruption_fingerprint_found";
}

interface AuditReport {
  ran_at: string;
  mode: "dry-run";
  scope: { ids?: string[]; named?: Scope; default_query: boolean; limit?: number; offset?: number };
  scanned_listings: number;
  affected_listings: number;
  affected_by_listing_type?: Record<string, number>;
  total_duplicate_url_entries: number;
  total_type_path_mismatches: number;
  affected_listing_ids: string[];
  findings: ListingFinding[];
}

type Scope = "default" | "active-rentals" | "active-sales" | "all-active";
const VALID_SCOPES: Scope[] = ["active-rentals", "active-sales", "all-active"];

interface ParsedArgs {
  ids: string[] | null;
  scope: Scope;
  limit: number | null;
  offset: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { ids: null, scope: "default", limit: null, offset: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute") {
      // REFUSED — do not re-enable. Execute mode cleared `listings.media` to []
      // expecting the media-backfill cron to repopulate it. That cron was
      // unscheduled 2026-05-21 (PR #176) and the route was deleted 2026-07-02
      // (QUAL-006). Nothing repopulates a cleared array — executing would
      // PERMANENTLY empty media for affected listings (OPS-008 footgun).
      console.error(
        "[audit] --execute has been REMOVED (QUAL-006 / OPS-008, 2026-07-02).\n" +
        "  Clearing listings.media assumed the /api/cron/media-backfill cron would\n" +
        "  repopulate it, but that cron was unscheduled 2026-05-21 (PR #176) and the\n" +
        "  route was deleted 2026-07-02 — clearing would PERMANENTLY empty media.\n" +
        "  This script is read-only. See docs/PLATFORM-ISSUE-REGISTRY.md (OPS-008).",
      );
      process.exit(2);
    }
    else if (a === "--ids") {
      const v = argv[++i];
      if (!v) {
        console.error("--ids requires a comma-separated value");
        process.exit(2);
      }
      out.ids = v.split(",").map((x) => x.trim()).filter(Boolean);
    } else if (a === "--scope") {
      const v = argv[++i];
      if (!VALID_SCOPES.includes(v as Scope)) {
        console.error(`--scope must be one of: ${VALID_SCOPES.join(", ")}`);
        process.exit(2);
      }
      out.scope = v as Scope;
    } else if (a === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) {
        console.error("--limit requires a positive number");
        process.exit(2);
      }
      out.limit = n;
    } else if (a === "--offset") {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 0) {
        console.error("--offset requires a non-negative number");
        process.exit(2);
      }
      out.offset = n;
    } else if (a === "--help" || a === "-h") {
      console.log("Usage: npx tsx scripts/audit-media-mediatype-corruption.ts [--ids RLS123,RLS456] [--scope <active-rentals|active-sales|all-active>] [--limit N] [--offset N]  (read-only; --execute removed per QUAL-006/OPS-008)");
      process.exit(0);
    }
  }
  if (out.ids && out.scope !== "default") {
    console.error("--ids and --scope are mutually exclusive");
    process.exit(2);
  }
  return out;
}

function analyseListing(listing_id: string, status: string | null, media: unknown): ListingFinding {
  const items: MediaItem[] = Array.isArray(media)
    ? (media.filter((x): x is MediaItem => !!x && typeof x === "object") as MediaItem[])
    : [];

  // Detect duplicate URLs — the corruption fingerprint
  const seen = new Map<string, number>();
  const duplicates = new Set<string>();
  for (const m of items) {
    const url = String(m.url ?? "");
    if (!url) continue;
    seen.set(url, (seen.get(url) ?? 0) + 1);
    if ((seen.get(url) ?? 0) > 1) duplicates.add(url);
  }
  const duplicate_url_count = [...seen.values()].reduce((a, c) => a + (c > 1 ? c - 1 : 0), 0);

  // Detect mediaType ↔ URL-path mismatches — direct evidence of mis-classification
  const mismatches: Array<{ url: string; mediaType: string; reason: string }> = [];
  for (const m of items) {
    const url = String(m.url ?? "").toLowerCase();
    const mt = String(m.mediaType ?? "Photo");
    if (!url) continue;
    if (url.includes("/floorplans/") && mt !== "FloorPlan") {
      mismatches.push({ url: String(m.url), mediaType: mt, reason: "URL in floorplans/ but mediaType !== FloorPlan" });
    }
    if (url.includes("/photos/") && mt === "FloorPlan") {
      mismatches.push({ url: String(m.url), mediaType: mt, reason: "mediaType=FloorPlan but URL in photos/" });
    }
  }

  const type_distribution_before: Record<string, number> = {};
  for (const m of items) {
    const k = String(m.mediaType ?? "(missing)");
    type_distribution_before[k] = (type_distribution_before[k] ?? 0) + 1;
  }

  const affected = duplicate_url_count > 0 || mismatches.length > 0;

  return {
    listing_id,
    status,
    media_count: items.length,
    duplicate_url_count,
    duplicate_urls: [...duplicates],
    type_path_mismatches: mismatches,
    type_distribution_before,
    recommended_action: affected ? "corruption_fingerprint_found" : "no_change",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log("");
  console.log(
    `[audit-media-mediatype-corruption] mode=dry-run (read-only)  scope=${args.ids ? "--ids" : args.scope}  limit=${args.limit ?? (args.ids ? args.ids.length : args.scope === "default" ? 200 : 50000)}  offset=${args.offset}`,
  );
  console.log("");

  // Build the WHERE clause from the scope flag. Default preserves the original
  // behavior (sale Manhattan ≥ $500K, take 200) for backward compatibility
  // with prior audit runs. Named scopes raise the default `take` ceiling so
  // active-rentals (~868) / active-sales (~9,344) / all-active (~10,212) are
  // covered without manual pagination — the caller can still pin --limit.
  let where: Record<string, unknown>;
  let defaultTake: number;
  if (args.ids) {
    where = { listing_id: { in: args.ids } };
    defaultTake = args.ids.length;
  } else if (args.scope === "active-rentals") {
    where = { status: "Active", listing_type: "rent" };
    defaultTake = 50000;
  } else if (args.scope === "active-sales") {
    where = { status: "Active", listing_type: "sale" };
    defaultTake = 50000;
  } else if (args.scope === "all-active") {
    where = { status: "Active" };
    defaultTake = 50000;
  } else {
    where = { status: "Active", listing_type: "sale", borough: "Manhattan", list_price: { gte: 500000 } };
    defaultTake = 200;
  }
  const take = args.limit ?? defaultTake;

  let listings: Array<{ listing_id: string; status: string | null; listing_type: string | null; media: unknown }>;
  try {
    listings = await prisma.listing.findMany({
      where: where as Parameters<typeof prisma.listing.findMany>[0]["where"],
      select: { listing_id: true, status: true, listing_type: true, media: true },
      take,
      skip: args.offset,
    });
  } catch (err) {
    console.error("[audit] DB query failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const findings: ListingFinding[] = [];
  const typeByListing = new Map<string, string | null>();
  for (const L of listings) {
    findings.push(analyseListing(L.listing_id, L.status, L.media));
    typeByListing.set(L.listing_id, L.listing_type);
  }

  const affectedFindings = findings.filter((f) => f.recommended_action === "corruption_fingerprint_found");

  // Tally affected by listing_type so reports can show rent vs sale split
  // when running --scope all-active.
  const affectedByType: Record<string, number> = {};
  for (const f of affectedFindings) {
    const t = typeByListing.get(f.listing_id) ?? "(unknown)";
    affectedByType[t] = (affectedByType[t] ?? 0) + 1;
  }

  const report: AuditReport = {
    ran_at: new Date().toISOString(),
    mode: "dry-run",
    scope: {
      ids: args.ids ?? undefined,
      named: args.ids ? undefined : args.scope,
      default_query: !args.ids && args.scope === "default",
      limit: take,
      offset: args.offset,
    },
    scanned_listings: listings.length,
    affected_listings: affectedFindings.length,
    affected_by_listing_type: affectedByType,
    total_duplicate_url_entries: findings.reduce((a, f) => a + f.duplicate_url_count, 0),
    total_type_path_mismatches: findings.reduce((a, f) => a + f.type_path_mismatches.length, 0),
    affected_listing_ids: affectedFindings.map((f) => f.listing_id),
    findings: args.ids ? findings : affectedFindings, // brief default mode; full when --ids
  };

  // NOTE (QUAL-006 / OPS-008, 2026-07-02): the former execute block cleared
  // affected listings' `media` JSONB to [] here, expecting the (now-deleted)
  // /api/cron/media-backfill cron to repopulate from Trestle. It was removed
  // because nothing repopulates a cleared array anymore — the clear would be
  // permanent data loss. This script reports only; any repair must go through
  // the live media lane (media-sync → listing_media) with Maya approval.

  console.log(JSON.stringify(report, null, 2));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[audit] fatal:", err);
  process.exit(1);
});
