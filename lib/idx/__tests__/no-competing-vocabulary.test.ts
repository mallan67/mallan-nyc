/// <reference types="jest" />
/**
 * ONE VOCABULARY PER PROVIDER CONCEPT - a ratchet, not a claim of cleanliness.
 *
 * Every defect corrected in this workstream has one shape: the same provider
 * concept declared in more than one place, the copies drifting, and the drift
 * invisible because each copy looked reasonable alone.
 *
 *   - two opposite status substitutions that cancelled on a round trip
 *   - three separate browser/server status translation tables
 *   - a four-vocabulary chain that silently broke the UCBA Coming Soon badge
 *   - a thirteen-pair field-rename table with no provider basis
 *
 * A RENAMING PASS CANNOT FIX THIS AND MAKES IT WORSE. Renaming the second
 * vocabulary leaves two vocabularies with more similar names. This file exists
 * because a mechanical pass was attempted, was reverted, and the count below is
 * what it would have renamed instead of removed.
 *
 * WHAT COUNTS AS AN OFFENCE, AND WHAT DELIBERATELY DOES NOT
 *
 * Counted: a file enumerating three or more members of a live provider enum as
 * quoted string literals. Three is the threshold because one or two literals is
 * a specific value being used; three is a vocabulary being restated.
 *
 * NOT counted, and this distinction was got wrong once already:
 *
 *   MALLAN BUSINESS VOCABULARY IS NOT A PROVIDER CLAIM. Sold and Rented appear
 *   across twenty-plus CRM, retention and Prisma modules as statuses MALLAN
 *   OWNS AND STORES. They are not StandardStatus members and were never meant
 *   to be. An earlier draft of this test asserted they must not appear anywhere
 *   and was wrong: it would have forced Mallan's own deal pipeline to be
 *   renamed to satisfy a provider rule that does not govern it.
 *
 *   Likewise the double-L Cancelled. The provider emits the single-L spelling.
 *   Mallan normalises it deliberately - lib/idx/trestle-mapper.ts and
 *   lib/compliance/status.ts both fold it on purpose. That is a Mallan spelling
 *   of a Mallan concept, not a misspelling of a provider one.
 *
 * WHAT THIS TEST IS. A static architectural scan, used only for an
 * architectural question: HOW MANY PLACES declare this concept. Per CLAUDE.md
 * section F a scan is NOT sufficient for a behaviour claim; behaviour is proven
 * by the suites that exercise the mappers and filters directly.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PROPERTY_TYPE_MEMBERS } from '@/lib/search/canonical/property-type-universe';
import { STANDARD_STATUS_MEMBERS } from '@/lib/search/canonical/status-token-contract';

const REPO = path.resolve(__dirname, '..', '..', '..');

/** The files permitted to declare a provider vocabulary. */
const CANONICAL = [
  'lib/search/canonical/property-type-universe.ts',
  'lib/search/canonical/status-token-contract.ts',
];

/**
 * KNOWN PARALLEL VOCABULARIES - the debt, itemised.
 *
 * Captured 2026-08-23. Each entry restates a provider vocabulary somewhere
 * other than the canonical contract. They are NOT approved; they are RECORDED,
 * so the number is visible and cannot grow while the replacement proceeds
 * family by family. The suffix is what the file restates: PTn = n PropertyType
 * members, SSn = n StandardStatus members.
 *
 * Two entries are already understood and deliberately deferred:
 *
 *   lib/idx/types.ts - IDXListing.standardStatus is MISNAMED rather than
 *     mis-valued. It carries Mallan's NORMALISED status while its name claims
 *     the provider's field. Correcting the name changes a public DTO field, so
 *     it belongs to the DTO family, not this one.
 *
 *   lib/search/canonical/listing-class.ts and property-subtype-contract.ts -
 *     canonical-adjacent; they may be legitimate second contracts or may need
 *     folding into the universe contract. Not decided here.
 *
 * REMOVING an entry requires the file to actually be clean - the test below
 * fails on a stale entry, so this list cannot silently over-permit.
 */
