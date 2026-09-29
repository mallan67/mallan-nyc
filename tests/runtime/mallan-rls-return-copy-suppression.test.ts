/**
 * MALLAN RLS RETURN-COPY SUPPRESSION — CHARTER Section 1A.
 *
 * Mallan's listing reaches REBNY RLS through a legacy upstream intermediary
 * (a listing-input system outside this repo; not named here because Cotality API
 * is the only provider authority in this architecture), and the
 * listing returns through Cotality as an `RLS*` row. The LOCAL `SL-`/`RL-` row
 * stays canonical; the returned copy is retained internally for
 * audit/reconciliation but must never be a PUBLIC listing.
 *
 * THE CROSS-PAGE POINT: suppression must live INSIDE the public access query, so
 * it applies before `count` / `skip` / `take`. A post-pagination JS filter is
 * page-local — a local row on page N and its twin on page N+1 would let the twin
 * surface, and `total`/`hasMore` would describe the pre-suppression population.
 */

import {
  isMallanLocalListing,
  isMallanRlsReturnCopy,
  excludeMallanRlsReturnCopies,
  trestleExcludeMallanReturnCopiesClause,
  MALLAN_LIST_OFFICE_MLS_IDS,
} from '@/lib/listings/mallan-source-identity';
import { buildSearchDisplayWhere } from '@/lib/search/listing-access-decision';

const MALLAN_OFFICE = MALLAN_LIST_OFFICE_MLS_IDS[0];

describe('classifier — three distinct concepts', () => {
  it('Mallan-authored local rows are LOCAL, never return-copies', () => {
    for (const row of [
      { listing_id: 'SL-0004' },
      { listing_id: 'RL-0011' },
      { listing_id: 'RLS20093870', rls_eligible: false }, // website-only
    ]) {
      expect(isMallanLocalListing(row)).toBe(true);
      expect(isMallanRlsReturnCopy(row)).toBe(false);
    }
  });

  it('a Cotality row with Mallan list-side office IS a return-copy', () => {
    const row = { listing_id: 'RLS20093870', list_office_mls_id: MALLAN_OFFICE, rls_eligible: true };
    expect(isMallanRlsReturnCopy(row)).toBe(true);
    expect(isMallanLocalListing(row)).toBe(false);
  });

  it('a third-party Cotality row is NOT a return-copy', () => {
    const row = { listing_id: 'RLS20105333', list_office_mls_id: '9999', rls_eligible: true };
    expect(isMallanRlsReturnCopy(row)).toBe(false);
  });

  it('FAILS CLOSED ON SUPPRESSION: unknown provenance is not suppressed', () => {
    // Absent/blank office id must keep normal public treatment. Suppressing on
    // unknown provenance would silently delist third-party inventory.
    for (const row of [
      { listing_id: 'RLS1', rls_eligible: true },
      { listing_id: 'RLS2', list_office_mls_id: null, rls_eligible: true },
      { listing_id: 'RLS3', list_office_mls_id: '   ', rls_eligible: true },
    ]) {
      expect(isMallanRlsReturnCopy(row)).toBe(false);
    }
  });

  it('NEVER uses agent_id or brokerage name as identity', () => {
    // `syncAgentHistory` sets agent_id from BOTH list-side and BUYER-side
    // matches, so it is a history/roster association, not list-side identity.
    const row = {
      listing_id: 'RLS777',
      list_office_mls_id: '9999',
      rls_eligible: true,
      agent_id: 42,
      list_office_name: 'Mallan Real Estate Inc',
    } as Record<string, unknown>;
    expect(isMallanRlsReturnCopy(row)).toBe(false);
  });
});

