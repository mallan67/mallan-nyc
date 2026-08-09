/**
 * DETAIL CANONICALIZATION — a direct URL to a Mallan RLS return-copy must not
 * expose a second public canonical listing.
 *
 * Public suppression removes the return-copy from search, sitemap, agent pages,
 * comps, autocomplete and the building manifest. But a DIRECT hit on
 * `/listing/<return-copy-slug>` still rendered it, so the same physical unit was
 * publicly reachable at two URLs — duplicate content, and (worse) the wrong
 * attribution and the wrong editorial copy, since the local row is canonical.
 *
 * THE RULE (CHARTER Section 1A):
 *   exactly one proven local physical-unit twin -> redirect to its canonical URL
 *   zero, or more than one                      -> FAIL CLOSED (404)
 *
 * "Proven" reuses `buildAddressKeyFromDbRow`, the repo's existing physical-unit
 * key, which REQUIRES a UnitNumber and returns null without one. Different units
 * and ambiguous/address-suppressed rows can therefore never be merged.
 */

import { resolveReturnCopyCanonicalTarget } from '@/lib/listings/return-copy-canonical';

const addr = (over: Record<string, unknown> = {}) => ({
  StreetNumber: '333',
  StreetDirPrefix: 'E',
  StreetName: '46th',
  StreetSuffix: 'Street',
  UnitNumber: '2G',
  PostalCode: '10017',
  ...over,
});

/** The Cotality row that came back carrying Mallan's list-side office id. */
const RETURN_COPY = {
  listing_id: 'RLS20093870',
  rls_eligible: true,
  list_office_mls_id: '7041',
  address: addr(),
};

const LOCAL_TWIN = {
  listing_id: 'SL-0004',
  rls_eligible: false,
  list_office_mls_id: null,
  address: addr(),
  slug: '333-east-46th-street-2g',
};

describe('exactly one proven local twin — redirect', () => {
  it('resolves to the local canonical URL', () => {
    const out = resolveReturnCopyCanonicalTarget(RETURN_COPY, [LOCAL_TWIN]);
    expect(out.kind).toBe('redirect');
    if (out.kind !== 'redirect') throw new Error('expected redirect');
    // The repo's canonical form is two-segment `/listing/{slug}/{id}` with a
    // lowercased id — emitted by the shared `buildCanonicalListingPath`, not by
    // a second URL formula in this module.
    expect(out.path).toBe('/listing/333-east-46th-street-2g/sl-0004');
    expect(out.listingId).toBe('SL-0004');
  });

  it('matches across address-spelling variants', () => {
    // "E 46th Street" vs "East 46th St" is the same physical unit; the shared
    // canonicalizer is what makes the twin findable at all.
    const twin = { ...LOCAL_TWIN, address: addr({ StreetDirPrefix: 'East', StreetSuffix: 'St' }) };
    expect(resolveReturnCopyCanonicalTarget(RETURN_COPY, [twin]).kind).toBe('redirect');
  });

  it('ignores third-party rows at the same address', () => {
    const thirdParty = {
      listing_id: 'RLS999',
      rls_eligible: true,
      list_office_mls_id: '9999',
      address: addr(),
      slug: 'other',
    };
    const out = resolveReturnCopyCanonicalTarget(RETURN_COPY, [thirdParty, LOCAL_TWIN]);
    expect(out.kind).toBe('redirect');
    if (out.kind !== 'redirect') throw new Error('expected redirect');
    expect(out.listingId).toBe('SL-0004');
  });
});

describe('FAIL CLOSED — never guess', () => {
  it('no local twin -> not-found', () => {
    const out = resolveReturnCopyCanonicalTarget(RETURN_COPY, []);
    expect(out.kind).toBe('fail-closed');
    if (out.kind !== 'fail-closed') throw new Error('expected fail-closed');
    expect(out.reason).toBe('no-local-twin');
  });

  it('two local twins -> ambiguous, not a coin flip', () => {
    const second = { ...LOCAL_TWIN, listing_id: 'RL-0009', slug: 'other-slug' };
    const out = resolveReturnCopyCanonicalTarget(RETURN_COPY, [LOCAL_TWIN, second]);
    expect(out.kind).toBe('fail-closed');
    if (out.kind !== 'fail-closed') throw new Error('expected fail-closed');
    expect(out.reason).toBe('ambiguous-local-twins');
  });

  it('DIFFERENT UNIT is never merged', () => {
    const otherUnit = { ...LOCAL_TWIN, address: addr({ UnitNumber: '3A' }) };
    const out = resolveReturnCopyCanonicalTarget(RETURN_COPY, [otherUnit]);
    expect(out.kind).toBe('fail-closed');
    if (out.kind !== 'fail-closed') throw new Error('expected fail-closed');
    expect(out.reason).toBe('no-local-twin');
  });

  it('a return-copy with NO unit number can never match anything', () => {
    // buildAddressKeyFromDbRow returns null without a UnitNumber, so identity
    // is unprovable — merging on street alone could send a visitor to a
    // different apartment in the same building.
    const noUnit = { ...RETURN_COPY, address: addr({ UnitNumber: '' }) };
    const out = resolveReturnCopyCanonicalTarget(noUnit, [LOCAL_TWIN]);
    expect(out.kind).toBe('fail-closed');
    if (out.kind !== 'fail-closed') throw new Error('expected fail-closed');
    expect(out.reason).toBe('no-address-key');
  });

  it('a local twin with no unit number is not a match either', () => {
    const twinNoUnit = { ...LOCAL_TWIN, address: addr({ UnitNumber: '' }) };
    expect(resolveReturnCopyCanonicalTarget(RETURN_COPY, [twinNoUnit]).kind).toBe('fail-closed');
  });

  it('a twin with no usable slug fails closed rather than emitting a broken URL', () => {
    const twinNoSlug = { ...LOCAL_TWIN, slug: '' };
    const out = resolveReturnCopyCanonicalTarget(RETURN_COPY, [twinNoSlug]);
    expect(out.kind).toBe('fail-closed');
    if (out.kind !== 'fail-closed') throw new Error('expected fail-closed');
    expect(out.reason).toBe('no-canonical-url');
  });
});

describe('only return-copies are canonicalized', () => {
  it('a third-party row is NOT redirected', () => {
    const thirdParty = { ...RETURN_COPY, list_office_mls_id: '9999' };
    const out = resolveReturnCopyCanonicalTarget(thirdParty, [LOCAL_TWIN]);
    expect(out.kind).toBe('not-applicable');
  });

  it('a local row is NOT redirected to itself', () => {
    const out = resolveReturnCopyCanonicalTarget(LOCAL_TWIN, [LOCAL_TWIN]);
    expect(out.kind).toBe('not-applicable');
  });

  it('unknown provenance is NOT redirected', () => {
    const unknown = { ...RETURN_COPY, list_office_mls_id: null };
    expect(resolveReturnCopyCanonicalTarget(unknown, [LOCAL_TWIN]).kind).toBe('not-applicable');
  });
});
