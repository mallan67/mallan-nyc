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
// Dry-run (default): prints a structured report. Read-only.
// Execute: clears the corrupted listings' `media` JSONB to `[]`, which causes
//          the next `media-backfill` cron run (every 8 minutes per
//          vercel.json) to re-fetch from Trestle through the FIXED writer
//          and repopulate with correct classification.
//
// Usage:
//   npx tsx scripts/audit-media-mediatype-corruption.ts                              # dry-run, default (sale Manhattan ≥$500K, take 200)
//   npx tsx scripts/audit-media-mediatype-corruption.ts --ids RLS123,RLS456
//   npx tsx scripts/audit-media-mediatype-corruption.ts --execute                    # repair default scope
//   npx tsx scripts/audit-media-mediatype-corruption.ts --execute --ids RLS123
//   npx tsx scripts/audit-media-mediatype-corruption.ts --scope active-rentals       # all active rentals
//   npx tsx scripts/audit-media-mediatype-corruption.ts --scope active-sales         # all active sales
//   npx tsx scripts/audit-media-mediatype-corruption.ts --scope all-active           # all active listings
//   npx tsx scripts/audit-media-mediatype-corruption.ts --scope active-rentals --limit 1000
//   npx tsx scripts/audit-media-mediatype-corruption.ts --scope all-active --execute
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
//   2 — invalid arguments

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
  recommended_action: "no_change" | "clear_media_for_resync";
}

interface AuditReport {
  ran_at: string;
  mode: "dry-run" | "execute";
  scope: { ids?: string[]; named?: Scope; default_query: boolean; limit?: number; offset?: number };
  scanned_listings: number;
  affected_listings: number;
  affected_by_listing_type?: Record<string, number>;
  total_duplicate_url_entries: number;
  total_type_path_mismatches: number;
  affected_listing_ids: string[];
  findings: ListingFinding[];
  execute_results?: {
    cleared: number;
    failed: number;
    next_cron_repopulates: string;
  };
}

type Scope = "default" | "active-rentals" | "active-sales" | "all-active";
const VALID_SCOPES: Scope[] = ["active-rentals", "active-sales", "all-active"];

interface ParsedArgs {
  execute: boolean;
  ids: string[] | null;
  scope: Scope;
  limit: number | null;
  offset: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { execute: false, ids: null, scope: "default", limit: null, offset: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute") out.execute = true;
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
      console.log("Usage: npx tsx scripts/audit-media-mediatype-corruption.ts [--execute] [--ids RLS123,RLS456] [--scope <active-rentals|active-sales|all-active>] [--limit N] [--offset N]");
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
    recommended_action: affected ? "clear_media_for_resync" : "no_change",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.execute ? "execute" : "dry-run";

  console.log("");
  console.log(
    `[audit-media-mediatype-corruption] mode=${mode}  scope=${args.ids ? "--ids" : args.scope}  limit=${args.limit ?? (args.ids ? args.ids.length : args.scope === "default" ? 200 : 50000)}  offset=${args.offset}`,
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

  const affectedFindings = findings.filter((f) => f.recommended_action === "clear_media_for_resync");

  // Tally affected by listing_type so reports can show rent vs sale split
  // when running --scope all-active.
  const affectedByType: Record<string, number> = {};
  for (const f of affectedFindings) {
    const t = typeByListing.get(f.listing_id) ?? "(unknown)";
    affectedByType[t] = (affectedByType[t] ?? 0) + 1;
  }

  const report: AuditReport = {
    ran_at: new Date().toISOString(),
    mode,
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

  if (args.execute && affectedFindings.length > 0) {
    let cleared = 0;
    let failed = 0;
    for (const f of affectedFindings) {
      try {
        // Clearing media JSONB to empty array. The next media-backfill cron
        // run (every 8 minutes per vercel.json) will detect the empty array
        // and re-fetch the listing's media from Trestle. The writer is now
        // fixed (lib/media/media-sync-service.ts:classifyTrestleMediaCategory
        // + 4 sync sites in lib/idx/sync.ts), so the re-fetched data will
        // carry correct mediaType values and route to correct R2 namespaces.
        await prisma.listing.updateMany({
          where: { listing_id: f.listing_id },
          data: { media: [] },
        });
        cleared++;
      } catch (err) {
        failed++;
        console.error(`[audit] failed to clear ${f.listing_id}:`, err instanceof Error ? err.message : err);
      }
    }
    report.execute_results = {
      cleared,
      failed,
      next_cron_repopulates: "media-backfill (every 8 minutes per vercel.json)",
    };
  }

  console.log(JSON.stringify(report, null, 2));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[audit] fatal:", err);
  process.exit(1);
});
