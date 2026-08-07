/**
 * ONE owner for public broker-attribution policy.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Three independent paths build a public listing view:
 *
 *   A  lib/idx/public-dto.ts            Trestle/IDXListing -> PublicListingDTO
 *   B  lib/idx/db-to-public-dto.ts      DB row             -> PublicListingDTO
 *   C  app/listing/[...slug]/page.tsx   DB row             -> inline DTO
 *
 * A and B fall back to the neutral `REBNY RLS` when the listing office is
 * unknown. C falls back to `'Mallan Real Estate Inc.'` at four separate sites
 * (page.tsx:525, 1868, 1876, 1965).
 *
 * That is a FALSE CLAIM OF BROKERAGE on a public advertising surface:
 *   - NY DOS 19 NYCRR §175.25 — no misleading/false/deceptive claims;
 *     brokerage name must be the actual one.
 *   - REBNY UCBA Art. III §2(C) — attribution must identify the ACTUAL
 *     listing broker, never the displaying broker.
 *
 * `MALLAN_OFFICE_MLS_IDS` is `[]`, so every listing is currently third-party
 * and nothing may fall back to a Mallan attribution.
 *
 * Source-specific EXTRACTION is fine. Source-specific PUBLIC POLICY is not.
 * These helpers are that single policy owner; A, B and C all delegate here.
 */

import {
  NEUTRAL_OFFICE_ATTRIBUTION,
  publicListOfficeName,
  publicAttributionText,
} from '../public-attribution';

const FORBIDDEN = /Mallan Real Estate/i;

describe('publicListOfficeName', () => {
  it('returns the actual brokerage when present', () => {
    expect(publicListOfficeName('Compass')).toBe('Compass');
    expect(publicListOfficeName('Douglas Elliman')).toBe('Douglas Elliman');
  });

  it('falls back to the neutral value — never to Mallan', () => {
    for (const empty of [null, undefined, '', '   ']) {
      const out = publicListOfficeName(empty as string | null | undefined);
      expect(out).toBe(NEUTRAL_OFFICE_ATTRIBUTION);
      expect(out).not.toMatch(FORBIDDEN);
    }
  });

  it('the neutral value is exactly the one A and B already use', () => {
    // Must equal lib/idx/db-to-public-dto.ts:550 and :457.
    expect(NEUTRAL_OFFICE_ATTRIBUTION).toBe('REBNY RLS');
  });

  it('trims whitespace so a blank office cannot render as an empty brokerage', () => {
    expect(publicListOfficeName('  Compass  ')).toBe('Compass');
  });
});

describe('publicAttributionText', () => {
  it('names the ACTUAL listing broker (UCBA Art. III §2(C))', () => {
    expect(publicAttributionText('Compass')).toBe('Listing courtesy of Compass');
  });

  it('matches the existing db-to-public-dto wording exactly', () => {
    // lib/idx/db-to-public-dto.ts:559 — `Listing courtesy of ${officeName}`.
    // Divergent wording would itself be a parity defect.
    expect(publicAttributionText('Compass')).toBe(
      `Listing courtesy of ${publicListOfficeName('Compass')}`,
    );
  });

  it('never attributes an unknown office to Mallan', () => {
    for (const empty of [null, undefined, '', '   ']) {
      const out = publicAttributionText(empty as string | null | undefined);
      expect(out).not.toMatch(FORBIDDEN);
      expect(out).toBe('Listing courtesy of REBNY RLS');
    }
  });
});
