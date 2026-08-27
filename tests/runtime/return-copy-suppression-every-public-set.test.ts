/// <reference types="jest" />
/**
 * MALLAN'S OWN LISTING MUST NOT BE COUNTED TWICE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A RETURN-COPY EXISTS
 *
 * Mallan enters its listing into RealPlus, RealPlus submits it to REBNY RLS, and
 * the listing comes back to Mallan through Cotality as an `RLS*` row carrying
 * `ListOfficeMlsId '7041'` — "MAllan Real Estate Inc", verified live 2026-06-23.
 * That round trip happens outside this system. So one property exists as TWO
 * rows in `listings`: the local `SL-`/`RL-` row, which is canonical, and the
 * returned Cotality copy, which is retained for audit and must never surface as
 * a second public listing.
 *
 * `excludeMallanRlsReturnCopies()` is the Prisma fragment that does this. Its
 * own docstring is explicit about WHERE it has to be applied:
 *
 *   "Applied INSIDE the public access query so suppression happens BEFORE
 *    `count`, `skip` and `take`. Filtering after pagination is page-local: a
 *    local row on one page and its twin on another would let the twin surface,
 *    and `total` / `hasMore` would describe the pre-suppression population."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * The suppression lives inside `buildSearchDisplayWhere`. But the module also
 * exports `SEARCH_DISPLAY_GATE` — the four gate columns ALONE, with neither the
 * status allow-list nor the suppression — and seven surfaces spread that partial
 * gate directly. Each of them then has to remember, by hand, to re-add the two
 * missing halves.
 *
 * Exactly one of the seven remembered. app/api/listings/similar/route.ts adds
 * `AND: [excludeMallanRlsReturnCopies()]` inline and leaves a comment saying it
 * does so BECAUSE it spreads the gate directly rather than calling the builder.
 * The requirement was understood. It was then missed in four client-facing
 * places:
 *
 *   lib/cma/engine.ts                    — the comparative market analysis a
 *                                          broker hands a seller
 *   lib/market-pulse/snapshot.ts         — neighborhood inventory and medians
 *   lib/buyer-intent/recommender.ts      — buyer portal recommendations
 *   app/api/portal/comparables/route.ts  — comps shown in the client portal
 *
 * In every one of those, a Mallan listing that has round-tripped through RLS
 * appears twice: once as `SL-…`/`RL-…` and once as the `7041` copy. Doubled
 * inventory counts, skewed medians, the same property listed twice as its own
 * comparable, and the same home recommended twice to one buyer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND THE MAIN PUBLIC SEARCH
 *
 * `buildPublicListingDbSearch` (lib/search/public-listing-db.ts) — the where
 * behind `/api/listings`, used for BOTH `findMany` and `count` — takes only
 * `buildSearchDisplayWhere().status`, discarding the gates and the suppression,
 * and puts `SEARCH_DISPLAY_GATE` inside one branch of an OR. Suppression is
 * attempted afterwards by `preferCrmExclusiveOverIdxDuplicate`, a JS dedupe that
 * runs at app/api/listings/route.ts:466 — AFTER skip/take. That is the
 * page-local failure the docstring describes: same-page twins collapse, twins
 * split across pages do not, and `total` counts both.
 */
import type { Prisma } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  buildSearchDisplayWhere,
  publicListingVisibilityWhere,
  SEARCH_DISPLAY_GATE,
} from '@/lib/search/listing-access-decision';
import { buildPublicListingDbSearch } from '@/lib/search/public-listing-db';
import { isMallanRlsReturnCopy } from '@/lib/listings/mallan-source-identity';

const REPO = resolve(__dirname, '../..');

/** Mallan's own listing, returned to us through Cotality. */
const RETURN_COPY = {
  listing_id: 'RLS12345678',
  list_office_mls_id: '7041',
  rls_eligible: true,
};

/** The canonical local row for the same property. */
const LOCAL_ROW = {
  listing_id: 'SL-0004',
  list_office_mls_id: null,
  rls_eligible: false,
};

/** A normal third-party listing. */
const THIRD_PARTY = {
  listing_id: 'RLS99999999',
  list_office_mls_id: '1234',
  rls_eligible: true,
};

/**
 * Does this where-fragment carry the suppression? Rather than string-matching
 * the source, evaluate the actual Prisma fragment against the three row shapes
 * the classifier distinguishes.
 */
