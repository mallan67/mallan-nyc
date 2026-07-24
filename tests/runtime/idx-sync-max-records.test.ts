/// <reference types="jest" />
/**
 * PR-S.5 (2026-05-15) — idx-sync cron maxRecords cap.
 *
 * Background: `/api/cron/idx-sync` runs every 10 min and has a Vercel
 * function `maxDuration` of 120 s. The route was passing
 * `maxRecords: 12000` to `syncListings`, which performs sequential
 * per-record DB work (findUnique + DOM transition + upsert) at ~80 ms
 * per record. 12,000 × 80 ms = 16 min — mathematically incompatible
 * with a 120 s window. Production cron had been timing out (504) for
 * 2.6 h at the time of this fix, leaving the sync watermark stale.
 *
 * Fix: cap the scheduled `maxRecords` at 500. With 500 records / run
 * at ~80 ms each + ~25 s media batches = ~65 s total, comfortably
 * under the 120 s budget. The cron fires every 10 min so realistic
 * backlogs drain in a handful of runs.
 *
 * Out of scope for PR-S.5 (deferred to follow-up if cap=500 still
 * times out):
 *   - Bulk pre-load of existing listings via single findMany
 *   - Chunked `prisma.$transaction` upserts
 *   - Bumping `maxDuration` from 120 → 300 (Vercel Pro max)
 *
 * These tests pin the post-fix invariants and the explicit non-changes
 * required by the patch spec:
 *   1. Scheduled maxRecords is ≤ 500.
 *   2. Pre-fix value 12000 is gone (anti-revert guard).
 *   3. maxDuration = 120 unchanged.
 *   4. Cron schedule (every 10 min) unchanged in vercel.json.
 *   5. useExpandMedia = false in lib/idx/sync.ts unchanged
 *      (PR #127's $expand=Media disabling is the architectural cause
 *      of the per-listing media-batch follow-up that this PR works
 *      around with the lower cap).
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const ROUTE_SOURCE_PATH = path.resolve(__dirname, '../../app/api/cron/idx-sync/route.ts');
const VERCEL_JSON_PATH = path.resolve(__dirname, '../../vercel.json');
const SYNC_SOURCE_PATH = path.resolve(__dirname, '../../lib/idx/sync.ts');

describe('idx-sync cron · maxRecords cap (PR-S.5)', () => {
  let routeSource: string;
  let vercelJsonRaw: string;
  let vercelJson: {
    crons?: Array<{ path: string; schedule: string }>;
    functions?: Record<string, { maxDuration?: number }>;
  };
  let syncSource: string;

  beforeAll(() => {
    routeSource = readFileSync(ROUTE_SOURCE_PATH, 'utf8');
    vercelJsonRaw = readFileSync(VERCEL_JSON_PATH, 'utf8');
    vercelJson = JSON.parse(vercelJsonRaw);
    syncSource = readFileSync(SYNC_SOURCE_PATH, 'utf8');
  });

  describe('scheduled cron passes maxRecords ≤ 500', () => {
    it('declares SCHEDULED_MAX_RECORDS as a const literal ≤ 500', () => {
      // The patch introduces a named constant for the cap so the test
      // can assert against the literal directly. Match a const
      // declaration whose value is a number literal, then assert ≤ 500.
      const match = routeSource.match(/const\s+SCHEDULED_MAX_RECORDS\s*=\s*(\d+)\s*;/);
      expect(match).not.toBeNull();
      const value = Number(match![1]);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(500);
    });

    it('passes the named constant to syncListings, not an inline number', () => {
      // Guards against an accidental partial revert (someone replacing
      // the const usage with `maxRecords: 12000` inline).
      expect(routeSource).toMatch(
        /maxRecords\s*:\s*SCHEDULED_MAX_RECORDS/
      );
    });

    it('does NOT pass the pre-fix value of 12000 anywhere', () => {
      // Anti-revert: the old hardcoded 12000 must not appear in the
      // file, even in a comment-out, dead code branch, or alternate
      // path. (The block comment above the const explains the
      // history, where `12,000` appears with a comma — the regex
      // matches an unbroken digit run only.)
      expect(routeSource).not.toMatch(/maxRecords\s*:\s*12000\b/);
    });
  });

  describe('non-changes required by patch spec', () => {
    it('keeps export const maxDuration = 120 in the route', () => {
      expect(routeSource).toMatch(/export\s+const\s+maxDuration\s*=\s*120\s*;/);
    });

    it('keeps maxDuration 120 in vercel.json for the idx-sync function', () => {
      const functions = vercelJson.functions ?? {};
      const idxSyncFnConfig = functions['app/api/cron/idx-sync/route.ts'];
      expect(idxSyncFnConfig).toBeDefined();
      expect(idxSyncFnConfig!.maxDuration).toBe(120);
    });

    it("runs idx-sync via the unified One Cycle orchestrator (*/10), not an independent */30 cron", () => {
      // W2 unification (2026-07-24): idx-sync is no longer an independent Vercel
      // cron entry — it is a member of /api/cron/one-cycle (*/10). The route
      // stays deployed (its maxDuration entry above is retained) for manual
      // triggering, but the standalone schedule was removed so the whole
      // machine shares ONE 10-minute timeline.
      const crons = vercelJson.crons ?? [];
      expect(crons.find(c => c.path === '/api/cron/idx-sync')).toBeUndefined();
      const oneCycle = crons.find(c => c.path === '/api/cron/one-cycle');
      expect(oneCycle).toBeDefined();
      expect(oneCycle!.schedule).toBe('*/10 * * * *');
    });

    it("keeps useExpandMedia = false in lib/idx/sync.ts (Trestle $expand=Media disabled by PR #127)", () => {
      // The lower cap is a workaround for the per-listing media batch
      // overhead introduced when $expand=Media was disabled. If a
      // future change re-enables expansion, that's a SEPARATE PR and
      // this cap can be revisited — but it must be an intentional
      // change, not an accidental side effect of editing this PR.
      expect(syncSource).toMatch(/const\s+useExpandMedia\s*=\s*false\s*;/);
    });
  });

  describe('manual override behavior unchanged', () => {
    it('still recognizes the forceFull query param (?full=true)', () => {
      expect(routeSource).toMatch(
        /forceFull\s*=\s*req\.nextUrl\.searchParams\.get\(\s*['"]full['"]\s*\)\s*===\s*['"]true['"]/
      );
    });

    it('uses the same cap for both scheduled and manual triggers', () => {
      // The patch spec said "keep manual/request override behavior
      // unchanged if one exists." There is no current per-request
      // override of maxRecords — so the manual `?full=true` trigger
      // gets the same 500 cap. To drain a very large backlog manually,
      // the cron is invoked repeatedly. This test pins that no
      // alternate maxRecords path was introduced inadvertently.
      const occurrences = routeSource.match(/maxRecords\s*:/g) ?? [];
      expect(occurrences).toHaveLength(1);
    });

    it('keeps the concurrency guard intact (10-min lookback on idx_sync_cron)', () => {
      expect(routeSource).toMatch(/action\s*:\s*['"]idx_sync_cron['"]/);
      expect(routeSource).toMatch(/Date\.now\(\)\s*-\s*10\s*\*\s*60\s*\*\s*1000/);
    });
  });

  describe('design intent — cap is documented in source', () => {
    it('includes a comment block explaining the cap and the timeout math', () => {
      // The const is a magic number without context unless the
      // surrounding comment explains why. Pin that the rationale stays
      // in the source so a future engineer trying to bump the cap
      // sees the constraints (120 s budget, per-record DB cost,
      // media batch follow-up).
      expect(routeSource).toMatch(/maxDuration/);
      expect(routeSource).toMatch(/120\s*s/);
      expect(routeSource).toMatch(/per-record/);
    });
  });
});
