/// <reference types="jest" />
/**
 * D9 STATUS-SET CLOSURE — the three remaining status-set omissions.
 *
 * This file closes GAP 1 / GAP 2 / GAP 3 recorded by adversarial review on
 * 2026-08-20 and previously carried (unfixed, on purpose) in the KNOWN_GAPS /
 * OUT_OF_SCOPE registries of `listing-status-spelling-closure.test.ts`.
 *
 * ── WHY THESE ARE SOURCE-SCANNING TESTS ────────────────────────────────────
 * Two of the three subjects are files that CANNOT import the canonical
 * TypeScript vocabulary:
 *
 *   `scripts/reconcile-ghosts.js`  — CommonJS, run as
 *                                    `node --env-file=.env.local …`. No compile
 *                                    step, so requiring a `.ts` module is
 *                                    impossible (the file's own header says so
 *                                    at the orphan-deferral comment).
 *   `scripts/phase1-run.js`        — same runner, same constraint.
 *   `scripts/phase1-verify.sql`    — raw SQL executed by psql; there is no
 *                                    import mechanism at all.
 *
 * The most defensible alternative to an import is therefore: keep the literal,
 * and PIN it to the canonical set with an executable test that reads the file
 * and fails the moment the two diverge. That is what PART 2 and PART 3 do. They
 * are not source-greps standing in for behaviour — the literal IS the behaviour
 * for these files, because each one is passed verbatim to `Set.has()` or to a
 * SQL `IN (…)`.
 *
 * PART 1's subject (`app/api/crm/listings/route.ts`) CAN import, so it does; the
 * test there resolves the identifier back to its runtime value and asserts
 * coverage against real data rather than against source text.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  ALL_MODELLED_STATUSES,
  COMING_SOON_PRIOR_USE_STATUSES,
  LIVE_PROVIDER_STANDARD_STATUSES,
  STATUS_SPELLING_CLASSES,
  TERMINAL_STATUSES,
} from '@/lib/compliance/listing-status-vocabulary';
import { STATUS_TRANSITIONS } from '@/app/api/crm/listings/[id]/status/route';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/**
 * Statuses actually present in `listings.status` in production.
 *
 * PROVENANCE — frozen read-only census, no live DB access:
 *   `.cache/r2-census/DB-2026-08-18T13-20-59-918Z.ndjson` (377,650 NDJSON rows;
 *   25,239 of them `"t":"ls"` listing rows), counted 2026-08-20 by grouping
 *   `t==='ls'` records on `status`:
 *
 *     Active 8,193 · Withdrawn 6,229 · Pending 6,207 · Closed 4,609 · ComingSoon 1
 *
 * Zero rows carry `Canceled`, `Cancelled`, `Sold`, `Rented`, `Leased`,
 * `Expired`, `Hold`, `Incomplete`, `Delete`, `Draft` or `ActiveUnderContract`.
 * A count of 0 is NOT absence from the vocabulary — every one of those is
 * reachable by a live writer; it is only absence from today's corpus.
 */
const PRODUCTION_STATUS_CENSUS: ReadonlyMap<string, number> = new Map([
  ['Active', 8193],
  ['Withdrawn', 6229],
  ['Pending', 6207],
  ['Closed', 4609],
  ['ComingSoon', 1],
]);
const CENSUS_TOTAL = 25239;

