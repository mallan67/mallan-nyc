/**
 * ONE canonical DB public-address decision.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every DB-backed public surface independently decided whether a listing's
 * address could be shown AND, separately, whether it could enter the URL slug.
 * Those two decisions could disagree, producing the worst possible pair:
 *
 *   address DTO suppressed  +  canonical URL containing the street
 *
 * `generateListingSlug` suppresses only on an explicit `=== false`, so a
 * null/undefined flag FALLS THROUGH to an address-based slug — while
 * `isAddressDisplayable()` (DB default) uses `affirmPermission` and FAILS CLOSED
 * on null. Same listing, opposite answers.
 *
 * NULL SEMANTICS ARE SETTLED IN-REPO — lib/compliance/gates.ts:166-171:
 *   "Use `idxPlusPreFiltered: true` ONLY for raw Trestle records on the live
 *    `/api/idx/search` path ... DB-row callers (db-to-public-dto, sitemap,
 *    listing-access-decision) leave the default `false` so any drift ...
 *    still fails-closed defensively."
 *
 * So for DB rows: null/undefined => NOT displayable. No Cotality lookup needed.
 * Raw pre-filtered Trestle records keep their own convention and are NOT
 * governed by this module.
 *
 * THE RULE
 * --------
 *   WEBSITE-ONLY (rls_eligible === false): not RLS inventory — the IDX display
 *     booleans do not bind; Mallan's own first-party policy applies.
 *   RLS-BACKED (rls_eligible !== false), INCLUDING SL-/RL-: entire-listing AND
 *     address must both permit; null/undefined fails closed.
 *
 * A listing-id prefix is provenance, never permission.
 */

import { decideDbPublicAddress } from '../db-address-decision';

const RLS_OK = {
  listing_id: 'RLS20059088',
  rls_eligible: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
};

const decide = (over: Record<string, unknown>) =>
  decideDbPublicAddress({ ...RLS_OK, ...over } as never);

describe('RLS-backed rows honour both IDX gates', () => {
  it('entire=true + address=true -> address displayable', () => {
    const d = decide({});
    expect(d.addressDisplayable).toBe(true);
    expect(d.suppressAddress).toBe(false);
  });

  it('address=false -> suppressed', () => {
    expect(decide({ internet_address_display_yn: false }).suppressAddress).toBe(true);
  });

  it('entire=false (even with address=true) -> suppressed', () => {
    const d = decide({
      internet_entire_listing_display_yn: false,
      internet_address_display_yn: true,
    });
    expect(d.suppressAddress).toBe(true);
  });
});

describe('FAIL CLOSED on missing DB flags (gates.ts DB-row default)', () => {
  for (const missing of [null, undefined]) {
    it(`address=${String(missing)} -> suppressed`, () => {
      expect(decide({ internet_address_display_yn: missing }).suppressAddress).toBe(true);
    });

    it(`entire=${String(missing)} -> suppressed`, () => {
      expect(decide({ internet_entire_listing_display_yn: missing }).suppressAddress).toBe(true);
    });
  }
});

describe('a listing-id prefix is never permission', () => {
  for (const id of ['SL-0007', 'RL-0007']) {
    it(`RLS-backed ${id} with address=false is still suppressed`, () => {
      const d = decide({ listing_id: id, rls_eligible: true, internet_address_display_yn: false });
      expect(d.suppressAddress).toBe(true);
    });

    it(`RLS-backed ${id} with address=null is still suppressed`, () => {
      const d = decide({ listing_id: id, rls_eligible: true, internet_address_display_yn: null });
      expect(d.suppressAddress).toBe(true);
    });

    it(`RLS-backed ${id} with entire=null is still suppressed`, () => {
      const d = decide({
        listing_id: id,
        rls_eligible: true,
        internet_entire_listing_display_yn: null,
      });
      expect(d.suppressAddress).toBe(true);
    });
  }
});

describe('website-only inventory (rls_eligible === false)', () => {
  it('shows its address even with both IDX flags false — not RLS inventory', () => {
    const d = decide({
      listing_id: 'SL-0004',
      rls_eligible: false,
      internet_entire_listing_display_yn: false,
      internet_address_display_yn: false,
    });
    expect(d.addressDisplayable).toBe(true);
    expect(d.suppressAddress).toBe(false);
  });

  it('is unaffected by null IDX flags', () => {
    const d = decide({
      listing_id: 'RL-0004',
      rls_eligible: false,
      internet_entire_listing_display_yn: null,
      internet_address_display_yn: null,
    });
    expect(d.suppressAddress).toBe(false);
  });
});

describe('rls_eligible defaulting', () => {
  it('undefined rls_eligible is treated as RLS-BACKED (only explicit false exempts)', () => {
    const d = decide({
      listing_id: 'SL-0007',
      rls_eligible: undefined,
      internet_address_display_yn: null,
    });
    expect(d.suppressAddress).toBe(true);
  });
});