const KNOWN_PARALLEL_VOCABULARIES: readonly string[] = [
  'app/agents/[name]/listings/ActiveListingsTabs.tsx', // SS6
  'app/api/agents/[slug]/listings/route.ts', // SS4
  'app/api/crm/compliance/audit/route.ts', // SS6
  'app/api/crm/listings/[id]/status/route.ts', // SS7
  'app/api/crm/listings/route.ts', // SS4
  'app/api/cron/data-retention/route.ts', // SS3
  'app/api/cron/feed-reconcile/route.ts', // SS7
  'app/api/cron/listing-expiration/route.ts', // SS5
  'app/api/debug/media-health/route.ts', // SS3
  'app/api/listings/building/route.ts', // SS4
  'app/api/listings/suggest/route.ts', // SS3
  'app/api/market/route.ts', // SS4
  'app/components/BuildingUnits.tsx', // SS5
  'app/components/PriceHistory.tsx', // SS3
  'app/components/SearchFilterPanel.tsx', // SS3
  'app/offer-status/page.tsx', // SS3
  'app/portal/tenant/page.tsx', // SS4
  'lib/compliance/dom-tracker.ts', // SS3
  'lib/compliance/public-listing-filter.ts', // SS4
  'lib/compliance/rebny-field-tables.ts', // PT4+SS10
  'lib/compliance/rls-eligibility.ts', // PT5
  'lib/compliance/rls-enforcement.ts', // PT8+SS3
  'lib/compliance/status.ts', // SS9
  'lib/comps/defaults.ts', // SS3
  'lib/comps/fetch-comps.ts', // SS6
  'lib/crm/listing-urls.ts', // SS3
  'lib/crm/status-mapping.ts', // SS7
  'lib/demand-index/collector.ts', // SS3
  'lib/idx/db-to-public-dto.ts', // SS4
  'lib/idx/fetch.ts', // SS7
  'lib/idx/media-sync.ts', // SS4
  'lib/idx/reconcile-decision.ts', // SS5
  'lib/idx/sync.ts', // SS4
  'lib/idx/trestle-mapper.ts', // SS8
  'lib/idx/types.ts', // SS8
  'lib/market/query-contract.ts', // SS4
  'lib/retention/archive-terminals.ts', // SS3
  'lib/scanner/trestle-off-market-filter.ts', // SS9
  'lib/search/canonical/listing-class.ts', // PT8
  'lib/search/canonical/live-truth.ts', // SS11
  'lib/search/canonical/property-subtype-contract.ts', // PT4
  'lib/search/canonical/property-type-universe.ts', // PT13
  'lib/search/canonical/status-token-contract.ts', // SS11
  'lib/search/canonical/status.ts', // SS8
  'lib/search/crm-idx-filter.ts', // SS3
  'lib/search/legacy-status-migration.ts', // SS11
  'lib/search/public-listing-db.ts', // SS3
  'lib/search/public-listing-trestle.ts', // SS3
  'lib/syndication/eligibility.ts', // SS5
  'lib/types/listing.ts', // SS5
  'public/crm/js/compliance/compliance-gates-and-output.js', // SS10
  'public/crm/js/compliance/form-shared.js', // SS3
  'public/crm/js/core/cotality-field-map.js', // renamed + corrected 2026-08-23; still lists members in its media notes
  'public/crm/js/dashboard/panels.js', // SS10
  'public/crm/js/dashboard/panels/sales-crm/index.js', // SS4
  'public/crm/js/dashboard/workspace.js', // SS3
  'public/crm/js/manage/manage-listings.js', // SS10
  'public/crm/js/output/reports.js', // SS9
  'public/crm/js/render/grid-column-defs.js', // SS3
  'public/crm/js/render/render-gallery.js', // SS3
  'public/crm/js/render/render-summary.js', // SS3
  'public/crm/js/render/shared-badges.js', // SS3
  'public/crm/js/search/cotality-criteria-boundary.js', // SS11
  'public/crm/js/search/pagination.js', // SS3
  'public/crm/js/search/saved-searches.js', // SS10
  'public/crm/js/search/search-engine.js', // SS10
];

