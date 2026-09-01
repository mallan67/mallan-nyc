/// <reference types="jest" />
/**
 * THE PUBLIC SEARCH UNIVERSE IS SETTLED BEFORE COUNT, SORT AND PAGINATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * The Section 6 impact graph found the public path settling membership in the
 * wrong place. Rows were cut into a page by Prisma `skip`/`take`, and only then
 * filtered, deduped, merged and intersected — so the page had holes, the total
 * described a different population from the cards, and a criterion could remove
 * a row the count had already promised.
 *
 * These guards are written against the ORDER, not against a symptom. A filter
 * that produces the right rows on page 1 and the wrong rows on page 4 is the
 * defect this file exists to stop, and it is invisible to any test that only
 * ever asks for page 1.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildPublicListingDbSearch,
} from '@/lib/search/public-listing-db';
import {
  buildSearchDisplayWhere,
} from '@/lib/search/listing-access-decision';
import { MALLAN_LIST_OFFICE_MLS_IDS } from '@/lib/listings/mallan-source-identity';

/** Every `list_office_mls_id` constraint anywhere in a nested where-shape. */
function officeConstraints(node: unknown, found: unknown[] = []): unknown[] {
  if (node === null || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) officeConstraints(item, found);
    return found;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'list_office_mls_id') found.push(value);
    else officeConstraints(value, found);
  }
  return found;
}

describe('no membership-changing step runs after the page is cut', () => {
  const route = readFileSync(
    resolve(__dirname, '..', '..', 'app/api/listings/route.ts'),
    'utf8',
  );

  /**
   * The route with COMMENT-ONLY LINES removed.
   *
   * "This construct no longer exists" is a claim about code. Checked against the
   * raw file it fails the moment someone documents WHY the construct was
   * removed — and the first version of these guards did exactly that, because
   * route.ts now carries the old `hasPostFilter` expression in the comment
   * explaining its deletion. Deleting the explanation to satisfy a test would
   * have been the wrong repair: the comment is the most valuable line there.
   *
   * Whole-line comments only, so a code line containing `//` inside a URL is
   * left intact rather than truncated.
   */
  const code = route
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

  /** Position of a required marker, asserted found so a rename fails loudly. */
  function at(marker: string): number {
    const i = route.indexOf(marker);
    if (i < 0) throw new Error(`anchor lost in app/api/listings/route.ts: ${marker}`);
    return i;
  }

  it('finds every anchor it reasons about — guard the guard', () => {
    // Without this, a renamed symbol would make `indexOf` return -1 and the
    // ordering comparisons below would compare garbage and pass. That exact
    // failure shape cost a green CI run earlier in this workstream.
    expect(() => {
      at('const readCandidateBatch =');
      at('assemblePublicUniverse<DbListing, DbCandidate>');
      at('const mergedCorpus = await mergeExclusiveListings(');
      at('const pageDtos = corpus.slice(skip, skip + limit);');
    }).not.toThrow();
  });

  describe('DB path', () => {
    it('the universe is assembled before anything reads a page', () => {
      expect(at('assemblePublicUniverse<DbListing, DbCandidate>')).toBeGreaterThan(
        at('const readCandidateBatch ='),
      );
    });

    it('Open House membership is resolved BEFORE the universe, and refuses when unavailable', () => {
      // It used to run last, over an already-cut page, inside a catch that
      // returned the UNFILTERED set when the provider failed.
      expect(at('readPublicOpenHouseMembership(')).toBeLessThan(
        at('assemblePublicUniverse<DbListing, DbCandidate>'),
      );
      expect(route).toContain('membership.state === "unavailable"');
      expect(route).toContain('status: 503');
    });

    it('no page-local filter survives after the universe is settled', () => {
      // `applyPublicListingPostFilters` is now a stage INSIDE the assembler.
      // If it ever reappears after it, a criterion is filtering a page again.
      expect(code.indexOf('applyPublicListingPostFilters(', code.indexOf('const dbTotal = universe.count;'))).toBe(-1);
      expect(code.indexOf('ohKeys.has(', code.indexOf('const dbTotal = universe.count;'))).toBe(-1);
    });

    it('the reported total is the settled universe, not the SQL predicate count', () => {
      expect(route).toContain('const dbTotal = universe.count;');
      expect(route).toContain('candidatePredicateCount: dbPredicateCount');
      // The predicate count is kept — as its own named number, never as `total`.
      expect(route).not.toMatch(/\btotal: dbPredicateCount\b/);
    });
  });

  describe('live-Cotality fallback path', () => {
    it('the exclusives merge happens BEFORE the page slice', () => {
      // Merging after the slice ADDS rows to a decided page, so one canonical
      // listing could hold a place on more than one page.
      expect(at('const mergedCorpus = await mergeExclusiveListings(')).toBeLessThan(
        at('const pageDtos = corpus.slice(skip, skip + limit);'),
      );
    });

    it('the address-disclosure gate happens BEFORE the page slice', () => {
      expect(at("(l) => l.address?.streetName !== 'Address Undisclosed',")).toBeLessThan(
        at('const pageDtos = corpus.slice(skip, skip + limit);'),
      );
    });

    it('the total is the settled corpus, not arithmetic across three populations', () => {
      // Was `totalCount + annotatedMerged.length - publicListings.length`, which
      // changed as the user paged because a different number of exclusives
      // landed on each page.
      expect(code).not.toContain('annotatedMerged.length - publicListings.length');
      expect(route).toContain('const totalCount = corpus.length;');
    });

    it('a truncated candidate read declares itself instead of implying the inventory ended', () => {
      expect(route).toContain('const candidatesTruncated = !!result.hasMore;');
      expect(route).toContain("countMeaning: candidatesTruncated ? 'lower_bound' : 'exact'");
      expect(route).toContain('totalPages: candidatesTruncated ? null');
    });

    it('the arbitrary post-filter headroom multiple is gone', () => {
      // `(limit + skip) * (hasPostFilter ? 4 : 1.2)` was a guess at how much
      // headroom the Mallan-side filters needed, and a guess cannot prove it
      // read far enough. Adding one more criterion to it would not have fixed it.
      expect(code).not.toContain('hasPostFilter');
      expect(route).toContain('PUBLIC_TRESTLE_CANDIDATE_BUDGET');
    });
  });
});

