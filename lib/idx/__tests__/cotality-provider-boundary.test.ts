/// <reference types="jest" />
/**
 * THE COTALITY PROVIDER BOUNDARY — one standard, no translation, no conflation.
 *
 * The architecture is:
 *
 *   COTALITY RAW CONTRACT -> VERIFIED COTALITY MAPPING -> MALLAN CANONICAL
 *   STORAGE -> MALLAN BUSINESS/COMPLIANCE RULES -> SEARCH / CMA / CRM / REPORTS
 *
 * Nothing sits between the Cotality API and Mallan. Cotality is the provider. REBNY/RLS is a Mallan compliance layer that
 * lives far downstream and can never redefine a Cotality fact.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS REMOVED, AND WHY IT WAS NOT A NAMING PROBLEM
 *
 * `COTALITY_TO_RLS_RENAMES` copied one real Cotality field's value into a DIFFERENT
 * real Cotality field's name, on the premise — stated in its own comment —
 * that the feed sends one name and Mallan normalises it to another.
 *
 * That premise is FALSE. Verified against live Cotality $metadata on 2026-08-23:
 * of its 19 pairs, THIRTEEN had both names declared as separate Cotality
 * fields, one had NEITHER name declared at all
 * (`DuplicateListingIDs` -> `CoExclusiveListingKey`), and five had a source
 * field Cotality does not declare, so they never fired.
 *
 * The two most damaging:
 *
 *   MlsStatus      -> StandardStatus   two DIFFERENT enums, 25 members vs 11.
 *                                      This writes the detailed MLS vocabulary
 *                                      into the standard one — the identical
 *                                      conflation already removed from
 *                                      lib/search/crm-idx-mapper.ts.
 *   SourceSystemKey -> ListingKey      two of the three distinct listing
 *                                      identities the canonical field registry
 *                                      deliberately separates.
 *
 * Plus every `*MlsId` -> `*Key` pair, which Cotality exposes as distinct fields.
 *
 * If Mallan wants a business status derived from the detailed MlsStatus, that is
 * an explicit Mallan business rule AFTER the verified provider mapping — never
 * a pretence that Cotality supplied a different field.
 */
import { mapCotalityToInternal, validateCotalityResponse } from '@/lib/idx/mapping';

/** A raw Cotality Property payload carrying BOTH names of several pairs. */
const rawWithBothNames = () => ({
  ListingId: 'RLS20000001',
  ListingKey: '1183822946',
  SourceSystemKey: 'SSK-DIFFERENT-VALUE',
  StandardStatus: 'Active',
  MlsStatus: 'Leased',
  ListAgentKey: 'AGENT-KEY-1',
  ListAgentMlsId: 'AGENT-MLSID-1',
  ListOfficeKey: 'OFFICE-KEY-1',
  ListOfficeMlsId: 'OFFICE-MLSID-1',
});

/** The same payload with the "source" side only — the case the rename fired on. */
const rawSourceOnly = () => ({
  ListingId: 'RLS20000002',
  SourceSystemKey: 'SSK-ONLY',
  MlsStatus: 'Leased',
  ListAgentMlsId: 'AGENT-MLSID-2',
});

describe('one Cotality field is never copied into another Cotality field', () => {
  it('MlsStatus does not become StandardStatus', () => {
    // The 25-member MLS vocabulary must not be written into the 11-member
    // standard one. `Leased` is an MlsStatus member with no StandardStatus
    // equivalent at all.
    const out = mapCotalityToInternal(rawSourceOnly() as Record<string, unknown>);
    expect(out?.standardStatus).not.toBe('Leased');
  });

  it('SourceSystemKey does not become ListingKey', () => {
    // Observable through record admission: with neither ListingId nor
    // ListingKey present, the rename used to copy SourceSystemKey into
    // ListingKey and the record was admitted under a borrowed identity.
    const out = mapCotalityToInternal({
      SourceSystemKey: 'SSK-ONLY',
      StandardStatus: 'Active',
    } as Record<string, unknown>);
    expect(out).toBeNull();
  });

  it('a payload carrying BOTH names keeps each field its own value', () => {
    const out = mapCotalityToInternal(rawWithBothNames() as Record<string, unknown>);
    expect(out?.listingId).toBe('RLS20000001');
    expect(out?.standardStatus).toBe('Active');
  });

  it('an absent StandardStatus is not defaulted to Active', () => {
    // It also used to fall back to MlsStatus and then to the literal 'Active'.
    const out = mapCotalityToInternal({
      ListingId: 'RLS4',
      MlsStatus: 'Leased',
    } as Record<string, unknown>);
    expect(out?.standardStatus).not.toBe('Active');
    expect(out?.standardStatus).not.toBe('Leased');
  });
});

describe('response validation does not manufacture the fields it validates', () => {
  it('does not satisfy a required field by copying a different field into it', () => {
    // The validator applied the same rename table before checking required
    // fields, so a payload MISSING a required Cotality field could be declared
    // valid because a DIFFERENT field had been copied into its name.
    // `StandardStatus` IS a required Cotality field. A payload carrying only
    // MlsStatus used to pass validation, because the rename copied MlsStatus
    // into StandardStatus before the required-field check ran - the validator
    // manufacturing the very field it was checking for.
    const onlyMlsStatus = {
      ListingId: 'RLS3',
      MlsStatus: 'Leased',
    } as Record<string, unknown>;
    const result = validateCotalityResponse(onlyMlsStatus);
    expect(result.missingFields).toContain('StandardStatus');
    expect(result.valid).toBe(false);
  });
});

describe('the conflation table itself is gone, not renamed', () => {
  it('exports no rename table under any name', async () => {
    const mapping = await import('@/lib/idx/mapping');
    for (const key of Object.keys(mapping)) {
      expect(key).not.toMatch(/RENAMES/i);
      // No export may carry the legacy standard's name. Built from char codes so
      // a repo-wide rename cannot rewrite this assertion into a tautology -
      // which is exactly what happened to it once already.
      const legacyTerm = String.fromCharCode(82, 69, 83, 79);
      expect(key.toUpperCase()).not.toContain(legacyTerm);
    }
  });

  it('exposes the Cotality-named entry point, not a Cotality-named one', async () => {
    const mapping = await import('@/lib/idx/mapping');
    expect(typeof (mapping as Record<string, unknown>).mapCotalityToInternal).toBe('function');
    // The old Cotality-named export must be gone. Built from fragments so a
    // repo-wide rename cannot silently rewrite this assertion into a tautology,
    // which is exactly what happened on the first attempt.
    const legacyExport = 'map' + String.fromCharCode(82, 69, 83, 79) + 'ToInternal';
    expect((mapping as Record<string, unknown>)[legacyExport]).toBeUndefined();
  });
});
