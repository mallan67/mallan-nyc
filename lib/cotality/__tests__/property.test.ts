/// <reference types="jest" />
/**
 * lib/cotality/property.ts — direct tests (2026-10-02 Permission Multi-Enum cutover).
 *
 * Live Cotality facts this file pins (verified via trestle_lookup_field /
 * trestle_validate_field, 2026-10-02):
 *   - Property.Permission is Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission,
 *     a comma-separated Multi-Enum, IsFlags="true".
 *   - Live rows serialize combinations: "IDX,OfficeInactive", "IDX,SyndicateOptOut",
 *     "IDX,SyndicateOptOut,OfficeInactive".
 *   - Property.Permissions (plural) does not exist on live Cotality at all.
 */
import { readCotalityListingPermissions, hasCotalityListingPermission } from '../property';

describe('readCotalityListingPermissions', () => {
  it('splits a single member', () => {
    expect(readCotalityListingPermissions({ Permission: 'Private' })).toEqual(['Private']);
  });

  it('splits a live multi-value combination', () => {
    expect(readCotalityListingPermissions({ Permission: 'IDX,OfficeInactive' })).toEqual([
      'IDX',
      'OfficeInactive',
    ]);
    expect(readCotalityListingPermissions({ Permission: 'IDX,SyndicateOptOut,OfficeInactive' })).toEqual([
      'IDX',
      'SyndicateOptOut',
      'OfficeInactive',
    ]);
  });

  it('trims whitespace around members', () => {
    expect(readCotalityListingPermissions({ Permission: ' IDX , Private ' })).toEqual(['IDX', 'Private']);
  });

  it('returns an empty array for absent/null Permission — never invents a member', () => {
    expect(readCotalityListingPermissions({})).toEqual([]);
    expect(readCotalityListingPermissions({ Permission: null })).toEqual([]);
  });

  it('does NOT read Permissions (plural) — it does not exist on live Property', () => {
    expect(readCotalityListingPermissions({ Permissions: 'Private' })).toEqual([]);
  });
});

describe('hasCotalityListingPermission', () => {
  it('Permission="Private" → Participant Only member present', () => {
    expect(hasCotalityListingPermission({ Permission: 'Private' }, 'Private')).toBe(true);
  });

  it('Permission="IDX,Private" → Participant Only member present (combined row)', () => {
    expect(hasCotalityListingPermission({ Permission: 'IDX,Private' }, 'Private')).toBe(true);
  });

  it('Permission="Private,IDX" → Participant Only member present (order-independent)', () => {
    expect(hasCotalityListingPermission({ Permission: 'Private,IDX' }, 'Private')).toBe(true);
  });

  it('whitespace variants around commas still match', () => {
    expect(hasCotalityListingPermission({ Permission: 'IDX , Private' }, 'Private')).toBe(true);
    expect(hasCotalityListingPermission({ Permission: 'IDX,  Private  ' }, 'Private')).toBe(true);
  });

  it('Permission="IDX" → Participant Only member absent', () => {
    expect(hasCotalityListingPermission({ Permission: 'IDX' }, 'Private')).toBe(false);
  });

  it('Permission="IDX,SyndicateOptOut" → Participant Only member absent (a different live combination)', () => {
    expect(hasCotalityListingPermission({ Permission: 'IDX,SyndicateOptOut' }, 'Private')).toBe(false);
  });

  it('Permission="OfficeInactive" → Participant Only member absent', () => {
    expect(hasCotalityListingPermission({ Permission: 'OfficeInactive' }, 'Private')).toBe(false);
  });

  it('Permission="PrivateSomething" → NOT a match — exact member, never substring', () => {
    expect(hasCotalityListingPermission({ Permission: 'PrivateSomething' }, 'Private')).toBe(false);
  });

  it('missing/null Permission → false, never fabricated true', () => {
    expect(hasCotalityListingPermission({}, 'Private')).toBe(false);
    expect(hasCotalityListingPermission({ Permission: null }, 'Private')).toBe(false);
  });

  it('raw Permissions="Private" (plural, no singular Permission) → NOT accepted as Cotality truth', () => {
    expect(hasCotalityListingPermission({ Permissions: 'Private' }, 'Private')).toBe(false);
  });
});
