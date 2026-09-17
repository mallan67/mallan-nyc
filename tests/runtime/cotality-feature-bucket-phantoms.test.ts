/// <reference types="jest" />
/**
 * Group 4 (Cotality-clean 2026-05-30) — feature-bucket phantoms.
 *
 * FlipTax / TaxAbatementYN / TaxAbatementComments / SponsorUnitYN are absent from
 * live Cotality `$metadata` (REBNY-internal). Per the "verify display readers before
 * changing the canonical emit" rule, the emit is INTENTIONALLY NOT changed: a live
 * consumer reads `features.SponsorUnitYN` (app/api/buildings/search), so they stay in
 * the features bucket. This test pins: (1) they are NOT mandatory, (2) they remain
 * routed to features (not dropped), (3) the SponsorUnitYN consumer is intact.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { REBNY_UCBA_RULES } from '@/lib/compliance/rebny-ucba-rules';
import { MALLAN_FORM_CONTRACT } from '@/lib/listings/mallan-form-contract';

const buildingsSearch = readFileSync(resolve(__dirname, '../../app/api/buildings/search/route.ts'), 'utf8');

describe('Group 4 — feature-bucket phantoms: internal, non-mandatory, readers preserved', () => {
  const req = REBNY_UCBA_RULES.requiredFields.agentSubmitted as readonly string[];

  it.each(['FlipTax', 'TaxAbatementYN', 'TaxAbatementComments', 'SponsorUnitYN'])(
    'phantom "%s" is NOT in the mandatory list',
    (f) => {
      expect(req).not.toContain(f);
    },
  );

  it('retained in the features bucket (not dropped — consumers read them)', () => {
    const pm = MALLAN_FORM_CONTRACT.persistenceMap as Record<string, { features?: boolean }>;
    for (const f of ['FlipTax', 'TaxAbatementYN', 'TaxAbatementComments', 'SponsorUnitYN']) {
      expect(pm[f]?.features).toBe(true);
    }
  });

  it('regression guard: app/api/buildings/search still reads features.SponsorUnitYN', () => {
    expect(buildingsSearch).toMatch(/SponsorUnitYN\s*===\s*true/);
  });
});
