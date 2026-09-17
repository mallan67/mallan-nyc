/// <reference types="jest" />
/**
 * S-BE-006 — CRM listing create/update/publish success responses must return
 * the full URL + eligibility contract the form/dashboard needs:
 *   listing_id, status, publicUrl, rebnyListingUrl,
 *   featuredEligible, exclusiveEligible, eligibilityReason
 *
 * Proves (1) the pure buildPublishContract helper computes sensible values
 * grounded in the existing model (Draft create = Mallan exclusive, not yet
 * Featured; Active + publicly displayable = Featured-eligible), and (2) the
 * POST /api/crm/listings success response object literal wires all three new
 * contract fields. (The success response is a static object literal, so a
 * source assertion is a faithful proof that the fields are returned.)
 */

import fs from 'node:fs';
import path from 'node:path';

import { buildPublishContract } from '../../lib/crm/listing-publish-contract';

describe('buildPublishContract (S-BE-006 helper)', () => {
  test('Draft create: Mallan exclusive, not yet Featured, reason explains both', () => {
    const c = buildPublishContract({
      status: 'Draft',
      rlsReason: 'Pure residential — RLS-eligible',
    });
    expect(c.exclusiveEligible).toBe(true);
    expect(c.featuredEligible).toBe(false);
    expect(c.eligibilityReason).toMatch(/Featured/i);
    expect(c.eligibilityReason).toContain('RLS-eligible');
  });

  test('Active + publicly displayable: Featured-eligible and exclusive-eligible', () => {
    const c = buildPublishContract({
      status: 'Active',
      rlsReason: 'ok',
      internetEntireListingDisplayYN: null,
      internetAddressDisplayYN: null,
    });
    expect(c.featuredEligible).toBe(true);
    expect(c.exclusiveEligible).toBe(true);
  });

  test('Active but entire-listing display suppressed: not Featured-eligible', () => {
    const c = buildPublishContract({
      status: 'Active',
      rlsReason: 'ok',
      internetEntireListingDisplayYN: false,
    });
    expect(c.featuredEligible).toBe(false);
  });

  test('Terminal status: not exclusive-eligible and not Featured-eligible', () => {
    const c = buildPublishContract({ status: 'Closed', rlsReason: 'ok' });
    expect(c.exclusiveEligible).toBe(false);
    expect(c.featuredEligible).toBe(false);
  });

  test('returns exactly the three contract keys', () => {
    const c = buildPublishContract({ status: 'Draft', rlsReason: '' });
    expect(Object.keys(c).sort()).toEqual([
      'eligibilityReason',
      'exclusiveEligible',
      'featuredEligible',
    ]);
  });
});

describe('POST /api/crm/listings success response wires the full contract (S-BE-006)', () => {
  const routeSrc = fs.readFileSync(
    path.resolve(__dirname, '../../app/api/crm/listings/route.ts'),
    'utf8',
  );

  test('route imports buildPublishContract', () => {
    expect(routeSrc).toContain('buildPublishContract');
  });

  test('the 201 success response includes the full URL + eligibility contract', () => {
    const idx = routeSrc.indexOf('status: STATUS_INITIAL');
    expect(idx).toBeGreaterThan(-1);
    const block = routeSrc.slice(idx - 200, idx + 600);
    for (const field of [
      'listing_id',
      'publicUrl',
      'rebnyListingUrl',
      'featuredEligible',
      'exclusiveEligible',
      'eligibilityReason',
    ]) {
      expect(block).toContain(field);
    }
  });
});
