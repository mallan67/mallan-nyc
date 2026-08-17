/// <reference types="jest" />
/**
 * reset-sync must not be a reachable destructive operation.
 *
 * ── WHAT IT DOES ───────────────────────────────────────────────────────────
 * It is the ONLY `deleteMany({})` in the repository. It wipes the entire
 * `Listing` table plus six dependent tables, then repopulates only a BOUNDED
 * Cotality set scoped to the calling broker's own MLS id / state licence — so a
 * listing outside that set does not come back.
 *
 * ── WHY IT MATTERS UNDER THE EVENT-DRIVEN CONTRACT ─────────────────────────
 * It emits NO cache invalidation. Listing detail is `revalidate = false` with a
 * persistent, deployment-surviving data entry keyed by listing id, and that tag
 * is only ever emitted by a writer touching that listing. Destroy the listing
 * and nothing is left to expire its cache — a PERMANENT ghost.
 *
 * ── CENSUS ─────────────────────────────────────────────────────────────────
 * Repo-wide search found ZERO runtime callers: every reference is a doc, a
 * comment, a test, or the generated route catalog. It is retained (not deleted)
 * because ~12 tests read its SOURCE as the canonical listing-writer example.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SRC = read('app/api/crm/listings/reset-sync/route.ts');

describe('reset-sync execution is disabled', () => {
  it('returns 410 before any auth, credential or DB work', () => {
    // Ordering matters: the block must precede `assertWriteAllowed` and
    // `requireBroker`, so no code path can reach the deletes.
    // Measure INSIDE the handler body — `assertWriteAllowed` also appears in
    // the import list at the top of the file, which would make a whole-file
    // index comparison meaningless.
    const body = SRC.slice(SRC.indexOf('export async function POST'));

    const guardIdx = body.indexOf("resetSyncExecutionEnabled()");
    const writeGuardIdx = body.indexOf('assertWriteAllowed()');
    const firstDelete = body.indexOf('deleteMany({})');

    expect(guardIdx).toBeGreaterThan(-1);
    expect(writeGuardIdx).toBeGreaterThan(-1);
    expect(firstDelete).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(writeGuardIdx);
    expect(guardIdx).toBeLessThan(firstDelete);
    expect(body).toContain('status: 410');
  });

  it('is gated on an env var that is set in NO environment', () => {
    // Fail-closed by construction: absent env var => disabled. Env changes are
    // a standing authorization hold, so this cannot be flipped incidentally.
    expect(SRC).toContain('process.env.RESET_SYNC_ENABLED === "true"');
  });

  it('still contains the whole-table deletes it is guarding (guard, not removal)', () => {
    // If someone deletes the destructive body, this guard becomes meaningless
    // theatre and the test should be revisited deliberately.
    expect(SRC).toContain('prisma.listing.deleteMany({})');
  });

  it('documents the reconciliation contract required to re-enable', () => {
    expect(SRC).toMatch(/whole-public-cache|WHOLE-PUBLIC-CACHE/i);
  });
});

describe('no OTHER reachable whole-table delete exists', () => {
  it('reset-sync is the only deleteMany({}) in production code', () => {
    // Scans app/ + lib/ + scripts/ for the unbounded form. A new one must be a
    // deliberate, reviewed addition — not something that slips in.
    const roots = ['app', 'lib', 'scripts'];
    const hits: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
          walk(rel);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
          // Strip comments so prose ABOUT the pattern is not counted as usage.
          const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1');
          if (/deleteMany\(\s*\{\s*\}\s*\)/.test(code)) hits.push(rel.replace(/\\/g, '/'));
        }
      }
    };
    roots.forEach(walk);

    expect(hits.sort()).toEqual(['app/api/crm/listings/reset-sync/route.ts']);
  });
});