function suppressesReturnCopies(where: Prisma.ListingWhereInput): boolean {
  const ands = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
  for (const clause of ands) {
    const or = (clause as { OR?: Array<Record<string, unknown>> })?.OR;
    if (!Array.isArray(or)) continue;
    const admits = (row: typeof RETURN_COPY | typeof LOCAL_ROW) =>
      or.some((branch) => {
        if ('rls_eligible' in branch) return branch.rls_eligible === row.rls_eligible;
        if ('list_office_mls_id' in branch) {
          const pred = branch.list_office_mls_id as
            | null
            | { notIn?: readonly string[] };
          if (pred === null) return row.list_office_mls_id === null;
          if (pred?.notIn) {
            return (
              row.list_office_mls_id !== null &&
              !pred.notIn.includes(row.list_office_mls_id)
            );
          }
        }
        if ('listing_id' in branch) {
          const pred = branch.listing_id as { startsWith?: string };
          return !!pred?.startsWith && row.listing_id.startsWith(pred.startsWith);
        }
        return false;
      });
    if (!admits(RETURN_COPY) && admits(LOCAL_ROW)) return true;
  }
  return false;
}

describe('the classifier itself agrees with the fixtures', () => {
  it('the return copy is one, the local row and third party are not', () => {
    // Guard the guard: if these drift, every assertion below is meaningless.
    expect(isMallanRlsReturnCopy(RETURN_COPY)).toBe(true);
    expect(isMallanRlsReturnCopy(LOCAL_ROW)).toBe(false);
    expect(isMallanRlsReturnCopy(THIRD_PARTY)).toBe(false);
  });

  it('the detector reads the canonical builder correctly', () => {
    expect(suppressesReturnCopies(buildSearchDisplayWhere())).toBe(true);
    expect(suppressesReturnCopies({ ...SEARCH_DISPLAY_GATE })).toBe(false);
  });
});

describe('there is ONE visibility layer, and it always suppresses', () => {
  it('publicListingVisibilityWhere carries the gates AND the suppression', () => {
    const where = publicListingVisibilityWhere();
    expect(where.idx_display_yn).toBe(true);
    expect(where.owner_opt_out).toBe(false);
    expect(where.participant_only).toBe(false);
    expect(where.internet_entire_listing_display_yn).toBe(true);
    expect(suppressesReturnCopies(where)).toBe(true);
  });

  it('it does NOT impose a status — that stays the caller\'s decision', () => {
    // A CMA needs closed comps; market-pulse needs a period. Bundling a status
    // here is what would push callers back onto the raw gate.
    expect(publicListingVisibilityWhere().status).toBeUndefined();
  });

  it('buildSearchDisplayWhere is built on it, not a parallel copy', () => {
    const full = buildSearchDisplayWhere();
    expect(suppressesReturnCopies(full)).toBe(true);
    expect(full.status).toBeDefined();
  });
});

describe('the main public search suppresses BEFORE count and pagination', () => {
  it('buildPublicListingDbSearch carries the suppression', () => {
    // This where feeds both prisma.listing.findMany AND prisma.listing.count in
    // app/api/listings/route.ts, so a twin missed here inflates `total` as well
    // as leaking across pages.
    const { where } = buildPublicListingDbSearch(new URLSearchParams());
    expect(suppressesReturnCopies(where)).toBe(true);
  });
});

describe('no client-facing surface spreads the partial gate bare', () => {
  const SURFACES = [
    'lib/cma/engine.ts',
    'lib/market-pulse/snapshot.ts',
    'lib/buyer-intent/recommender.ts',
    'app/api/portal/comparables/route.ts',
    'app/api/listings/similar/route.ts',
  ];

  it.each(SURFACES)('%s uses the canonical visibility layer', (file) => {
    const src = readFileSync(resolve(REPO, file), 'utf8');
    expect(src).toContain('publicListingVisibilityWhere');
  });

  it.each(SURFACES)('%s no longer spreads SEARCH_DISPLAY_GATE bare', (file) => {
    const src = readFileSync(resolve(REPO, file), 'utf8');
    expect(src).not.toMatch(/\.\.\.SEARCH_DISPLAY_GATE/);
  });
});

describe('a CMA includes Mallan\'s own closed sales', () => {
  it('the comp query matches Sold and Rented, not only Closed', () => {
    // Same conflation as everywhere else: `Closed` is the Cotality word, but the
    // CRM status route writes `Sold` / `Rented` for a Mallan-local listing
    // (Pending → Sold | Rented). A CMA that matches only `Closed` silently omits
    // the brokerage's own closed sales from the document it hands the seller.
    const src = readFileSync(resolve(REPO, 'lib/cma/engine.ts'), 'utf8');
    for (const status of ['Sold', 'Rented']) {
      expect(src).toContain(`'${status}'`);
    }
  });
});