/** Pull every quoted capitalised token out of a snippet. */
function quotedTokens(snippet: string): string[] {
  return [...snippet.matchAll(/['"`]([A-Za-z][A-Za-z]{2,40})['"`]/g)].map((m) => m[1]);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 1 — GAP 1: app/api/crm/listings/route.ts, the UCBA D9 lookup
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve the status set the D9 query actually applies.
 *
 * Handles BOTH shapes so the test is a real before/after: an inline array
 * literal (the defect) resolves to its own elements; an identifier (the fix)
 * must be imported from the canonical vocabulary module and resolves to that
 * module's RUNTIME value.
 */
function resolveD9StatusSet(): {
  source: 'literal' | 'imported-constant';
  name: string;
  values: string[];
} {
  const src = read('app/api/crm/listings/route.ts');

  const start = src.indexOf('const priorComingSoon');
  expect({ foundD9Query: start >= 0 }).toEqual({ foundD9Query: true });
  const wasComingSoon = src.indexOf('_wasComingSoon', start);
  expect({ foundWasComingSoonLeg: wasComingSoon > start }).toEqual({ foundWasComingSoonLeg: true });
  const block = src.slice(start, wasComingSoon);

  const m = block.match(/status:\s*\{\s*in:\s*([\s\S]*?)\s*\}\s*,/);
  if (!m) {
    throw new Error('D9 query no longer has a `status: { in: … }` leg — update this test deliberately.');
  }
  const expr = m[1].trim();

  // Three shapes are accepted, and they are NOT interchangeable:
  //   [ "A", "B" ]        -> inline literal, the defect shape
  //   [ ...IDENT ]        -> spread of an imported readonly array (the fix; the
  //                          spread is required because Prisma's `in` wants a
  //                          mutable string[])
  //   IDENT               -> bare imported identifier
  // The spread form must be unwrapped BEFORE the literal test, or it reads as an
  // array literal containing no quoted tokens and the whole assertion goes
  // vacuously empty. (Found the hard way on the first GREEN run.)
  const spread = expr.match(/^\[\s*\.\.\.\s*([A-Za-z0-9_]+)\s*\]$/);
  if (!spread && expr.startsWith('[')) {
    return { source: 'literal', name: '(inline array literal)', values: quotedTokens(expr) };
  }

  const ident = spread
    ? spread[1]
    : expr.replace(/\s*as\s+[\s\S]*$/, '').replace(/[^A-Za-z0-9_]/g, '');
  const importRe = new RegExp(
    'import\\s*\\{[^}]*\\b' + ident + '\\b[^}]*\\}\\s*from\\s*[\'"]@/lib/compliance/listing-status-vocabulary[\'"]',
  );
  expect({ identifier: ident, importedFromCanonicalVocabulary: importRe.test(src) }).toEqual({
    identifier: ident,
    importedFromCanonicalVocabulary: true,
  });

  const runtime: Record<string, readonly string[]> = {
    COMING_SOON_PRIOR_USE_STATUSES,
  };
  const values = runtime[ident];
  if (!values) {
    throw new Error(
      'D9 uses `' +
        ident +
        '` from the canonical vocabulary, but this test does not know its runtime value. ' +
        'Add it to the `runtime` map above so coverage is asserted against real data, not source text.',
    );
  }
  return { source: 'imported-constant', name: ident, values: [...values] };
}

describe('GAP 1 — UCBA D9 "Coming Soon once per address" reaches every stored status', () => {
  it('the D9 status leg is sourced from the canonical vocabulary, not a hand-typed literal', () => {
    const { source, name } = resolveD9StatusSet();
    expect({ source, name }).toEqual({
      source: 'imported-constant',
      name: 'COMING_SOON_PRIOR_USE_STATUSES',
    });
  });

  it('reaches 100% of the production corpus (frozen census, 25,239 listing rows)', () => {
    const applied = new Set(resolveD9StatusSet().values);
    const missed: Array<{ status: string; rows: number }> = [];
    let reached = 0;
    for (const [status, rows] of PRODUCTION_STATUS_CENSUS) {
      if (applied.has(status)) reached += rows;
      else missed.push({ status, rows });
    }
    expect({ reached, missed, total: CENSUS_TOTAL }).toEqual({
      reached: CENSUS_TOTAL,
      missed: [],
      total: CENSUS_TOTAL,
    });
  });

  it('accepts BOTH spellings of every equivalence class (provider writer + CRM writer)', () => {
    const applied = new Set(resolveD9StatusSet().values);
    for (const cls of STATUS_SPELLING_CLASSES) {
      const hit = cls.members.filter((m) => applied.has(m));
      expect({ cls: cls.members.join('|'), accepted: hit }).toEqual({
        cls: cls.members.join('|'),
        accepted: [...cls.members],
      });
    }
  });

  it('accepts every LIVE provider StandardStatus member (probe 2026-08-20)', () => {
    const applied = new Set(resolveD9StatusSet().values);
    const missing = [...LIVE_PROVIDER_STANDARD_STATUSES].filter((s) => !applied.has(s));
    expect({ missing }).toEqual({ missing: [] });
  });

  it('accepts every status this repo models, so a future vocabulary addition auto-enrolls', () => {
    const applied = new Set(resolveD9StatusSet().values);
    const missing = [...ALL_MODELLED_STATUSES].filter((s) => !applied.has(s));
    expect({ missing }).toEqual({ missing: [] });
  });

  // ── THE END-TO-END PROOF ─────────────────────────────────────
  //
  // The corpus percentages above measure the STATUS LEG alone. The full D9 query
  // ANDs that leg with `raw_data._wasComingSoon === true`, and that flag has
  // exactly one writer: app/api/crm/listings/[id]/status/route.ts, which is
  // gated on `caps.mayManageMallanLocalListing` — a MALLAN-LOCAL capability. So
  // the reachable population is narrower than the whole corpus, and saying
  // otherwise would overstate the defect.
  //
  // The honest bound is the CRM state machine: which statuses can a listing that
  // has left ComingSoon actually be sitting in? Derived below from the live
  // STATUS_TRANSITIONS table rather than hand-listed, so it cannot drift.
  const reachableAfterComingSoon = (): string[] => {
    const seen = new Set<string>();
    // The flag is written on the transition OUT of ComingSoon, so the frontier
    // starts at ComingSoon's successors — then closes transitively, because a
    // listing keeps moving afterwards.
    const queue = [...(STATUS_TRANSITIONS.ComingSoon ?? [])];
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of STATUS_TRANSITIONS[cur] ?? []) queue.push(next);
    }
    return [...seen].sort();
  };

  it('covers every status reachable from ComingSoon in the CRM state machine', () => {
    const applied = new Set(resolveD9StatusSet().values);
    const unreachedButReachable = reachableAfterComingSoon().filter((s) => !applied.has(s));
    expect({ unreachedButReachable }).toEqual({ unreachedButReachable: [] });
  });

  it('records WHICH reachable states the old literal missed (executable, not prose)', () => {
    // The exact literal that shipped before 2026-08-20.
    const OLD_LITERAL = ['Active', 'Withdrawn', 'Expired', 'Sold', 'Rented', 'Cancelled'];
    const missed = reachableAfterComingSoon().filter((s) => !OLD_LITERAL.includes(s));
    // Each of these is an ordinary CRM path — e.g. ComingSoon → Active → Pending
    // — on which D9 silently returned "no prior Coming Soon" and let a SECOND
    // Coming Soon be created for the same address.
    //
    // 'ComingSoon' itself is in this list and that is not a typo: STATUS_TRANSITIONS
    // allows Withdrawn/Expired/Hold → Draft → ComingSoon, so a listing that already
    // spent its one Coming Soon can be sitting BACK in ComingSoon while D9 reports
    // the address as unused. This test derives the list from the live transition
    // table precisely because a hand-written one missed that edge (it did, on the
    // first run of this assertion).
    expect(missed).toEqual(['ActiveUnderContract', 'ComingSoon', 'Draft', 'Hold', 'Pending']);
    // … and the fix covers all of them.
    const applied = new Set(resolveD9StatusSet().values);
    expect(missed.filter((s) => !applied.has(s))).toEqual([]);
  });

  it('RESIDUAL IS EMPTY: no production status falls outside the modelled vocabulary', () => {
    // This is what bounds the `in`-list residual. If it ever fails, the `status`
    // leg must be DELETED from the D9 query rather than extended, because an
    // unmodelled string cannot be enumerated.
    const unmodelled = [...PRODUCTION_STATUS_CENSUS.keys()].filter((s) => !ALL_MODELLED_STATUSES.has(s));
    expect({ unmodelled }).toEqual({ unmodelled: [] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 2 — GAP 2: scripts/reconcile-ghosts.js terminal SKIP set
// ═══════════════════════════════════════════════════════════════════════════

describe('GAP 2 — scripts/reconcile-ghosts.js terminal skip set matches the canonical set', () => {
  const extract = () => {
    const src = read('scripts/reconcile-ghosts.js');
    const m = src.match(/const\s+TERMINAL_STATUSES\s*=\s*new\s+Set\(\s*\[([\s\S]*?)\]\s*\)/);
    if (!m) throw new Error('scripts/reconcile-ghosts.js no longer declares TERMINAL_STATUSES as a Set literal.');
    return quotedTokens(m[1]);
  };

  it('is exactly the canonical TERMINAL_STATUSES (both cancel spellings included)', () => {
    expect(extract().slice().sort()).toEqual([...TERMINAL_STATUSES].sort());
  });

  it('is in agreement with its wired cron twin', () => {
    // The .js runner and app/api/cron/feed-reconcile/route.ts are two copies of
    // one guard. The cron gained 'Canceled' and the runner did not — that drift
    // is the defect this pins shut.
    const cron = read('app/api/cron/feed-reconcile/route.ts');
    const m = cron.match(/const\s+TERMINAL_STATUSES\s*=\s*new\s+Set\(\s*\[([\s\S]*?)\]\s*\)/);
    if (!m) throw new Error('feed-reconcile cron no longer declares TERMINAL_STATUSES as a Set literal.');
    expect(extract().slice().sort()).toEqual(quotedTokens(m[1]).slice().sort());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 3 — GAP 3: the phase-1 verification pair
// ═══════════════════════════════════════════════════════════════════════════

describe('GAP 3 — the phase-1 verification scripts count every terminal status', () => {
  const retentionSet = (rel: string) => {
    const src = read(rel);
    const m = src.match(/status\s+IN\s*\(([^)]*)\)/i);
    if (!m) throw new Error(rel + ' no longer contains a `status IN (…)` retention predicate.');
    return quotedTokens(m[1]);
  };

  it.each(['scripts/phase1-run.js', 'scripts/phase1-verify.sql'])(
    '%s counts exactly the canonical TERMINAL_STATUSES',
    (rel) => {
      expect(retentionSet(rel).slice().sort()).toEqual([...TERMINAL_STATUSES].sort());
    },
  );

  it('the runner and the SQL agree with each other', () => {
    expect(retentionSet('scripts/phase1-run.js').slice().sort()).toEqual(
      retentionSet('scripts/phase1-verify.sql').slice().sort(),
    );
  });

  it('and both agree with the wired data-retention cron they exist to verify', () => {
    const cron = read('app/api/cron/data-retention/route.ts');
    const m = cron.match(/const\s+TERMINAL_STATUSES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);
    if (!m) throw new Error('data-retention cron no longer declares TERMINAL_STATUSES as an array literal.');
    expect(retentionSet('scripts/phase1-verify.sql').slice().sort()).toEqual(quotedTokens(m[1]).slice().sort());
  });
});
