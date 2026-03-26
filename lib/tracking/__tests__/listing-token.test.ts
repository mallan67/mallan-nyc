import { generateTrackingToken, validateTrackingToken } from '@/lib/tracking/listing-token';

process.env.TRACKING_SECRET = 'test-secret-key-for-unit-tests';

describe('generateTrackingToken', () => {
  it('generates a 16-char base64url token', () => {
    const token = generateTrackingToken(1n, 'SL-001');
    expect(token).toHaveLength(16);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is deterministic — same input = same token', () => {
    const t1 = generateTrackingToken(1n, 'SL-001');
    const t2 = generateTrackingToken(1n, 'SL-001');
    expect(t1).toBe(t2);
  });

  it('produces different tokens for different lead_ids', () => {
    const t1 = generateTrackingToken(1n, 'SL-001');
    const t2 = generateTrackingToken(2n, 'SL-001');
    expect(t1).not.toBe(t2);
  });

  it('produces different tokens for different listing_ids', () => {
    const t1 = generateTrackingToken(1n, 'SL-001');
    const t2 = generateTrackingToken(1n, 'SL-002');
    expect(t1).not.toBe(t2);
  });
});

describe('validateTrackingToken', () => {
  it('returns { leadId, listingId } for a valid token', () => {
    const candidates = [
      { lead_id: 1n, listing_id: 'SL-001' },
      { lead_id: 2n, listing_id: 'SL-001' },
    ];
    const token = generateTrackingToken(1n, 'SL-001');
    const result = validateTrackingToken(token, 'SL-001', candidates);
    expect(result).toEqual({ leadId: 1n, listingId: 'SL-001' });
  });

  it('returns null for invalid token', () => {
    const candidates = [{ lead_id: 1n, listing_id: 'SL-001' }];
    const result = validateTrackingToken('invalid-token!!', 'SL-001', candidates);
    expect(result).toBeNull();
  });

  it('returns null when no candidates match', () => {
    const candidates = [{ lead_id: 99n, listing_id: 'SL-999' }];
    const token = generateTrackingToken(1n, 'SL-001');
    const result = validateTrackingToken(token, 'SL-001', candidates);
    expect(result).toBeNull();
  });
});
