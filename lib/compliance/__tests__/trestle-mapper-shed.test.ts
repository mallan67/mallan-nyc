/**
 * trestle-mapper raw_data slimming (PR 10).
 *
 * Pins the contract that mapTrestleToPrisma slims its raw_data output
 * via slimRawData(). Without this test a future refactor that drops the
 * slim call would silently regrow Listing.raw_data per-row from ~1 KB
 * to ~14 KB and 70 days later we hit the 500 MB Neon free-tier cap.
 *
 * The mapper is the single chokepoint for all Trestle writes
 * (lib/idx/sync.ts, app/api/cron/feed-reconcile) —
 * one test here covers every programmatic write path.
 */
import { mapTrestleToPrisma } from '@/lib/idx/trestle-mapper';
import { RAW_DATA_KEEP_SET } from '@/lib/compliance/raw-data-keep-fields';

/** Build a minimally-valid Trestle Property record + a bunch of unread fields. */
function buildTrestleRow(extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    // Required identifiers
    ListingKey: 'RBNY-TEST-001',
    ListingId: 'RBNY-TEST-001',
    SourceSystemKey: 'RBNY',
    StandardStatus: 'Active',
    MlsStatus: 'Active',
    PropertyType: 'Residential',
    PropertySubType: 'Apartment',
    ListPrice: 1_000_000,
    BedroomsTotal: 1,
    BathroomsFull: 1,
    BathroomsHalf: 0,
    StreetNumber: '100',
    StreetName: 'Main',
    StreetSuffix: 'St',
    City: 'New York',
    StateOrProvince: 'NY',
    PostalCode: '10001',
    UnparsedAddress: '100 Main St, New York NY 10001',
    PublicRemarks: 'Sunny one bedroom.',
    OnMarketDate: '2026-01-01',
    ModificationTimestamp: '2026-01-02T00:00:00Z',
    ListingContractDate: '2026-01-01',
    ListAgentMlsId: 'A-1',
    ListAgentFullName: 'Test Agent',
    ListOfficeName: 'Mallan Real Estate Inc.',
    ListOfficeMlsId: 'O-1',
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    Permissions: 'Public',
    Media: [],
    ...extras,
  };
}

describe('mapTrestleToPrisma — raw_data slimming', () => {
  it('keeps every consumer-required field in raw_data', () => {
    const result = mapTrestleToPrisma(buildTrestleRow());
    const raw = result.raw_data as Record<string, unknown>;
    // Spot-check the fields the public DTO + retention archive read.
    expect(raw.ListingKey).toBe('RBNY-TEST-001');
    expect(raw.PublicRemarks).toBe('Sunny one bedroom.');
    expect(raw.UnparsedAddress).toBe('100 Main St, New York NY 10001');
    expect(raw.OnMarketDate).toBe('2026-01-01');
    expect(raw.ListPrice).toBe(1_000_000);
    expect(raw.ListAgentFullName).toBe('Test Agent');
    expect(raw.ListOfficeName).toBe('Mallan Real Estate Inc.');
  });

  it('drops Trestle fields outside the keep set', () => {
    // These are real Trestle Property fields that no consumer reads —
    // dumping them into raw_data is what causes the 268 MB elephant.
    const noisy = buildTrestleRow({
      AccessibilityFeatures: 'Ramp',
      WaterSource: 'Public',
      SewerSource: 'Public Sewer',
      BuilderName: 'Acme',
      BuilderModel: 'X-100',
      TaxLot: '0042',
      TaxBlock: '12345',
      TaxParcelLetter: 'A',
      CarportYN: false,
      GarageYN: true,
      Roof: 'Asphalt',
      WindowFeatures: 'Double Pane Windows',
    });
    const result = mapTrestleToPrisma(noisy);
    const raw = result.raw_data as Record<string, unknown>;
    for (const key of [
      'AccessibilityFeatures',
      'WaterSource',
      'SewerSource',
      'BuilderName',
      'BuilderModel',
      'TaxLot',
      'TaxBlock',
      'TaxParcelLetter',
      'CarportYN',
      'GarageYN',
      'Roof',
      'WindowFeatures',
    ]) {
      expect(raw[key]).toBeUndefined();
    }
  });

  it('every key in the slimmed raw_data is in the keep set', () => {
    const result = mapTrestleToPrisma(buildTrestleRow({ Junk1: 'a', Junk2: 'b' }));
    const raw = result.raw_data as Record<string, unknown>;
    for (const key of Object.keys(raw)) {
      // RAW_DATA_KEEP_SET is the contract. Anything else is a leak.
      expect(RAW_DATA_KEEP_SET.has(key)).toBe(true);
    }
  });

  it('strips private fields BEFORE slimming (defense in depth)', () => {
    // PrivateRemarks / ShowingInstructions / ListAgentEmail must never
    // hit raw_data even if they happen to be on the keep set.
    const withPrivate = buildTrestleRow({
      PrivateRemarks: 'Lockbox 0420',
      ShowingInstructions: 'Call 24h ahead',
      ListAgentEmail: 'agent@example.com',
      ListAgentDirectPhone: '212-555-0100',
    });
    const result = mapTrestleToPrisma(withPrivate);
    const raw = result.raw_data as Record<string, unknown>;
    expect(raw.PrivateRemarks).toBeUndefined();
    expect(raw.ShowingInstructions).toBeUndefined();
    expect(raw.ListAgentEmail).toBeUndefined();
    expect(raw.ListAgentDirectPhone).toBeUndefined();
  });

  it('produces dramatically smaller raw_data on a typical Trestle row', () => {
    // Simulate a representative Trestle row with the keep-set fields plus
    // ~50 unread fields (real Trestle Property has ~1,457 columns).
    const fat: Record<string, unknown> = buildTrestleRow();
    for (let i = 0; i < 50; i++) {
      fat[`UnusedField${i}`] = 'x'.repeat(64);
    }
    const fatJsonSize = JSON.stringify(fat).length;
    const result = mapTrestleToPrisma(fat);
    const slimJsonSize = JSON.stringify(result.raw_data).length;
    // The slim version must be MUCH smaller than the fat input.
    expect(slimJsonSize).toBeLessThan(fatJsonSize / 2);
  });
});
