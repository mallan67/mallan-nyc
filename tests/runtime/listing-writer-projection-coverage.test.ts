/// <reference types="jest" />
/**
 * Phase A CI pin-test — every `app/api/**\/route.ts` file that writes the
 * `listings` table via Prisma MUST also dual-write the
 * `listing_search_projection` row (either directly via
 * `prisma.listingSearchProjection.{upsert,create,deleteMany}` or via the
 * canonical `dualWriteProjectionForListingId` helper).
 *
 * Why: when PR 5B swaps the public listing readers from `listings.idx_display_yn`
 * to `listing_search_projection.idx_display_yn`, any writer that mutates a
 * listing without dual-writing the projection produces a stale-row gap on
 * the public surface. This test enforces the contract at CI time so the next
 * new route author can't forget.
 *
 * Failure modes the test catches:
 *   - New route adds `prisma.listing.update(...)` without a paired dual-write
 *   - Refactor removes the last dual-write call from a route that still writes
 *     the listings table
 *   - A copy-paste of a sync-pattern route forgets the projection step
 *
 * Failure modes the test does NOT catch (by design — would create excessive
 * noise):
 *   - A new write call site within an already-covered file (file-level grep)
 *   - A dual-write that targets the wrong listing_id (semantic — needs runtime)
 *
 * If a route legitimately writes the `listings` table for a column that has
 * no projection mirror (e.g., a notification-flag-only update like
 * `expiration_30d_notified`) AND that route does not also write any
 * projection-mirrored column, add the file path to ALLOWLIST below with a
 * comment explaining why. Today all production writers either dual-write or
 * never touch the `listings` table.
 *
 * Mirrors the pattern from tests/runtime/syndication-no-idx-imports.test.ts
 * (structural defense via source-regex walk).
 */

import * as fs from "node:fs";
import * as path from "node:path";

const API_ROOT = path.resolve(__dirname, "..", "..", "app", "api");

// Files that legitimately write the `listings` table without needing a
// dual-write call in the same file. Every entry MUST be a route that writes
// ONLY columns that are not mirrored on `listing_search_projection` — the
// rationale comment must name the exact column(s) and why no mirror exists.
// Add a new path only after auditing what the route actually mutates against
// `lib/search/listing-search-projection.ts`'s `buildListingSearchProjectionFromListing`.
const ALLOWLIST: ReadonlySet<string> = new Set<string>([
  // Writes listing.comp_criteria (agent's saved comp-search criteria) only.
  // Not mirrored on projection — projection has no comp_criteria column.
  "app/api/crm/sales/comps/route.ts",
  "app/api/crm/sales/comps/criteria/route.ts",
  // Writes listing.days_on_market + listing.first_active_date (UCBA 30-day
  // DOM reset). Projection mirrors neither — DOM is computed at read time
  // from listing-side columns when needed. Adding dual-write here would
  // multiply the cron's transaction footprint without compliance benefit.
  "app/api/cron/dom-reset/route.ts",
  // Writes listing.media (photo array) + modification_timestamp. Projection
  // does not mirror the media array (heavy JSON blob — media gallery
  // queries hit listing_media table directly per PR 4). modification_timestamp
  // staleness only affects search-result ordering by a few minutes; the
  // next sync run or data-retention cron tick re-mirrors it.
  "app/api/crm/listings/[id]/media/upload/route.ts",
  "app/api/crm/listings/[id]/photos/route.ts",
  // Writes listing.raw_data only (reorders the raw Trestle media JSON).
  // raw_data is the giant input blob — projection never reads it; it pulls
  // specific typed columns. No projection mirror needed.
  "app/api/crm/listings/[id]/media-order/route.ts",
  // Writes ONLY listing.modification_timestamp (ISR/edit-load touch) on media
  // soft-delete + set-as-main. The actual media changes live on listing_media
  // rows (Cotality-shaped, PR #276 P0); projection mirrors neither the media nor
  // a few-minute modification_timestamp skew. No projection-relevant column changes.
  "app/api/crm/listings/[id]/media/[mediaId]/route.ts",
]);

// Matches any `*.listing.{create,update,upsert,updateMany}` call —
// covers both `prisma.listing.update(...)` and the transaction-client form
// `tx.listing.update(...)` used inside `prisma.$transaction`.
const LISTING_WRITE_PATTERN =
  /\b\w+\.listing\.(create|update|upsert|updateMany|createMany)\b/;

// Matches any of the accepted dual-write signals.
const PROJECTION_WRITE_PATTERN =
  /(dualWriteProjectionForListingId|\w+\.listingSearchProjection\.(upsert|create|deleteMany|updateMany|createMany))/;

function walk(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile() && entry.name === "route.ts") {
      files.push(full);
    }
  }
  return files;
}

// Strip JS comments from a single line so the scan doesn't match
// documentation that intentionally mentions `prisma.listing.update`.
// Adapted verbatim from tests/runtime/syndication-no-idx-imports.test.ts.
function stripLineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < line.length - 1; i++) {
    const c = line[i];
    const n = line[i + 1];
    if (c === "\\") {
      i++;
      continue;
    }
    if (!inDouble && !inBacktick && c === "'") inSingle = !inSingle;
    else if (!inSingle && !inBacktick && c === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && c === "`") inBacktick = !inBacktick;
    else if (!inSingle && !inDouble && !inBacktick && c === "/" && n === "/") {
      return line.slice(0, i);
    }
  }
  return line;
}

// Walk the file and strip all `//` comments so the file-level write-pattern
// scan doesn't false-positive on doc-mentions.
function stripCommentsFromFile(text: string): string {
  return text
    .split(/\r?\n/)
    .map(stripLineComment)
    .join("\n");
}

describe("Listing-writer projection-coverage CI pin (Phase A)", () => {
  const files = walk(API_ROOT);

  it("walks at least one route file (sanity check on the test itself)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const relPath = path
      .relative(process.cwd(), file)
      .replace(/\\/g, "/");

    it(`${relPath} — if it writes prisma.listing, it must also dual-write the projection`, () => {
      const raw = fs.readFileSync(file, "utf8");
      const code = stripCommentsFromFile(raw);

      const hasListingWrite = LISTING_WRITE_PATTERN.test(code);
      if (!hasListingWrite) {
        // No listing writes in this file → contract trivially satisfied.
        return;
      }

      if (ALLOWLIST.has(relPath)) {
        // Explicitly opted out — must still document the rationale in
        // ALLOWLIST above.
        return;
      }

      const hasProjectionWrite = PROJECTION_WRITE_PATTERN.test(code);
      if (!hasProjectionWrite) {
        const writeLines: Array<{ line: number; text: string }> = [];
        const lines = raw.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const code = stripLineComment(lines[i]);
          if (LISTING_WRITE_PATTERN.test(code)) {
            writeLines.push({ line: i + 1, text: lines[i].trim() });
          }
        }
        const detail = writeLines
          .map((w) => `  line ${w.line}: ${w.text}`)
          .join("\n");
        throw new Error(
          `${relPath} writes prisma.listing but does NOT call dualWriteProjectionForListingId or prisma.listingSearchProjection.{upsert,create,deleteMany}.\n` +
            `Either:\n` +
            `  (a) Add a call to dualWriteProjectionForListingId(prisma, listing.listing_id) after the write, OR\n` +
            `  (b) Add ${relPath} to the ALLOWLIST in this file with a one-line rationale (e.g., "only mutates expiration_30d_notified — no projection mirror").\n\n` +
            `Listing-write call sites in this file:\n${detail}`,
        );
      }
    });
  }
});