describe('the walk builds only what membership reads', () => {
  const route = readFileSync(
    resolve(__dirname, '..', '..', 'app/api/listings/route.ts'),
    'utf8',
  );
  const helper = readFileSync(
    resolve(__dirname, '..', '..', 'lib/search/public-listing-db.ts'),
    'utf8',
  );

  it('the corpus-filter trigger list matches EXACTLY what the filter helper reads', () => {
    // THE DANGEROUS COUPLING. The walk skips building the five DTO-derived
    // filter fields when no corpus filter was requested — nine seconds of work
    // on a 7,125-row universe. That is only safe while the route's trigger list
    // and the fields applyPublicListingPostFilters actually reads are the same
    // set. Add a filter to the helper and forget the list, and the criterion
    // silently reads null for every row: a WIDER result set, HTTP 200, nothing
    // on the page saying so.
    const helperBody = helper.slice(helper.indexOf('export function applyPublicListingPostFilters'));
    const readByHelper = new Set(
      [...helperBody.matchAll(/params\.get\("([A-Za-z]+)"\)/g)].map((m) => m[1]),
    );
    const triggerLine = route.slice(
      route.indexOf('const corpusFiltersActive ='),
      route.indexOf('const mallanAuthoredInBand'),
    );
    const triggers = new Set(
      [...triggerLine.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]),
    );
    // Guard the guard: if either parse found nothing, every assertion below is
    // vacuous and this file is decoration.
    expect(readByHelper.size).toBeGreaterThan(0);
    expect(triggers.size).toBeGreaterThan(0);
    const missing = [...readByHelper].filter((k) => !triggers.has(k));
    expect(missing).toEqual([]);
  });

  it('openHouse is a trigger too, since it is a membership criterion', () => {
    expect(route).toContain('!!openHouseParam ||');
  });

  it('the walk reads the membership projection, never the card projection', () => {
    // The heavy members — features/remarks, the media JSON blob and the
    // listing_media relation join — cost ~1.3ms per row of read and transfer.
    // Across a 7,125-row universe that WAS the eleven seconds.
    expect(route).toContain('select: MEMBERSHIP_LISTING_SELECT');
    const membership = route.slice(
      route.indexOf('const MEMBERSHIP_LISTING_SELECT'),
      route.indexOf('} satisfies Prisma.ListingSelect;', route.indexOf('const MEMBERSHIP_LISTING_SELECT')),
    );
    expect(membership.length).toBeGreaterThan(0);
    for (const heavy of ['media', 'listing_media', 'features', '_count']) {
      expect(membership).not.toContain(`${heavy}:`);
    }
    // …and it must still carry everything membership DOES read.
    for (const needed of [
      'listing_id', 'status', 'rls_eligible', 'idx_display_yn',
      'internet_entire_listing_display_yn', 'owner_opt_out', 'participant_only',
      'address', 'modification_timestamp',
    ]) {
      expect(membership).toContain(`${needed}:`);
    }
  });

  it('the page is hydrated with the CARD projection, and keeps the settled order', () => {
    // The walk candidate deliberately lacks media, so building cards from it
    // would render a page of photoless listings. The page is re-read with the
    // full select — and reordered from the settled page rather than from the
    // database, because membership decided that order and the count describes it.
    expect(route).toContain('where: { listing_id: { in: pageListingIds } }');
    expect(route).toContain('select: PAGE_LISTING_SELECT');
    expect(route).toContain('.map((id) => byListingId.get(id))');
    expect(route).toContain('dbListingToPublicDTO(l, { hadFeedRelationalRows:');
  });

  it('the dedupe address mapping is the shared authority, not a second copy', () => {
    expect(route).toContain('dedupeAddressFromDbRow(l)');
    const dedupe = readFileSync(
      resolve(__dirname, '..', '..', 'lib/listings/dedupe-crm-vs-idx.ts'),
      'utf8',
    );
    // buildAddressKeyFromDbRow must go THROUGH the shared mapping, so the two
    // can never drift apart on what a physical unit is.
    expect(dedupe).toContain('return buildAddressKey(dedupeAddressFromDbRow(row));');
  });
});

