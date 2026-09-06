/// <reference types="jest" />
/**
 * Cotality-clean sweep (2026-05-30) — sales form + backend field-map corrections.
 *
 * Authority: live Cotality `$metadata` only. These guards prove the safe batch of
 * the sweep: phantom canonical emits removed, type/enum corrections applied, and
 * phantom fields (no Cotality equivalent) removed from the mandatory list.
 *
 * (Display-pipeline / permission-gate renames — UnparsedAddress, Permission,
 * BathroomsTotalInteger, IDXEntireListingDisplayYN — are intentionally deferred to
 * a focused follow-up because the runtime suite cannot prove display/gate behavior;
 * see the sweep report.)
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { REBNY_UCBA_RULES } from '@/lib/compliance/rebny-ucba-rules';

const formHtml = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

describe('Cotality-clean sweep — phantom canonical emits removed from collect', () => {
  it('collect no longer emits the phantom SyndicateYN (not in live $metadata)', () => {
    expect(formHtml).not.toMatch(/data\.SyndicateYN\s*=/);
  });
  it('collect no longer writes a date into the Cotality ENUM field Possession', () => {
    expect(formHtml).not.toMatch(/data\.Possession\s*=/);
  });
});

describe('Cotality-clean sweep — type/enum corrections', () => {
  it('ActivationDate is normalized to date-only (split on "T") before the canonical write', () => {
    expect(formHtml).toMatch(
      /data\.ActivationDate\s*=\s*_saleActivation\s*\?\s*String\(_saleActivation\)\.split\(['"]T['"]\)\[0\]/,
    );
  });
  it('SyndicateTo collect emits only canonical Cotality members; others go internal', () => {
    expect(formHtml).toMatch(/data\.SyndicateTo\.push\(entry\.cotality\)/);
    expect(formHtml).toMatch(/data\._saleSyndicateInternal\.push\(entry\.target\)/);
  });
  it('SALE_SYNDICATION_MAP: Realtor→Realtorcom, Listhub valid, NYMLS/RLS/RPX/WWW non-Cotality', () => {
    expect(formHtml).toMatch(/target:\s*'Realtor',\s*cotality:\s*'Realtorcom'/);
    expect(formHtml).toMatch(/target:\s*'Listhub',\s*cotality:\s*'Listhub'/);
    expect(formHtml).toMatch(/target:\s*'NYMLS',\s*cotality:\s*null/);
    expect(formHtml).toMatch(/target:\s*'RLS',\s*cotality:\s*null/);
    expect(formHtml).toMatch(/target:\s*'RPX',\s*cotality:\s*null/);
    expect(formHtml).toMatch(/target:\s*'WWW',\s*cotality:\s*null/);
  });
});

describe('Cotality-clean sweep — phantom fields removed from mandatory list', () => {
  const required = REBNY_UCBA_RULES.requiredFields.agentSubmitted as readonly string[];
  it.each(['CoBrokeAgreement', 'AttendanceType', 'BuildingLaundryFeatures', 'BuildingPetsAllowed'])(
    'phantom "%s" (absent from live $metadata) is NOT mandatory',
    (field) => {
      expect(required).not.toContain(field);
    },
  );
  it('live Cotality fields PetsAllowed and TaxLot remain required', () => {
    expect(required).toContain('PetsAllowed');
    expect(required).toContain('TaxLot');
  });
});