describe('suppression is inside the public query — before count/skip/take', () => {
  it('buildSearchDisplayWhere carries the exclusion', () => {
    const where = buildSearchDisplayWhere() as Record<string, unknown>;
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(Array.isArray(and)).toBe(true);
    const hasExclusion = and.some((c) => Array.isArray((c as { OR?: unknown }).OR));
    expect(hasExclusion).toBe(true);
  });

  it('the exclusion re-admits Mallan-authored local rows explicitly', () => {
    const or = excludeMallanRlsReturnCopies().OR;
    expect(or).toEqual(
      expect.arrayContaining([
        { rls_eligible: false },
        { listing_id: { startsWith: 'SL-' } },
        { listing_id: { startsWith: 'RL-' } },
      ]),
    );
  });

  it('the exclusion keeps null-office (unknown provenance) rows visible', () => {
    const or = excludeMallanRlsReturnCopies().OR;
    expect(or).toEqual(expect.arrayContaining([{ list_office_mls_id: null }]));
  });

  it('the exclusion targets ONLY Mallan office ids', () => {
    const or = excludeMallanRlsReturnCopies().OR as Array<Record<string, unknown>>;
    const notIn = or.find((c) => {
      const v = c.list_office_mls_id as { notIn?: unknown } | null;
      return v && typeof v === 'object' && 'notIn' in v;
    });
    expect(notIn).toBeDefined();
    expect((notIn!.list_office_mls_id as { notIn: string[] }).notIn).toEqual([...MALLAN_LIST_OFFICE_MLS_IDS]);
  });

  /**
   * CROSS-PAGE PROOF. The predicate is evaluated per row by the DB, so a twin
   * cannot survive by landing on a different page — which is exactly what a
   * post-pagination filter could not guarantee.
   */
  it('CROSS-PAGE: the twin is excluded regardless of which page it lands on', () => {
    const local = { listing_id: 'SL-0042', rls_eligible: false, list_office_mls_id: null };
    const twin = { listing_id: 'RLS20093870', rls_eligible: true, list_office_mls_id: MALLAN_OFFICE };
    const thirdParty = { listing_id: 'RLS20105333', rls_eligible: true, list_office_mls_id: '9999' };

    // Simulate the DB predicate over a population spanning many pages.
    const population = [
      local,
      ...Array.from({ length: 60 }, (_, i) => ({
        listing_id: `RLS9${i}`, rls_eligible: true, list_office_mls_id: '9999',
      })),
      twin, // far outside page 1
      thirdParty,
    ];
    const publicSet = population.filter((r) => !isMallanRlsReturnCopy(r));

    expect(publicSet).toContain(local);
    expect(publicSet).toContain(thirdParty);
    expect(publicSet).not.toContain(twin);

    // count / total / hasMore must describe the POST-suppression set.
    expect(publicSet.length).toBe(population.length - 1);
    const limit = 12;
    const page1 = publicSet.slice(0, limit);
    expect(page1).not.toContain(twin);
    expect(publicSet.length > limit).toBe(true); // hasMore from the public set
  });
});

describe('live Trestle clause — provider null semantics are not guessed', () => {
  it('keeps null-office rows visible via an explicit OR, not a bare ne', () => {
    const clause = trestleExcludeMallanReturnCopiesClause();
    expect(clause).not.toBeNull();
    // A bare `ne` can drop null-office rows on some OData providers; the clause
    // must admit nulls explicitly.
    expect(clause).toMatch(/ListOfficeMlsId eq null/);
    expect(clause).toContain(`ListOfficeMlsId ne '${MALLAN_OFFICE}'`);
  });
});