describe('a Mallan return-copy cannot reappear under a different query form', () => {
  const suggest = readFileSync(
    resolve(__dirname, '..', '..', 'app/api/listings/suggest/route.ts'),
    'utf8',
  );

  it('BOTH suggest branches carry the suppression, not just the address one', () => {
    // The address branch dropped Mallan return-copies; the listing-ID branch
    // did not. The same listing was therefore suppressed when a broker typed
    // the street and suggested when they typed its RLS key. One invariant, two
    // query forms, and only one of them enforced it.
    expect(suggest).toContain('const idReturnCopyClause = trestleExcludeMallanReturnCopiesClause();');
    expect(suggest).toContain('const addrReturnCopyClause = trestleExcludeMallanReturnCopiesClause();');
  });

  it('the suppression is in the PROVIDER filter, so it lands before the row cap', () => {
    // Applied only after `top: 20`, every suppressed row consumed one of the
    // twenty candidates and the list could come back short while eligible
    // matches existed further down.
    const idIdx = suggest.indexOf('idReturnCopyClause ?');
    const addrIdx = suggest.indexOf('addrReturnCopyClause ?');
    expect(idIdx).toBeGreaterThan(-1);
    expect(addrIdx).toBeGreaterThan(-1);
    // Each appears inside its own fetchFromTrestle filter argument.
    expect(suggest.slice(idIdx, idIdx + 200)).toContain('idFilter');
    expect(suggest.slice(addrIdx, addrIdx + 200)).toContain('addrFilter');
  });

  it('the ID branch still fails closed in JS when no office id is configured', () => {
    // The OData clause is omitted entirely when the office list is empty, so
    // the row-level check has to remain as the backstop.
    const branch = suggest.slice(
      suggest.indexOf('const idReturnCopyClause'),
      suggest.indexOf('const streetNumber'),
    );
    expect(branch).toContain('isMallanRlsReturnCopy(');
  });
});

describe('the public DB search inherits the WHOLE canonical gate', () => {
  it('the suppression it must inherit is not vacuous — guard the guard', () => {
    // If MALLAN_LIST_OFFICE_MLS_IDS were empty the clause below would exclude
    // nothing and every assertion in this describe would pass while proving
    // nothing at all. Establish the premise before relying on it.
    expect(MALLAN_LIST_OFFICE_MLS_IDS.length).toBeGreaterThan(0);
    expect(officeConstraints(buildSearchDisplayWhere()).length).toBeGreaterThan(0);
  });

  it('carries the Mallan RLS return-copy suppression into the public where', () => {
    // THE DEFECT. `buildPublicListingDbSearch` read `buildSearchDisplayWhere().status`
    // — one key off a gate whose own comment says "One owner, so no emitter can
    // forget it". Taking `.status` and nothing else silently dropped
    // `AND: [excludeMallanRlsReturnCopies()]`, so a Cotality return-copy of a
    // Mallan listing (office 7041, rls_eligible true, RLS* id) passed the public
    // gate and could surface beside its own canonical SL-/RL- row.
    //
    // Asserted on the SHAPE rather than on a snapshot: the suppression may be
    // restructured, but it may never disappear.
    const where = buildPublicListingDbSearch(new URLSearchParams()).where;
    expect(officeConstraints(where).length).toBeGreaterThan(0);
  });

  it('keeps the suppression under every criteria combination', () => {
    // A later `appendAnd` must not be able to overwrite the gate. Each of these
    // writes into `where` — including ones that write `AND` directly.
    const cases: string[] = [
      '',
      'type=sale',
      'type=rent&beds=2',
      'commercial=true',
      'exclusive=mallan',
      'minPrice=100000&maxPrice=900000',
      'statuses=Active,ComingSoon',
      'address=100+East+90th',
      'ownershipTypes=condo&yearBuilt=pre-war',
    ];
    const missing = cases.filter(
      (qs) => officeConstraints(buildPublicListingDbSearch(new URLSearchParams(qs)).where).length === 0,
    );
    expect(missing).toEqual([]);
  });

  it('still admits third-party and Mallan-authored rows — it is a suppression, not a blanket', () => {
    // The clause must stay a disjunction that KEEPS: Mallan-authored local rows
    // (SL-/RL-/website-only) and every third-party office, including rows whose
    // provenance is unknown. A suppression that also removed those would be a
    // different defect wearing the same fix.
    const json = JSON.stringify(buildPublicListingDbSearch(new URLSearchParams()).where);
    expect(json).toContain('SL-');
    expect(json).toContain('RL-');
    expect(json).toContain('"list_office_mls_id":null');
    expect(json).toContain('notIn');
  });
});
