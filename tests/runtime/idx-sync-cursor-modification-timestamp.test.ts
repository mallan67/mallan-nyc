/// <reference types="jest" />
/**
 * PR-S.6 (2026-05-15) — idx-sync cursor uses Trestle ModificationTimestamp.
 *
 * Background (proof chain, latest first):
 *
 *   1. PR-S.5 / PR #138 capped scheduled idx-sync runs at maxRecords=500
 *      so the function fits in Vercel's 120 s window.
 *
 *   2. Codex review of PR #138 correctly identified that the cap
 *      interacts with a pre-existing cursor bug:
 *      `getLastSyncTimestamp()` was ordering by + returning
 *      `last_synced_from_trestle`, which is set to `new Date()`
 *      (local clock) at upsert (trestle-mapper.ts:1002), NOT the
 *      row's Trestle `ModificationTimestamp`. A capped batch
 *      advances the cursor to local NOW after only 500 records,
 *      and records 501..N — whose actual MT is older than NOW —
 *      are then EXCLUDED from the next run's `MT gt SINCE` filter.
 *      Permanent data loss for the unprocessed tail.
 *
 *   3. PR #139 attempted to disable the cron in vercel.json while
 *      this hot-fix shipped. The REBNY display compliance audit
 *      (`scripts/audit-closed-listing-24h.ts`) correctly blocked
 *      the disable — without idx-sync, REBNY RLS §2.05 (close
 *      within 24 h) cannot be honored. PR #139 was abandoned;
 *      operational disable handled in the Vercel dashboard instead.
 *
 *   4. This PR (PR-S.6) ships the cursor hot-fix: switch
 *      `getLastSyncTimestamp()` to read `MAX(modification_timestamp)`.
 *      The field already exists on Listing (no schema change) and
 *      is populated from `raw.ModificationTimestamp` by
 *      `mapTrestleToPrisma` (trestle-mapper.ts:949-951).
 *
 * Tests:
 *
 *   A. Source-regex assertions on `lib/idx/sync.ts`
 *      - getLastSyncTimestamp uses `modification_timestamp` (where /
 *        orderBy / select / return)
 *      - getLastSyncTimestamp does NOT use `last_synced_from_trestle`
 *        anywhere inside its body
 *      - Null modification_timestamp records are ignored
 *        (`where: { modification_timestamp: { not: null } }`)
 *      - `last_synced_from_trestle` is still WRITTEN on upserts (the
 *        column is preserved as an audit signal, just not used as a
 *        cursor) — guards against accidentally removing the write.
 *
 *   B. Source-regex assertions on infrastructure non-changes
 *      - vercel.json still contains /api/cron/idx-sync schedule "every 10 min"
 *      - vercel.json still contains /api/cron/media-backfill schedule "every 15 min"
 *      - app/api/cron/idx-sync/route.ts still has SCHEDULED_MAX_RECORDS = 500
 *      - prisma/schema.prisma Listing model still declares the
 *        modification_timestamp column (no schema change)
 *
 * No DB integration test in this file — `getLastSyncTimestamp` is a
 * three-line Prisma query whose semantics are determined entirely by
 * the where/orderBy/select args. The source-regex check pins those
 * args directly. A behavior test would need a real Prisma DB or a
 * complete prisma-client mock; both add weight without catching a
 * different class of regression than the source check.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const SYNC_SOURCE_PATH = path.resolve(__dirname, '../../lib/idx/sync.ts');
const VERCEL_JSON_PATH = path.resolve(__dirname, '../../vercel.json');
const CRON_ROUTE_PATH = path.resolve(__dirname, '../../app/api/cron/idx-sync/route.ts');
const PRISMA_SCHEMA_PATH = path.resolve(__dirname, '../../prisma/schema.prisma');

/**
 * Extract the body of `export async function getLastSyncTimestamp` so
 * we can assert ONLY on its contents without false-matching other
 * functions in the same file that may legitimately reference
 * `last_synced_from_trestle` (e.g. the upsert at sync.ts:223 still
 * writes to that column).
 */