/** Source Mallan ships. Captures, evidence and generated output are not source. */
function mallanSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '__tests__') continue;
        walk(full);
      } else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) {
        out.push(path.relative(REPO, full).split(path.sep).join('/'));
      }
    }
  };
  for (const r of ['lib', 'app', 'public/crm/js']) walk(path.join(REPO, r));
  return out;
}

/**
 * Distinct members of `vocabulary` appearing as QUOTED STRING LITERALS.
 *
 * Quoted specifically: a bare mention in prose or a property access refers to
 * the concept, which is fine. A quoted literal declares a value, which is how a
 * second vocabulary gets built. Comments are stripped first - commentary about
 * a vocabulary is not a declaration of one.
 */
function declaredMembers(source: string, vocabulary: readonly string[]): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return vocabulary.filter((m) =>
    new RegExp(String.raw`['"` + '`' + String.raw`]` + m + String.raw`['"` + '`' + String.raw`]`).test(code),
  );
}

function enumeratesAVocabulary(file: string): boolean {
  const src = fs.readFileSync(path.join(REPO, file), 'utf8');
  return (
    declaredMembers(src, PROPERTY_TYPE_MEMBERS).length >= 3 ||
    declaredMembers(src, STANDARD_STATUS_MEMBERS).length >= 3
  );
}

const files = mallanSourceFiles();

describe('the sweep itself is sound', () => {
  it('actually walks the source tree', () => {
    // A scan that walks nothing passes every assertion below it - the same
    // failure mode as an HTTP error collapsing to zero rows. This is the control.
    expect(files.length).toBeGreaterThan(200);
    for (const c of CANONICAL) expect(files).toContain(c);
  });

  it('the canonical contracts carry the COMPLETE live vocabularies', () => {
    // The positive half. A ratchet that only counts offenders would pass if the
    // canonical contract were emptied, so assert it is the real, whole thing.
    expect(PROPERTY_TYPE_MEMBERS).toHaveLength(13);
    expect(STANDARD_STATUS_MEMBERS).toHaveLength(11);
    for (const [file, vocabulary] of [
      [CANONICAL[0], PROPERTY_TYPE_MEMBERS],
      [CANONICAL[1], STANDARD_STATUS_MEMBERS],
    ] as const) {
      const src = fs.readFileSync(path.join(REPO, file), 'utf8');
      expect(declaredMembers(src, vocabulary)).toHaveLength(vocabulary.length);
    }
  });
});

describe('the parallel-vocabulary count cannot grow', () => {
  it('no file outside the recorded set restates a provider vocabulary', () => {
    const fresh = files.filter(
      (f) =>
        !CANONICAL.includes(f) &&
        !KNOWN_PARALLEL_VOCABULARIES.includes(f) &&
        enumeratesAVocabulary(f),
    );
    // A new entry here means a new second source of truth was just created.
    // Point the module at lib/search/canonical/ instead of restating members.
    expect(fresh).toEqual([]);
  });

  it('every recorded entry is still real - no stale over-permitting', () => {
    // Without this, a fixed or deleted file would leave a permanent hole in the
    // ratchet that a future regression could slip through unnoticed.
    const stale = KNOWN_PARALLEL_VOCABULARIES.filter(
      (f) => !fs.existsSync(path.join(REPO, f)) || !enumeratesAVocabulary(f),
    );
    expect(stale).toEqual([]);
  });
});

describe('the dead false-authority modules stay deleted', () => {
  /**
   * Both declared provider facts the live API contradicts, and both had zero
   * callers. They were DELETED rather than renamed: renaming a fabricated
   * contract to match the real provider's name produces a fabricated contract
   * that is harder to spot.
   *
   * The deleted TypeScript mapper declared PropertyType with four members
   * including one the live API rejects with HTTP 400 (live: thirteen members),
   * a nine-member status union including two non-members, and a three-member
   * fee frequency where the live FeeFrequency enum has sixteen.
   *
   * Anything genuinely needed already exists: lib/idx/mapping.ts for
   * provider-to-internal mapping, and the two canonical contracts above.
   */
  it.each([
    'lib/compliance/reso-mapper.ts',
    'public/crm/js/compliance/reso-mappers.js',
  ])('%s is absent', (p) => {
    expect(fs.existsSync(path.join(REPO, p))).toBe(false);
  });
});
