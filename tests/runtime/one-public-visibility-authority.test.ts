/// <reference types="jest" />
/**
 * THERE IS ONE PUBLIC-VISIBILITY AUTHORITY, AND IT IS ALLOW-LIST SHAPED.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS DELETED
 *
 * `lib/compliance/public-listing-filter.ts` exported `PUBLIC_LISTING_GATE` and
 * `PORTAL_LISTING_GATE`, and its own header told callers to use them:
 *
 *     await prisma.listing.findMany({ where: { ...PUBLIC_LISTING_GATE, … } })
 *
 * It had ZERO importers. Not "few" — none: no `import`, no `require`, no
 * re-export from `lib/compliance/index.ts`, verified again at this head.
 *
 * Leaving it was not neutral, because of its SHAPE. Every live public reader is
 * an ALLOW-list (`status: { in: [...] }`), so an unknown or misspelled status
 * fails closed. That gate was the one DENY-list (`status: { notIn: [...] }`),
 * which fails OPEN: any status not on the list is displayable. Its list also
 * omitted `Hold`, `Incomplete` and `Delete` — all real Cotality statuses that
 * mean off-market — and contained two values that are not statuses at all
 * (`TemporarilyOffMarket`, `OwnerOptOut`).
 *
 * So a developer following its documented usage would have written a public
 * query that displayed listings on Hold. Dead code with a usage example is a
 * trap, not neutral weight.
 *
 * `PORTAL_LISTING_GATE` had no status filter whatsoever.
 *
 * The module's third export, a 9-value `TERMINAL_STATUSES`, was likewise
 * consumed by nobody; every other terminal set in the repo is an independent
 * definition, the canonical one being `lib/idx/trestle-mapper.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE THIS PINS
 *
 * The canonical visibility decision lives in `lib/search/listing-access-decision.ts`
 * (`publicListingVisibilityWhere` — gates plus return-copy suppression — and the
 * `buildSearchDisplayWhere` / `buildProjectionSearchWhere` builders over it). A
 * second module that assembles the same distribution-gate columns into its own
 * where-shape is a competing authority and will drift, which is exactly the
 * history this branch has been unwinding.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');

/** The one module allowed to assemble a public/portal visibility where-shape. */
const CANONICAL = 'lib/search/listing-access-decision.ts';

/**
 * The canonical search package is deliberately NOT WIRED into runtime readers —
 * `canonical-a1-contract.test.ts` enforces that separately — so its display-gate
 * module is not a competing authority today. It is listed here explicitly rather
 * than pattern-matched away, so it cannot quietly become one.
 */
const NOT_WIRED = ['lib/search/canonical/display-gate.ts'];

function trackedSources(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', 'lib', 'app'], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out
    .split('\0')
    .filter((f) => f && /\.tsx?$/.test(f) && !f.includes('__tests__') && !f.endsWith('.test.ts'));
}

/** Strip comments so prose describing a gate is not mistaken for one. */
function code(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const GATE_COLUMNS = [
  /\bidx_display_yn\s*:\s*true\b/,
  /\bowner_opt_out\s*:\s*false\b/,
  /\bparticipant_only\s*:\s*false\b/,
  /\binternet_entire_listing_display_yn\s*:\s*true\b/,
];

describe('the dead fail-open gate module is gone', () => {
  it('lib/compliance/public-listing-filter.ts no longer exists', () => {
    expect(existsSync(join(REPO, 'lib/compliance/public-listing-filter.ts'))).toBe(false);
  });

  it('nothing imports it', () => {
    const offenders = trackedSources().filter((f) =>
      /public-listing-filter|PUBLIC_LISTING_GATE|PORTAL_LISTING_GATE/.test(
        code(readFileSync(join(REPO, f), 'utf8')),
      ),
    );
    expect(offenders).toEqual([]);
  });
});

describe('no second module assembles its own visibility where-shape', () => {
  it('only the canonical module declares the full gate column set', () => {
    // A module that names ALL FOUR distribution-gate columns in one object is
    // building a visibility decision, whatever it calls itself.
    const offenders = trackedSources()
      .filter((f) => f !== CANONICAL && !NOT_WIRED.includes(f))
      .filter((f) => {
        const src = code(readFileSync(join(REPO, f), 'utf8'));
        return GATE_COLUMNS.every((re) => re.test(src));
      });
    expect(offenders).toEqual([]);
  });

  it('the canonical module really does declare it — the scan is not vacuous', () => {
    const src = code(readFileSync(join(REPO, CANONICAL), 'utf8'));
    for (const re of GATE_COLUMNS) expect(src).toMatch(re);
  });
});

describe('public status filtering is allow-list shaped, never deny-list', () => {
  it('no PUBLIC visibility surface filters status with notIn', () => {
    // `status: { notIn: [...] }` fails OPEN — anything not enumerated displays.
    // Every live public reader uses `status: { in: [...] }`, which fails closed
    // on an unknown or misspelled value. That posture is the reason the canceled
    // spelling split was never a public-display leak, and it is precisely what
    // the deleted module got backwards.
    //
    // SCOPED TO PUBLIC SURFACES ON PURPOSE. A deny-list is the CORRECT shape
    // elsewhere and this must not flag it: `app/api/crm/listings` hides
    // Withdrawn/Canceled from an agent's My Listings (an internal view that
    // should show everything else), and three lead-pipeline queries exclude
    // closed/declined SellerLead rows — a different model entirely. A guard that
    // failed on those would be pressure to weaken it.
    //
    // The dangerous combination is a deny-list on a surface that ALSO declares
    // the public distribution gates, which is exactly what made the deleted
    // module a trap.
    const offenders: string[] = [];
    for (const f of trackedSources()) {
      const src = code(readFileSync(join(REPO, f), 'utf8'));
      const isPublicGate = GATE_COLUMNS.every((re) => re.test(src));
      if (!isPublicGate) continue;
      if (/status\s*:\s*\{\s*notIn\s*:/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('the deleted module would have been caught by that rule', () => {
    // Guard the guard: reconstruct its exact shape and prove the predicate
    // fires, so narrowing the scope above did not turn this into decoration.
    const deletedShape = [
      'export const PUBLIC_LISTING_GATE = {',
      '  owner_opt_out: false,',
      '  participant_only: false,',
      '  internet_entire_listing_display_yn: true,',
      '  idx_display_yn: true,',
      '  status: { notIn: [...TERMINAL_STATUSES] },',
      '};',
    ].join('\n');
    const isPublicGate = GATE_COLUMNS.every((re) => re.test(deletedShape));
    expect(isPublicGate).toBe(true);
    expect(/status\s*:\s*\{\s*notIn\s*:/.test(deletedShape)).toBe(true);
  });
});
