/// <reference types="jest" />
/**
 * FAIR HOUSING IS NOT A PROVIDER RULE, AND "WE ARE NOT SYNDICATING IT" IS NOT A DEFENCE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * Both CRM mutation paths skipped the write-time compliance gate for any
 * Mallan-authored listing:
 *
 *     const isCrmCreated = !listing.mls_id;
 *     if (listing.rls_eligible && !isCrmCreated) { assertRlsCompliantPayload(...) }
 *
 * The reasoning — "this listing never goes to the provider, so the provider's
 * field rules do not apply" — is CORRECT on its own terms. The problem is that
 * the Fair Housing content scan lives INSIDE that same function
 * (lib/compliance/rls-enforcement.ts), so the skip took the legal check with it.
 *
 * Federal FHA, NY State HRL and NYC HRL bind an advertisement because it is an
 * advertisement. Whether the words reach the public through a provider feed or
 * through mallan.nyc directly changes nothing.
 *
 * Two further gaps compounded it:
 *
 *   - the surviving scan ran ONCE, at create. Never on edit. Never at
 *     publication. Prohibited content added after create was never re-examined.
 *   - `validateListing` on the PATCH path was advisory: its result was stored
 *     and echoed, but no branch read `validation.valid`, so a failing
 *     validation never blocked anything.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE ASSERTS
 *
 * Requirements attach to the AUDIENCE, not to whether a provider is involved,
 * and each level inherits the one below so widening the audience can never drop
 * a rule.
 */
import {
  evaluatePublicationCompliance,
  advertisementText,
  ADVERTISEMENT_TEXT_FIELDS,
  type PublicationComplianceInput,
} from '@/lib/crm/publication-compliance';
import { VISIBILITY_MODES } from '@/lib/crm/publication-state';

/** A clean, fully-compliant sale listing. */
function clean(over: Partial<PublicationComplianceInput> = {}): PublicationComplianceInput {
  return {
    listing_type: 'sale',
    text: { PublicRemarks: 'Sunny two bedroom with river views.' },
    rawData: {},
    addressDisplayable: true,
    brokerAttribution: 'Mallan Real Estate Inc.',
    ...over,
  };
}

/** Text that violates Fair Housing. */
const DISCRIMINATORY = 'Great for a young christian couple, no kids.';

describe('INTERNAL_ONLY does not impose public-advertising rules', () => {
  it('a private draft with no attribution and no address permission passes', () => {
    // Nothing is advertised to anyone. Blocking a private draft on public-ad
    // rules would make the workflow unusable and protects no one.
    const r = evaluatePublicationCompliance(
      clean({ addressDisplayable: null, brokerAttribution: null }),
      'INTERNAL_ONLY',
    );
    expect(r.passed).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('and provider distribution rules do not block it either', () => {
    const r = evaluatePublicationCompliance(clean(), 'INTERNAL_ONLY');
    expect(r.unevaluated).toEqual([]);
  });
});

describe('PRIVATE_CLIENT adds Fair Housing', () => {
  it('discriminatory text is refused', () => {
    // A client reading it is still an audience.
    const r = evaluatePublicationCompliance(
      clean({ text: { PublicRemarks: DISCRIMINATORY } }),
      'PRIVATE_CLIENT',
    );
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'FH-001')).toBe(true);
  });

  it('clean text passes', () => {
    expect(evaluatePublicationCompliance(clean(), 'PRIVATE_CLIENT').passed).toBe(true);
  });

  it('but public-ad rules still do not apply at this level', () => {
    const r = evaluatePublicationCompliance(
      clean({ brokerAttribution: null }),
      'PRIVATE_CLIENT',
    );
    expect(r.passed).toBe(true);
  });
});

