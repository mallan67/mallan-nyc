/**
 * `backfillEmptyMedia()` REACHABILITY — the last claimed consumer of stored
 * `raw_data.PhotosChangeTimestamp`.
 *
 * WHY THIS MATTERS
 * ----------------
 * `lib/idx/sync.ts:backfillEmptyMedia()` selects eligible listings with a SQL
 * predicate that reads the STORED raw_data value:
 *
 *     raw_data ? 'PhotosChangeTimestamp'
 *     AND (raw_data->>'PhotosChangeTimestamp')::timestamp > modification_timestamp
 *
 * added because Cotality can bump `PhotosChangeTimestamp` without bumping
 * `ModificationTimestamp`. That is a genuine dependency on the stored value —
 * so it gates whether stored raw_data PCT may be deprecated (Outcome A).
 *
 * CLASSIFICATION: UNREACHABLE / LEGACY
 * ------------------------------------
 * Its only caller was the `/api/cron/media-backfill` route, which was REMOVED:
 *
 *   scripts/audit-media-mediatype-corruption.ts:28
 *     "since 2026-05-21: PR #176 removed /api/cron/media-backfill from
 *      vercel.json"
 *
 *   - no file under app/ imports `backfillEmptyMedia`
 *   - `app/api/cron/media-backfill/` does not exist
 *   - `/api/cron/media-backfill` is absent from vercel.json crons
 *   - the only remaining mention is a STALE entry in
 *     artifacts/api-route-catalog.json (a generated catalog, not a route)
 *
 * These tests pin that. If a caller ever reappears, the stored-PCT dependency
 * becomes live again and the deprecation decision must be revisited BEFORE the
 * predicate can be relied upon.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n?/g, '\n');

/** Recursively collect source files under a directory. */
function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(full);
  }
  return out;
}

describe('backfillEmptyMedia is UNREACHABLE legacy code', () => {
  it('no file under app/ imports or calls it', () => {
    const hits = walk(path.join(ROOT, 'app')).filter((f) =>
      fs.readFileSync(f, 'utf8').includes('backfillEmptyMedia'),
    );
    expect(hits).toEqual([]);
  });

  it('the /api/cron/media-backfill route directory does not exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/api/cron/media-backfill'))).toBe(false);
  });

  it('no cron schedule references media-backfill', () => {
    const vercel = read('vercel.json');
    expect(vercel).not.toContain('/api/cron/media-backfill');
  });

  it('the removal is documented (PR #176, 2026-05-21)', () => {
    const audit = read('scripts/audit-media-mediatype-corruption.ts');
    expect(audit).toMatch(/PR #176 removed \/api\/cron\/media-backfill from\s*\n?\/\/\s*vercel\.json|PR #176 removed \/api\/cron\/media-backfill/);
  });

  it('it is still EXPORTED — exported is not the same as reachable', () => {
    // Guards against concluding "unused" from export status alone, and makes
    // the reason for the other assertions explicit.
    expect(read('lib/idx/sync.ts')).toMatch(/export async function backfillEmptyMedia\(/);
  });
});

describe('the stored-PCT dependency lives ONLY in that legacy function', () => {
  it('no OTHER module reads stored raw_data PhotosChangeTimestamp in SQL', () => {
    const sources = [
      ...walk(path.join(ROOT, 'app')),
      ...walk(path.join(ROOT, 'lib')),
    ].filter((f) => !f.endsWith(`sync.ts`));
    const hits = sources.filter((f) => {
      const s = fs.readFileSync(f, 'utf8');
      return s.includes("raw_data->>'PhotosChangeTimestamp'") || s.includes("raw_data ? 'PhotosChangeTimestamp'");
    });
    expect(hits).toEqual([]);
  });

  it('sync.ts contains that predicate only inside backfillEmptyMedia', () => {
    const src = read('lib/idx/sync.ts');
    const start = src.indexOf('export async function backfillEmptyMedia(');
    expect(start).toBeGreaterThan(-1);
    const before = src.slice(0, start);
    expect(before).not.toContain("raw_data->>'PhotosChangeTimestamp'");
  });
});