describe('held syndication config stays separate', () => {
  it('read-side identity does NOT consume the held syndication constant', () => {
    // lib/syndication/mallan-identity.ts MALLAN_OFFICE_MLS_IDS is intentionally
    // EMPTY (PR #162/#163 empty-config guard). Coupling read-side display to it
    // would risk activating the held syndication program.
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../lib/listings/mallan-source-identity.ts'),
      'utf8',
    ) as string;
    expect(src).not.toMatch(/from ['"]@\/lib\/syndication\/mallan-identity['"]/);
    expect(MALLAN_LIST_OFFICE_MLS_IDS.length).toBeGreaterThan(0);
  });
});

describe('every PUBLIC emitter applies the canonical exclusion', () => {
  const read = (rel: string) =>
    require('fs').readFileSync(require('path').resolve(__dirname, '../../', rel), 'utf8') as string;

  /**
   * Emitters that build their own where-clause instead of calling
   * `buildSearchDisplayWhere`. Listed by path so a NEW public emitter that
   * forgets suppression is a visible omission here rather than a silent leak.
   *
   * TWO ways to satisfy it, both fine:
   *   - call `excludeMallanRlsReturnCopies()` directly, or
   *   - spread `publicListingVisibilityWhere()`, the canonical layer that
   *     bundles the display gates WITH the suppression.
   *
   * The list grew because four client-facing surfaces were missing entirely:
   * the CMA handed to a seller, neighborhood market medians, buyer
   * recommendations and portal comparables each spread the BARE
   * `SEARCH_DISPLAY_GATE`, which carries the gate columns and neither the status
   * allow-list nor the suppression. Every Mallan listing that had round-tripped
   * through RLS was counted twice in all four. They now go through the shared
   * layer, which is also why `similar/route.ts` no longer needs its own
   * hand-rolled copy.
   */
  const DIRECT_APPLIERS = [
    'app/sitemap.ts',                              // canonical URLs / SEO
    'app/api/agents/[slug]/listings/route.ts',     // agent page (pre-take)
    'app/api/listings/similar/route.ts',           // similar comps
    'lib/buildings/public-building-data.ts',       // building manifest
    'lib/search/public-listing-db.ts',             // /api/listings — pre-count, pre-take
    'lib/cma/engine.ts',                           // CMA comps handed to a seller
    'lib/market-pulse/snapshot.ts',                // neighborhood inventory + medians
    'lib/buyer-intent/recommender.ts',             // buyer portal recommendations
    'app/api/portal/comparables/route.ts',         // portal comparables
    'app/api/market/route.ts',                     // published market statistics
  ];

  it.each(DIRECT_APPLIERS)('%s suppresses Mallan return-copies', (rel) => {
    const src = read(rel);
    const direct = /excludeMallanRlsReturnCopies\(\)/.test(src);
    const viaCanonicalLayer = /publicListingVisibilityWhere\(\)/.test(src);
    expect(direct || viaCanonicalLayer).toBe(true);
    // And it must come from the one owner, not a local re-implementation.
    expect(src).toMatch(/mallan-source-identity|listing-access-decision/);
  });

  it.each(DIRECT_APPLIERS)('%s does not spread the BARE gate', (rel) => {
    // `...SEARCH_DISPLAY_GATE` is half a visibility decision. Spreading it is
    // what let four surfaces double-count Mallan inventory.
    //
    // lib/search/public-listing-db.ts is the one legitimate exception: it puts
    // the bare gate inside ONE branch of an OR because RLS-backed and
    // website-only rows are gated differently, and applies the suppression at
    // the top level via appendAnd.
    if (rel === 'lib/search/public-listing-db.ts') return;
    expect(read(rel)).not.toMatch(/\.\.\.SEARCH_DISPLAY_GATE/);
  });

  it('the canonical gate carries it so its consumers inherit it', () => {
    const src = read('lib/search/listing-access-decision.ts');
    expect(src).toMatch(/excludeMallanRlsReturnCopies\(\)/);
  });

  it('autocomplete selects the authoritative list-side field AND suppresses', () => {
    // Without ListOfficeMlsId the route cannot classify provenance at all — the
    // filter would be inert. Both halves are required.
    const src = read('app/api/listings/suggest/route.ts');
    expect(src).toMatch(/'ListOfficeMlsId'/);
    expect(src).toMatch(/isMallanRlsReturnCopy\(/);
  });

  it('the agent page suppresses BEFORE its take window', () => {
    // The post-retrieval physical-unit dedupe only pairs a twin when BOTH rows
    // survive `take`. A twin beyond the window would otherwise reach the page
    // alone, with no local row present to suppress it.
    // Strip comments first: the explanatory comment legitimately MENTIONS
    // 'take: 100', and matching prose instead of code would invert the result.
    const src = read('app/api/agents/[slug]/listings/route.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const whereIdx = src.indexOf('excludeMallanRlsReturnCopies()');
    const takeIdx = src.indexOf('take: 100');
    expect(whereIdx).toBeGreaterThan(-1);
    expect(takeIdx).toBeGreaterThan(-1);
    expect(whereIdx).toBeLessThan(takeIdx);
  });

  it('agent_id is never used as Mallan ownership in the identity owner', () => {
    const src = read('lib/listings/mallan-source-identity.ts');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/agent_id/);
    expect(code).not.toMatch(/owner_client_id/);
    expect(code).not.toMatch(/list_office_name/);
  });
});