describe('PUBLIC_WEB adds the public-advertising rules', () => {
  it('Fair Housing still applies — the rule is inherited, not replaced', () => {
    const r = evaluatePublicationCompliance(
      clean({ text: { PublicRemarks: DISCRIMINATORY } }),
      'PUBLIC_WEB',
    );
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'FH-001')).toBe(true);
  });

  it('missing broker attribution is refused (NY DOS 19 NYCRR 175.25)', () => {
    const r = evaluatePublicationCompliance(clean({ brokerAttribution: null }), 'PUBLIC_WEB');
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'ATTR-001')).toBe(true);
  });

  it('a suppressed address is refused', () => {
    const r = evaluatePublicationCompliance(
      clean({ addressDisplayable: false }),
      'PUBLIC_WEB',
    );
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'ADDR-001')).toBe(true);
  });

  it('an UNKNOWN address permission blocks rather than passing', () => {
    // "We did not check" must never read as "it is allowed".
    const r = evaluatePublicationCompliance(
      clean({ addressDisplayable: null }),
      'PUBLIC_WEB',
    );
    expect(r.passed).toBe(false);
    expect(r.unevaluated.length).toBeGreaterThan(0);
  });

  it('a rental with an indicated fee and no disclosure is refused', () => {
    // FARE Act, NYC LL 119/2024.
    const r = evaluatePublicationCompliance(
      clean({ listing_type: 'rent', rawData: { AdditionalFeeYN: true } }),
      'PUBLIC_WEB',
    );
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'FARE_FEE_DISCLOSURE')).toBe(true);
  });

  it('a rental with the fee disclosed passes', () => {
    const r = evaluatePublicationCompliance(
      clean({
        listing_type: 'rent',
        rawData: { AdditionalFeeYN: true, MoveInCostsAmount: 4500 },
      }),
      'PUBLIC_WEB',
    );
    expect(r.passed).toBe(true);
  });

  it('the FARE rule does not fire on a sale', () => {
    const r = evaluatePublicationCompliance(
      clean({ listing_type: 'sale', rawData: { AdditionalFeeYN: true } }),
      'PUBLIC_WEB',
    );
    expect(r.failures.some((f) => f.code === 'FARE_FEE_DISCLOSURE')).toBe(false);
  });

  it('a fully clean public listing passes', () => {
    expect(evaluatePublicationCompliance(clean(), 'PUBLIC_WEB').passed).toBe(true);
  });
});

describe('DISTRIBUTION_ELIGIBLE cannot pass today, and says why', () => {
  it('is refused even for an otherwise perfect listing', () => {
    // Cotality is the only provider authority; distribution is not activated and
    // there is no live-verified distribution contract to check against. An
    // unevaluated requirement is not a passed one.
    const r = evaluatePublicationCompliance(clean(), 'DISTRIBUTION_ELIGIBLE');
    expect(r.passed).toBe(false);
    expect(r.failures).toEqual([]); // nothing is WRONG with the listing
    expect(r.unevaluated.join(' ')).toMatch(/distribution/i);
  });

  it('and it still inherits every PUBLIC_WEB rule', () => {
    const r = evaluatePublicationCompliance(
      clean({ text: { PublicRemarks: DISCRIMINATORY }, brokerAttribution: null }),
      'DISTRIBUTION_ELIGIBLE',
    );
    expect(r.failures.some((f) => f.code === 'FH-001')).toBe(true);
    expect(r.failures.some((f) => f.code === 'ATTR-001')).toBe(true);
  });
});

describe('the audience levels genuinely inherit', () => {
  it('every rule that applies at a narrower level applies at every wider one', () => {
    // Guard against a future edit that moves a rule into an else-branch.
    const dirty = clean({ text: { PublicRemarks: DISCRIMINATORY } });
    const failsAt = VISIBILITY_MODES.filter(
      (v) => !evaluatePublicationCompliance(dirty, v).passed,
    );
    expect(failsAt).toEqual([
      'PRIVATE_CLIENT',
      'PUBLIC_WEB',
      'DISTRIBUTION_ELIGIBLE',
    ]);
  });
});

describe('the advertisement surface is declared in one place', () => {
  it('every declared text field is scanned', () => {
    // A new remark field must not be able to escape the scan by being added to
    // the product and forgotten here.
    for (const field of ADVERTISEMENT_TEXT_FIELDS) {
      const r = evaluatePublicationCompliance(
        clean({ text: { [field]: DISCRIMINATORY } }),
        'PUBLIC_WEB',
      );
      expect(r.failures.some((f) => f.field === field)).toBe(true);
    }
  });

  it('advertisementText pulls exactly those fields off a saved payload', () => {
    const text = advertisementText({
      PublicRemarks: 'hello',
      SomethingElse: 'ignored',
      PrivateRemarks: 42,
    });
    expect(text.PublicRemarks).toBe('hello');
    expect(text.PrivateRemarks).toBeNull(); // non-string is not text
    expect('SomethingElse' in text).toBe(false);
  });

  it('includes the non-public remark fields on purpose', () => {
    // Fair Housing applies to internal records too, and these are read by other
    // licensees.
    expect(ADVERTISEMENT_TEXT_FIELDS).toContain('PrivateRemarks');
    expect(ADVERTISEMENT_TEXT_FIELDS).toContain('ShowingInstructions');
  });
});
