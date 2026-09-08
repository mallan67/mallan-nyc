/**
 * DG-003 ("a sale with Permissions = null cannot set InternetEntireListingDisplayYN = false") must read the Mallan
 * permission decision. Since 2026-09-06 the server form mapping stores the owner-opt-out / participant-only
 * decision under `_mallanPermission` and DELETES the provider-named keys (Permission / Permissions) before the
 * enforcement gate runs — so a gate that reads only the provider names sees "no permission" on every owner-opt-out
 * sale and blocks it. The DOM round-trip proof (crm-form-dom-roundtrip.test.ts) surfaced it on 2026-09-08.
 */
import { assertRlsCompliantPayload } from '../rls-enforcement';

const ctx = { listingType: 'sale' as const, isNewDevelopment: false, currentStatus: 'Draft', rlsEligible: true, mixedUseSmallBuilding: false };
const optOut = {
  PropertyType: 'Residential', PropertySubType: 'Apartment', CommonInterest: 'Condominium', ListPrice: 1250000,
  _mallanPermission: 'OwnerOptOut',
  InternetEntireListingDisplayYN: false, InternetAddressDisplayYN: false, InternetAutomatedValuationDisplayYN: false, InternetConsumerCommentYN: false,
};
const codes = (payload: Record<string, unknown>) => assertRlsCompliantPayload(payload, ctx).blockers.map((b) => b.code);

describe('DG-003 reads the Mallan permission decision', () => {
  it('an owner-opt-out sale (Mallan decision key) may switch the master display flag off', () => {
    expect(codes(optOut)).not.toContain('DG-003');
  });
  it('a participant-only sale likewise', () => {
    expect(codes({ ...optOut, _mallanPermission: 'Private' })).not.toContain('DG-003');
  });
  it('a sale with NO permission decision still cannot switch the master flag off (the rule itself is unchanged)', () => {
    expect(codes({ ...optOut, _mallanPermission: undefined })).toContain('DG-003');
    expect(codes({ ...optOut, _mallanPermission: null })).toContain('DG-003');
  });
  it('a legacy client that still sends the provider-named key is accepted too', () => {
    const { _mallanPermission: _m, ...rest } = optOut;
    expect(codes({ ...rest, Permission: 'OwnerOptOut' })).not.toContain('DG-003');
  });
});