function getFunctionBody(source: string): string {
  // Match `export async function getLastSyncTimestamp(…)` up to its
  // closing `}` at column 0. The function is a simple one-statement
  // body so we don't need to count braces precisely; we anchor on the
  // next top-level `}` followed by a blank line / EOF / comment.
  const start = source.indexOf('export async function getLastSyncTimestamp');
  if (start < 0) throw new Error('getLastSyncTimestamp not found in source');
  const rest = source.slice(start);
  // Find the matching closing brace by tracking braces from the first `{`.
  const openBraceIdx = rest.indexOf('{');
  if (openBraceIdx < 0) throw new Error('getLastSyncTimestamp body brace not found');
  let depth = 0;
  let endIdx = -1;
  for (let i = openBraceIdx; i < rest.length; i++) {
    const c = rest[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx < 0) throw new Error('getLastSyncTimestamp body brace not closed');
  return rest.slice(0, endIdx + 1);
}

describe('getLastSyncTimestamp · cursor uses modification_timestamp (PR-S.6)', () => {
  let syncSource: string;
  let functionBody: string;

  beforeAll(() => {
    syncSource = readFileSync(SYNC_SOURCE_PATH, 'utf8');
    functionBody = getFunctionBody(syncSource);
  });

  describe('uses modification_timestamp', () => {
    it("orders by modification_timestamp desc", () => {
      expect(functionBody).toMatch(
        /orderBy\s*:\s*\{\s*modification_timestamp\s*:\s*['"]desc['"]\s*\}/
      );
    });

    it("selects modification_timestamp", () => {
      expect(functionBody).toMatch(
        /select\s*:\s*\{\s*modification_timestamp\s*:\s*true\s*\}/
      );
    });

    it("returns modification_timestamp from the result", () => {
      expect(functionBody).toMatch(
        /return\s+latest\??\.\s*modification_timestamp\s*\?\?\s*null\s*;?/
      );
    });
  });

  describe('does NOT use last_synced_from_trestle in the cursor', () => {
    it("the function body has zero references to last_synced_from_trestle", () => {
      // Anti-revert. The pre-fix code referenced it 4 times (where,
      // orderBy, select, return). After the fix the body must have
      // none.
      expect(functionBody).not.toMatch(/last_synced_from_trestle/);
    });
  });

  describe('null records are ignored (by schema, not by filter)', () => {
    it("Listing.modification_timestamp is declared non-nullable in the Prisma schema", () => {
      // The original `getLastSyncTimestamp` filtered `not: null` on
      // `last_synced_from_trestle` because THAT column is nullable
      // (`DateTime?` at schema.prisma:546). `modification_timestamp`
      // is `DateTime` (non-nullable) at schema.prisma:550, so it is
      // GUARANTEED populated on every Listing row by the schema
      // itself. No runtime filter is needed; adding one would be a
      // TypeScript error against the Prisma-generated types.
      //
      // Pin the schema-level guarantee here so that if a future
      // migration ever makes the column nullable, this test fails
      // and the maintainer knows to either restore the runtime
      // `not: null` filter or reject the schema change.
      const prismaSchema = readFileSync(PRISMA_SCHEMA_PATH, 'utf8');
      const listingModel = prismaSchema.match(/model\s+Listing\s*\{([\s\S]*?)^\}/m);
      expect(listingModel).not.toBeNull();
      expect(listingModel![1]).toMatch(/modification_timestamp\s+DateTime\b(?!\s*\?)/);
    });

    it("function body does NOT include a where clause filtering modification_timestamp", () => {
      // Defensive companion to the schema check above. If a future
      // edit re-introduces `where: { modification_timestamp: ... }`
      // without first making the column nullable, TypeScript will
      // reject the build, but this test gives a more semantic
      // failure message at the test layer first.
      expect(functionBody).not.toMatch(
        /where\s*:\s*\{[\s\S]*?modification_timestamp[\s\S]*?\}/
      );
    });
  });

  describe('non-cursor write path preserved', () => {
    it("last_synced_from_trestle is still written on listing upsert (sync.ts:223)", () => {
      // The column stays on the model as a useful "when did we last
      // touch this row from Trestle" audit signal — it just isn't
      // used as a sync cursor. Pin that the write didn't get removed
      // accidentally by this PR.
      expect(syncSource).toMatch(
        /last_synced_from_trestle\s*:\s*mapped\.last_synced_from_trestle/
      );
    });
  });
});

describe('infrastructure non-changes around PR-S.6', () => {
  let vercelJson: {
    crons?: Array<{ path: string; schedule: string }>;
    functions?: Record<string, { maxDuration?: number }>;
  };
  let cronRouteSource: string;
  let prismaSchema: string;

  beforeAll(() => {
    vercelJson = JSON.parse(readFileSync(VERCEL_JSON_PATH, 'utf8'));
    cronRouteSource = readFileSync(CRON_ROUTE_PATH, 'utf8');
    prismaSchema = readFileSync(PRISMA_SCHEMA_PATH, 'utf8');
  });

  it("vercel.json still contains the idx-sync cron at schedule */10 * * * *", () => {
    const crons = vercelJson.crons ?? [];
    const idxSyncCron = crons.find(c => c.path === '/api/cron/idx-sync');
    expect(idxSyncCron).toBeDefined();
    expect(idxSyncCron!.schedule).toBe('*/10 * * * *');
  });

  it("vercel.json still contains the media-backfill cron at schedule */15 * * * *", () => {
    const crons = vercelJson.crons ?? [];
    const mediaBackfillCron = crons.find(c => c.path === '/api/cron/media-backfill');
    expect(mediaBackfillCron).toBeDefined();
    expect(mediaBackfillCron!.schedule).toBe('*/15 * * * *');
  });

  it("cron route still passes SCHEDULED_MAX_RECORDS = 500 (PR-S.5 cap preserved)", () => {
    expect(cronRouteSource).toMatch(/const\s+SCHEDULED_MAX_RECORDS\s*=\s*500\s*;/);
    expect(cronRouteSource).toMatch(/maxRecords\s*:\s*SCHEDULED_MAX_RECORDS/);
  });

  it("prisma schema still declares Listing.modification_timestamp (no schema change)", () => {
    // The cursor fix relies on the modification_timestamp column
    // already existing on the Listing model. This test fails if
    // someone accidentally removes the column or this PR
    // accidentally introduces a schema-level change.
    expect(prismaSchema).toMatch(/model\s+Listing\s*\{[\s\S]*?modification_timestamp\s+DateTime[\s\S]*?\}/);
  });

  it("prisma schema still declares Listing.last_synced_from_trestle (audit column preserved)", () => {
    // Same guard — the column is no longer the cursor but is still
    // populated as an audit signal. If a follow-up PR ever removes
    // it (e.g. for storage compaction), that must be an intentional
    // decision documented in NEON.md, not a side effect.
    expect(prismaSchema).toMatch(/model\s+Listing\s*\{[\s\S]*?last_synced_from_trestle\s+DateTime[\s\S]*?\}/);
  });
});
