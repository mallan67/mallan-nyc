/**
 * MALLAN RLS RETURN-COPY SUPPRESSION — CHARTER Section 1A, Master 4.4.
 *
 * Mallan enters a listing into RealPlus, RealPlus submits to REBNY RLS, and the
 * listing returns through Cotality as an `RLS*` row. The LOCAL `SL-`/`RL-` row
 * stays canonical; the returned copy is a DUPLICATE and must never be a PUBLIC listing.
 *
 * A Mallan-office Cotality row with NO Mallan-authored twin is not a duplicate: it is Mallan's own
 * listing and the only public record of it (e.g. 800 Second Ave #806, RLS20123633, entered straight
 * into Cotality). The office id alone is therefore NOT proof of a duplicate; the proof is the same
 * physical unit as a published Mallan-authored row (lib/listings/mallan-twin-context.ts).
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
import { EMPTY_TWIN_CONTEXT, type MallanTwinContext } from '@/lib/listings/mallan-twin-context';
import { buildSearchDisplayWhere } from '@/lib/search/listing-access-decision';

const MALLAN_OFFICE = MALLAN_LIST_OFFICE_MLS_IDS[0];

/** The proven duplicate: RLS20093870 is the same physical unit as the Mallan-authored SL-0004. */
const TWIN: MallanTwinContext = { returnCopyIds: ['RLS20093870'], agentsByMlsId: {} };

