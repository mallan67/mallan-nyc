/// <reference types="jest" />
/**
 * THE ONE-TIME RE-SYNC ENDPOINT IS RETIRED. IT CANNOT COME BACK BY ACCIDENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT WAS REMOVED RATHER THAN NARROWED
 *
 * `POST /api/crm/listings/reset-sync` deleted rows and then rebuilt them from
 * Cotality. Its own header called it "ONE-TIME USE ... After use, this endpoint
 * can be removed", and a 2026 correction record already carried
 * "OQ-1 (remove/disable the reset-sync route entirely)" as an open decision.
 *
 * A first attempt narrowed the wipe to provider-sourced rows so Mallan-authored
 * listings survived. An adversarial review of that narrowing found it was still
 * unsafe in two ways I had not seen:
 *
 *   1. DELETE SCOPE ≠ REBUILD SCOPE. The delete predicate had NO agent filter —
 *      it selected every non-Mallan row in `listings`. The rebuild fetched only
 *      rows where THIS broker appeared on either side of a deal, capped at
 *      2000. So the route deleted the entire provider inventory and restored a
 *      small subset of it. Narrowing the delete did nothing about that
 *      asymmetry, because the asymmetry was between the two halves.
 *
 *   2. IT STILL DESTROYED MALLAN HISTORY. Scoping the dependent deletes to
 *      provider listing ids still removed `ClientListingAction`, `Showing`,
 *      `Comment`, `PriceHistory`, `MarketingActivity` and `ProtectedPeriod`
 *      rows — every one of which is MALLAN CRM/client history that merely
 *      HANGS OFF a provider listing. Cotality can rebuild listing facts. It has
 *      never held a showing Mallan booked or a comment a Mallan client wrote.
 *
 * Both defects live in the delete-then-rebuild SHAPE, not in the predicate. A
 * third narrowing would have been a third guess. The endpoint has no executable
 * consumer anywhere in the repo — verified again below — so retiring it removes
 * the hazard outright rather than managing it.
 *
 * Provider reconciliation that Mallan actually runs is non-destructive and
 * already exists: `lib/idx/sync.ts` upserts in place and
 * `app/api/cron/feed-reconcile` marks divergent rows. Neither deletes.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}

describe('the endpoint is gone', () => {
  it('the route file does not exist', () => {
    expect(existsSync(join(REPO, 'app/api/crm/listings/reset-sync/route.ts'))).toBe(false);
  });

  it('and nothing calls it', () => {
    // Docs and dated audit records may still describe it; executable code and
    // client bundles may not reference the path.
    const offenders = trackedFiles()
      .filter((f) => /^(app|lib|scripts|public)\//.test(f))
      .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|html)$/.test(f))
      .filter((f) => readFileSync(join(REPO, f), 'utf8').includes('reset-sync'));
    expect(offenders).toEqual([]);
  });
});

describe('no route may truncate listings or Mallan CRM history', () => {
  /**
   * The models below are MALLAN-OWNED history. Every one of them hangs off a
   * `listing_id`, and every one records something a person at Mallan did:
   * a client saved a listing, an agent booked a showing, someone wrote a
   * comment, a price was changed, marketing was run, a protection period was
   * agreed. Cotality can rebuild listing FACTS. It has never held any of this.
   */
  const MALLAN_HISTORY = [
    'listing',
    'clientListingAction',
    'showing',
    'comment',
    'priceHistory',
    'marketingActivity',
    'protectedPeriod',
  ];

  const sources = trackedFiles().filter(
    (f) => /^(app|lib|scripts)\//.test(f) && /\.ts$/.test(f) && !f.includes('__tests__'),
  );

  it('the scan actually covers the tree', () => {
    // Guard the guard: an empty file list would make every assertion below
    // vacuous — the exact failure mode this branch has been unwinding.
    expect(sources.length).toBeGreaterThan(200);
    expect(sources).toContain('lib/idx/sync.ts');
  });

  it.each(MALLAN_HISTORY)('nothing truncates prisma.%s', (model) => {
    // `deleteMany({})` with an empty filter is a table truncation. Matched in
    // several spellings, because the first version of this test only caught one
    // and a reviewer pointed out that `deleteMany()` and a hoisted `{}` slip
    // straight past it.
    const patterns = [
      new RegExp(`\\.${model}\\.deleteMany\\(\\s*\\)`),
      new RegExp(`\\.${model}\\.deleteMany\\(\\s*\\{\\s*\\}\\s*\\)`),
      new RegExp(`\\.${model}\\.deleteMany\\(\\s*\\{\\s*where\\s*:\\s*\\{\\s*\\}\\s*\\}\\s*\\)`),
    ];
    const offenders = sources.filter((f) => {
      const src = readFileSync(join(REPO, f), 'utf8');
      return patterns.some((re) => re.test(src));
    });
    expect(offenders).toEqual([]);
  });

  it('the truncation patterns really do match a truncation', () => {
    // Guard the guard again: prove the regexes fire, so "no offenders" means
    // something. Reconstructed here rather than left to trust.
    const shapes = [
      'await prisma.listing.deleteMany()',
      'await prisma.listing.deleteMany({})',
      'await prisma.listing.deleteMany({ where: {} })',
    ];
    const patterns = [
      /\.listing\.deleteMany\(\s*\)/,
      /\.listing\.deleteMany\(\s*\{\s*\}\s*\)/,
      /\.listing\.deleteMany\(\s*\{\s*where\s*:\s*\{\s*\}\s*\}\s*\)/,
    ];
    for (const shape of shapes) {
      expect(patterns.some((re) => re.test(shape))).toBe(true);
    }
  });
});

describe('provider reconciliation survives, and it does not delete', () => {
  it('the incremental sync upserts rather than deleting', () => {
    const src = readFileSync(join(REPO, 'lib/idx/sync.ts'), 'utf8');
    expect(src).toMatch(/\.upsert\(|\.update\(/);
    expect(src).not.toMatch(/listing\.deleteMany/);
  });

  it('feed-reconcile marks divergent rows rather than removing them', () => {
    const src = readFileSync(join(REPO, 'app/api/cron/feed-reconcile/route.ts'), 'utf8');
    expect(src).not.toMatch(/listing\.deleteMany/);
  });
});
