/// <reference types="jest" />
/**
 * Cotality-clean DEFERRED batch (2026-05-30). Authority: live Cotality `$metadata`.
 * A1 — UnparsedAddress (lowercase p) is the live Cotality field; capital-P
 *      `UnParsedAddress` is a legacy alias only.
 * A3 — BathroomsTotal de-mandated: Cotality's field is BathroomsTotalInteger (Int32);
 *      the form computes a half-weighted decimal (Mallan-internal). Count is covered
 *      by mandatory BathroomsFull/BathroomsHalf.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { REBNY_UCBA_RULES } from '@/lib/compliance/rebny-ucba-rules';
import { MALLAN_FORM_CONTRACT } from '@/lib/listings/mallan-form-contract';

const formHtml = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

describe('A1 — UnparsedAddress canonical (lowercase p), legacy fallback', () => {
  it('collect emits canonical lowercase UnparsedAddress (not capital-P)', () => {
    expect(formHtml).toMatch(/data\.UnparsedAddress\s*=\s*data\.saleUnparsedAddress/);
    expect(formHtml).not.toMatch(/data\.UnParsedAddress\s*=\s*data\.saleUnparsedAddress/);
  });
  it('SALE_FIELD_MAP restores UnparsedAddress with legacy UnParsedAddress fallback', () => {
    expect(formHtml).toMatch(
      /rls:\s*'UnparsedAddress',\s*form:\s*'saleUnparsedAddress'[^}]*fallbackRls:\s*'UnParsedAddress'/,
    );
  });
  it('normalizer aliases legacy UnParsedAddress + variants → canonical UnparsedAddress', () => {
    const a = MALLAN_FORM_CONTRACT.aliasToCanonical as Record<string, string>;
    expect(a['UnParsedAddress']).toBe('UnparsedAddress');
    expect(a['unparsedAddress']).toBe('UnparsedAddress');
    expect(a['address']).toBe('UnparsedAddress');
  });
  it('persistenceMap + mandatory list use canonical UnparsedAddress (lowercase p)', () => {
    const pm = MALLAN_FORM_CONTRACT.persistenceMap as Record<string, { address?: boolean }>;
    expect(pm['UnparsedAddress']?.address).toBe(true);
    expect(pm['UnParsedAddress']).toBeUndefined();
    const req = REBNY_UCBA_RULES.requiredFields.agentSubmitted as readonly string[];
    expect(req).toContain('UnparsedAddress');
    expect(req).not.toContain('UnParsedAddress');
  });
});

describe('A3 — BathroomsTotal de-mandated (Cotality field is BathroomsTotalInteger)', () => {
  it('BathroomsTotal is NOT mandatory; BathroomsFull/Half remain mandatory', () => {
    const req = REBNY_UCBA_RULES.requiredFields.agentSubmitted as readonly string[];
    expect(req).not.toContain('BathroomsTotal');
    expect(req).toContain('BathroomsFull');
    expect(req).toContain('BathroomsHalf');
  });
});
