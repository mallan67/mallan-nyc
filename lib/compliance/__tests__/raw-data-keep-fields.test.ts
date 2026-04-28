/**
 * raw_data keep-field set + slimRawData (PR 10).
 *
 * The keep set is the contract between sync writers and DTO readers —
 * a regression here causes silent reader fallback to columns/null on
 * production listings. Tests pin the determinism + a representative
 * cross-section of consumer fields so accidental shrinkage of the set
 * fails CI.
 */
import {
  RAW_DATA_KEEP_FIELDS,
  RAW_DATA_KEEP_SET,
  slimRawData,
  projectShedSavings,
} from '@/lib/compliance/raw-data-keep-fields';

describe('RAW_DATA_KEEP_FIELDS', () => {
  it('contains the fields read by lib/idx/db-to-public-dto.ts', () => {
    // Spot-check the public-DTO consumers — if any of these get dropped,
    // closed/sold listings would lose their close price + DOM display.
    const required = [
      'ActivationDate',
      'OriginalListPrice',
      'PreviousListPrice',
      'ClosePrice',
      'CloseDate',
      'OnMarketDate',
      'LeaseAmount',
      'LeaseAmountFrequency',
      'AvailabilityDate',
      'DaysOnMarket',
      'CumulativeDaysOnMarket',
      'VirtualTourURLBranded',
      'VirtualTourURLUnbranded',
    ];
    for (const f of required) {
      expect(RAW_DATA_KEEP_SET.has(f)).toBe(true);
    }
  });

  it('contains the fields read by app/api/crm/compliance/audit/route.ts', () => {
    const required = ['UnparsedAddress', 'OwnerOptOut', 'Media', 'PublicRemarks'];
    for (const f of required) {
      expect(RAW_DATA_KEEP_SET.has(f)).toBe(true);
    }
  });

  it('contains the fields the retention archive cron writes to listings_archive', () => {
    const required = [
      'ListAgentFullName',
      'ListOfficeName',
      'ClosePrice',
      'CloseDate',
      'OriginalListPrice',
    ];
    for (const f of required) {
      expect(RAW_DATA_KEEP_SET.has(f)).toBe(true);
    }
  });

  it('contains the 6 distribution gate flags + Permissions', () => {
    const required = [
      'Permissions',
      'InternetEntireListingDisplayYN',
      'InternetAddressDisplayYN',
      'InternetAutomatedValuationDisplayYN',
      'InternetConsumerCommentYN',
      'OwnerOptOut',
    ];
    for (const f of required) {
      expect(RAW_DATA_KEEP_SET.has(f)).toBe(true);
    }
  });

  it('does NOT contain fields known to be unread (AVM noise from Trestle)', () => {
    // These are real Trestle Property fields that no consumer reads —
    // they're examples of the bulk being shed.
    const dropped = [
      'AccessibilityFeatures',
      'WaterSource',
      'SewerSource',
      'BuilderName',
      'BuilderModel',
      'TaxLot',
      'TaxBlock',
      'TaxParcelLetter',
      'CarportYN',
      'CarportSpaces',
      'GarageYN',
    ];
    for (const f of dropped) {
      expect(RAW_DATA_KEEP_SET.has(f)).toBe(false);
    }
  });

  it('keep set has no duplicates', () => {
    expect(RAW_DATA_KEEP_FIELDS.length).toBe(RAW_DATA_KEEP_SET.size);
  });
});

describe('slimRawData', () => {
  it('returns null for null/undefined input', () => {
    expect(slimRawData(null)).toBeNull();
    expect(slimRawData(undefined)).toBeNull();
  });

  it('returns an object retaining only keep-set keys', () => {
    const input = {
      ListPrice: 1000000,
      ListingKey: 'RBNY-123',
      AccessibilityFeatures: 'Ramp',          // dropped
      TaxLot: '0042',                         // dropped
      PublicRemarks: 'Sunny one bedroom.',
      InteriorFeatures: 'Hardwood floors',
    };
    const out = slimRawData(input);
    expect(out).not.toBeNull();
    expect(out!.ListPrice).toBe(1000000);
    expect(out!.ListingKey).toBe('RBNY-123');
    expect(out!.PublicRemarks).toBe('Sunny one bedroom.');
    expect(out!.InteriorFeatures).toBe('Hardwood floors');
    expect(out!.AccessibilityFeatures).toBeUndefined();
    expect(out!.TaxLot).toBeUndefined();
  });

  it('does not mutate input', () => {
    const input = { ListPrice: 100, AccessibilityFeatures: 'Ramp' };
    slimRawData(input);
    expect(input.AccessibilityFeatures).toBe('Ramp');
  });

  it('is idempotent — slimRawData(slimRawData(x)) === slimRawData(x)', () => {
    const input = {
      ListPrice: 1000000,
      ListingKey: 'RBNY-123',
      AccessibilityFeatures: 'Ramp',
      Media: [{ MediaURL: 'https://example.com/1.jpg' }],
    };
    const once = slimRawData(input);
    const twice = slimRawData(once);
    expect(twice).toEqual(once);
  });

  it('preserves null + undefined values for kept fields', () => {
    const input = {
      ListPrice: 1000000,
      ClosePrice: null,
      CloseDate: undefined,
    };
    const out = slimRawData(input);
    expect(out!.ListPrice).toBe(1000000);
    expect(out!.ClosePrice).toBeNull();
    expect('CloseDate' in out!).toBe(true);
    expect(out!.CloseDate).toBeUndefined();
  });

  it('preserves complex values (arrays, nested objects) on kept fields', () => {
    const input = {
      Media: [
        { MediaURL: 'https://a.com', Order: 1 },
        { MediaURL: 'https://b.com', Order: 2 },
      ],
      AccessibilityFeatures: 'dropped',
    };
    const out = slimRawData(input);
    expect(out!.Media).toEqual(input.Media);
    expect(out!.AccessibilityFeatures).toBeUndefined();
  });
});

describe('projectShedSavings', () => {
  it('returns zero everything for null input', () => {
    const r = projectShedSavings(null);
    expect(r.keptBytes).toBe(0);
    expect(r.droppedBytes).toBe(0);
    expect(r.droppedFields).toEqual([]);
  });

  it('reports kept vs dropped byte budgets', () => {
    const big = 'x'.repeat(1000);
    const input = {
      ListPrice: 100,                   // kept
      AccessibilityFeatures: big,       // dropped
      TaxLot: big,                      // dropped
      PublicRemarks: 'short',           // kept
    };
    const r = projectShedSavings(input);
    expect(r.droppedBytes).toBeGreaterThan(2000);
    expect(r.droppedFields).toContain('AccessibilityFeatures');
    expect(r.droppedFields).toContain('TaxLot');
    expect(r.droppedFields).not.toContain('ListPrice');
    expect(r.droppedFields).not.toContain('PublicRemarks');
  });
});
