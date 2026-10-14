import {
  reconcileMallanPublicReturnCopy,
  type MallanPublicRefreshRow,
} from '@/lib/listings/return-copy-canonical';

const local: MallanPublicRefreshRow = {
  listing_id: 'SL-0004',
  rls_eligible: true,
  address: {
    StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46th',
    StreetSuffix: 'Street', UnitNumber: '2G', PostalCode: '10017',
  },
  modification_timestamp: new Date('2026-08-07T18:58:54Z'),
};
const copy: MallanPublicRefreshRow = {
  listing_id: 'RLS20093870',
  rls_eligible: true,
  list_office_mls_id: '7041',
  status: 'Active', idx_display_yn: true,
  internet_entire_listing_display_yn: true, owner_opt_out: false,
  participant_only: false,
  address: {
    StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46TH',
    StreetSuffix: 'Street', UnitNumber: '2G', PostalCode: '10017',
  },
  modification_timestamp: new Date('2026-10-14T16:29:49Z'),
  raw_data: {
    PublicRemarks: '<p>Five closets, including three in the bedroom.</p><p>Future primary occupancy may be possible by agreement.</p>',
    VirtualTourURLUnbranded: 'https://youtu.be/bawq6mNSd30',
  },
};

describe('Same-unit Mallan RLS return-copy publication', () => {
  it('uses public updated remarks and YouTube video for exactly one verified copy', () => {
    const actual = reconcileMallanPublicReturnCopy(local, [copy]);
    expect(actual).toEqual({
      sourceListingId: 'RLS20093870',
      publicRemarks: 'Five closets, including three in the bedroom.\n\nFuture primary occupancy may be possible by agreement.',
      videoUrl: 'https://youtu.be/bawq6mNSd30',
    });
  });
  it('rejects a different unit, third-party office, display-off and owner opt-out', () => {
    expect(reconcileMallanPublicReturnCopy(local, [{ ...copy, address: { ...copy.address as object, UnitNumber: '5E' } }])).toBeNull();
    expect(reconcileMallanPublicReturnCopy(local, [{ ...copy, list_office_mls_id: '9999' }])).toBeNull();
    expect(reconcileMallanPublicReturnCopy(local, [{ ...copy, internet_entire_listing_display_yn: false }])).toBeNull();
    expect(reconcileMallanPublicReturnCopy(local, [{ ...copy, idx_display_yn: false }])).toBeNull();
    expect(reconcileMallanPublicReturnCopy(local, [{ ...copy, owner_opt_out: true }])).toBeNull();
    expect(reconcileMallanPublicReturnCopy(local, [{ ...copy, participant_only: true }])).toBeNull();
    expect(reconcileMallanPublicReturnCopy(local, [copy, copy])).toBeNull();
  });
  it('never takes older provider remarks over newer Mallan-authored copy', () => {
    const actual = reconcileMallanPublicReturnCopy({
      ...local, modification_timestamp: new Date('2026-10-15T00:00:00Z'),
    }, [copy]);
    expect(actual?.publicRemarks).toBeUndefined();
    expect(actual?.videoUrl).toBe('https://youtu.be/bawq6mNSd30');
  });
  it('does not apply to non-local or website-only listings', () => {
    expect(reconcileMallanPublicReturnCopy({ ...local, listing_id: 'RLS1234' }, [copy])).toBeNull();
    expect(reconcileMallanPublicReturnCopy({ ...local, rls_eligible: false }, [copy])).toBeNull();
  });
  it('does not create provider data when the raw tour and remarks are absent', () => {
    expect(reconcileMallanPublicReturnCopy(local, [{ ...copy, raw_data: {} }])).toBeNull();
  });
});