describe('classifier — distinct concepts', () => {
  it('Mallan-authored local rows are LOCAL, never return-copies', () => {
    for (const row of [
      { listing_id: 'SL-0004' },
      { listing_id: 'RL-0011' },
      { listing_id: 'SL-0099', rls_eligible: false }, // website-only
    ]) {
      expect(isMallanLocalListing(row)).toBe(true);
      expect(isMallanRlsReturnCopy(row, TWIN)).toBe(false);
    }
  });

  it('a Mallan-office Cotality row that duplicates a Mallan-authored listing IS a return-copy', () => {
    const row = { listing_id: 'RLS20093870', list_office_mls_id: MALLAN_OFFICE, rls_eligible: true };
    expect(isMallanRlsReturnCopy(row, TWIN)).toBe(true);
    expect(isMallanLocalListing(row)).toBe(false);
  });

  it("OFFICE ID ALONE IS NOT PROOF: a Mallan-office Cotality row with no Mallan-authored twin is Mallan's own listing, not a duplicate", () => {
    const row806 = { listing_id: 'RLS20123633', list_office_mls_id: MALLAN_OFFICE, rls_eligible: true };
    expect(isMallanRlsReturnCopy(row806, TWIN)).toBe(false);
    // ...and with no context at all (nothing proven) nothing is hidden as a duplicate.
    expect(isMallanRlsReturnCopy({ listing_id: 'RLS20093870', list_office_mls_id: MALLAN_OFFICE }, EMPTY_TWIN_CONTEXT)).toBe(false);
  });

  it("a proven-duplicate id on a NON-Mallan office is never suppressed (the office must also be Mallan's)", () => {
    const row = { listing_id: 'RLS20093870', list_office_mls_id: '9999', rls_eligible: true };
    expect(isMallanRlsReturnCopy(row, TWIN)).toBe(false);
  });

  it('a third-party Cotality row is NOT a return-copy', () => {
    const row = { listing_id: 'RLS20105333', list_office_mls_id: '9999', rls_eligible: true };
    expect(isMallanRlsReturnCopy(row, TWIN)).toBe(false);
  });

  it('FAILS CLOSED ON SUPPRESSION: unknown provenance is not suppressed', () => {
    // Absent/blank office id must keep normal public treatment. Suppressing on
    // unknown provenance would silently delist third-party inventory.
    for (const row of [
      { listing_id: 'RLS1', rls_eligible: true },
      { listing_id: 'RLS2', list_office_mls_id: null, rls_eligible: true },
      { listing_id: 'RLS3', list_office_mls_id: '   ', rls_eligible: true },
    ]) {
      expect(isMallanRlsReturnCopy(row, { ...TWIN, returnCopyIds: ['RLS1', 'RLS2', 'RLS3'] })).toBe(false);
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
    expect(isMallanRlsReturnCopy(row, { ...TWIN, returnCopyIds: ['RLS777'] })).toBe(false);
  });
});

describe('suppression is inside the public query — before count/skip/take', () => {
  it('buildSearchDisplayWhere carries the exclusion', () => {
    const where = buildSearchDisplayWhere(undefined, TWIN) as Record<string, unknown>;
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(Array.isArray(and)).toBe(true);
    const hasExclusion = and.some((c) => Array.isArray((c as { OR?: unknown }).OR));
    expect(hasExclusion).toBe(true);
  });

  it('the exclusion re-admits Mallan-authored local rows explicitly', () => {
    const or = excludeMallanRlsReturnCopies(TWIN).OR;
    expect(or).toEqual(
      expect.arrayContaining([
        { listing_id: { startsWith: 'SL-' } },
        { listing_id: { startsWith: 'RL-' } },
      ]),
    );
  });

  it('the exclusion keeps null-office (unknown provenance) rows visible', () => {
    const or = excludeMallanRlsReturnCopies(TWIN).OR;
    expect(or).toEqual(expect.arrayContaining([{ list_office_mls_id: null }]));
  });

  it('the exclusion treats any non-Mallan office as third-party', () => {
    const or = excludeMallanRlsReturnCopies(TWIN).OR as Array<Record<string, unknown>>;
    const notIn = or.find((c) => {
      const v = c.list_office_mls_id as { notIn?: unknown } | null;
      return v && typeof v === 'object' && 'notIn' in v;
    });
    expect(notIn).toBeDefined();
    expect((notIn!.list_office_mls_id as { notIn: string[] }).notIn).toEqual([...MALLAN_LIST_OFFICE_MLS_IDS]);
  });

  it('a Mallan-office row is hidden ONLY by its proven id: the exclusion names the duplicate, never the office', () => {
    const or = excludeMallanRlsReturnCopies(TWIN).OR;
    expect(or).toEqual(expect.arrayContaining([{ listing_id: { notIn: ['RLS20093870'] } }]));
  });

  it('with nothing proven the exclusion hides nothing (a Mallan-office row stays public)', () => {
    const or = excludeMallanRlsReturnCopies(EMPTY_TWIN_CONTEXT).OR;
    // an always-true branch: no listing id is empty
    expect(or).toEqual(expect.arrayContaining([{ listing_id: { not: '' } }]));
    expect(JSON.stringify(or)).not.toContain('"listing_id":{"notIn"');
  });

  /**
   * CROSS-PAGE PROOF. The predicate is evaluated per row by the DB, so a twin
   * cannot survive by landing on a different page — which is exactly what a
   * post-pagination filter could not guarantee.
   */
  it('CROSS-PAGE: the twin is excluded regardless of which page it lands on', () => {
    const local = { listing_id: 'SL-0042', rls_eligible: false, list_office_mls_id: null };
    const twin = { listing_id: 'RLS20093870', rls_eligible: true, list_office_mls_id: MALLAN_OFFICE };
    const mallanListed = { listing_id: 'RLS20123633', rls_eligible: true, list_office_mls_id: MALLAN_OFFICE };
    const thirdParty = { listing_id: 'RLS20105333', rls_eligible: true, list_office_mls_id: '9999' };

    // Simulate the DB predicate over a population spanning many pages.
    const population = [
      local,
      ...Array.from({ length: 60 }, (_, i) => ({
        listing_id: `RLS9${i}`, rls_eligible: true, list_office_mls_id: '9999',
      })),
      twin, // far outside page 1
      mallanListed,
      thirdParty,
    ];
    const publicSet = population.filter((r) => !isMallanRlsReturnCopy(r, TWIN));

    expect(publicSet).toContain(local);
    expect(publicSet).toContain(thirdParty);
    expect(publicSet).toContain(mallanListed); // Mallan's own Cotality listing is the ONLY public record: it stays
    expect(publicSet).not.toContain(twin);

    // count / total / hasMore must describe the POST-suppression set.
    expect(publicSet.length).toBe(population.length - 1);
    const limit = 12;
    const page1 = publicSet.slice(0, limit);
    expect(page1).not.toContain(twin);
    expect(publicSet.length > limit).toBe(true); // hasMore from the public set
  });
});

describe('live Cotality clause — provider null semantics are not guessed', () => {
  it('is null when nothing is proven a duplicate (no clause to emit)', () => {
    expect(trestleExcludeMallanReturnCopiesClause(EMPTY_TWIN_CONTEXT)).toBeNull();
  });

  it('excludes only the proven duplicate ids, never the office', () => {
    const clause = trestleExcludeMallanReturnCopiesClause(TWIN);
    expect(clause).toBe("(ListingId ne 'RLS20093870')");
    expect(clause).not.toContain('ListOfficeMlsId');
  });

  it('joins several proven duplicates with and, and escapes quotes', () => {
    const clause = trestleExcludeMallanReturnCopiesClause({ returnCopyIds: ['RLS1', "RLS'2"], agentsByMlsId: {} });
    expect(clause).toBe("(ListingId ne 'RLS1' and ListingId ne 'RLS''2')");
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
   * `buildSearchDisplayWhere` must import the ONE owner explicitly. Listed by
   * path so a NEW public emitter that forgets it is a visible omission here
   * rather than a silent leak in production.
   */
  const DIRECT_APPLIERS = [
    'app/sitemap.ts',                              // canonical URLs / SEO
    'app/api/agents/[slug]/listings/route.ts',     // agent page (pre-take)
    'app/api/listings/similar/route.ts',           // similar comps
    'lib/buildings/public-building-data.ts',       // building manifest
  ];

  it.each(DIRECT_APPLIERS)('%s applies excludeMallanRlsReturnCopies with the loaded twin context', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/excludeMallanRlsReturnCopies\(/);
    expect(src).toMatch(/mallan-source-identity/);
    expect(src).toMatch(/loadMallanTwinContext\(\)/);
  });

  it('the canonical gate carries it so its consumers inherit it', () => {
    const src = read('lib/search/listing-access-decision.ts');
    expect(src).toMatch(/excludeMallanRlsReturnCopies\(context\)/);
  });

  it('autocomplete selects the authoritative list-side field AND suppresses', () => {
    // Without ListOfficeMlsId the route cannot classify provenance at all — the
    // filter would be inert. Both halves are required.
    const src = read('app/api/listings/suggest/route.ts');
    expect(src).toMatch(/'ListOfficeMlsId'/);
    expect(src).toMatch(/isMallanRlsReturnCopy\(/);
    expect(src).toMatch(/loadMallanTwinContext\(\)/);
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
    const whereIdx = src.indexOf('excludeMallanRlsReturnCopies(twin)');
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
