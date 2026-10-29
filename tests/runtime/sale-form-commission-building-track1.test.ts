/// <reference types="jest" />
/**
 * Track 1 follow-up — sale-form commission collision + building auto-fill (Cotality-matched).
 *
 * Commission: a single key `saleCommissionType` was used by BOTH the %/$ type
 * <select id> AND the payer <input name> radios, so the collect sweep
 * (key = id||name) let the checked payer radio clobber the %/$ type on every
 * save → the type dropdown reloaded blank. Split into distinct keys; the type
 * uses the live Cotality CompensationType enum (Percent/Dollars).
 *
 * Building: enforce "matches live Cotality $metadata, no phantom marked as a
 * Cotality field" + auto-fill the AssociationFee/Frequency the lookup returns.
 * Verified against the typed fields in data/cotality-enums.live.json (live $metadata):
 *   - ElevatorsTotal  → NOT in Cotality (phantom) → internal-only.
 *   - NewDevelopmentYN → NOT in Cotality (phantom) → internal-only.
 *   - NewConstructionYN, AssociationFee, AssociationFeeFrequency → REAL → kept.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM_PATH = resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const LIVE_PATH = resolve(__dirname, '../../data/cotality-enums.live.json');
const formHtml = readFileSync(FORM_PATH, 'utf8');
const live: { entities: Record<string, Record<string, string>> } = JSON.parse(readFileSync(LIVE_PATH, 'utf8'));

function extractFn(src: string, name: string): string {
  const sig = `function ${name}(`;
  let start = src.indexOf(sig);
  if (start === -1) throw new Error(`function not found: ${name}`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  const braceStart = src.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced braces for ${name}`);
}
const hasCotalityField = (f: string) =>
  Object.values(live.entities).some((e) => Object.prototype.hasOwnProperty.call(e, f));

describe('Cotality authority — phantom vs real (no guessing)', () => {
  it('phantom commission/building fields are NOT in live $metadata', () => {
    expect(hasCotalityField('ElevatorsTotal')).toBe(false);
    expect(hasCotalityField('NewDevelopmentYN')).toBe(false);
  });
  it('the fields we DO map are real Cotality fields', () => {
    ['NewConstructionYN', 'AssociationFee', 'AssociationFeeFrequency',
     'BuyerBrokerageCompensation', 'BuyerBrokerageCompensationType'].forEach((f) =>
      expect(hasCotalityField(f)).toBe(true));
  });
});

describe('Commission collision fix', () => {
  it('the %/$ type select is renamed and uses Cotality CompensationType enum values', () => {
    expect(formHtml).toMatch(/id="saleExclusiveCommissionType"/);
    expect(formHtml).toMatch(/<option value="Percent" selected>%<\/option>/);
    expect(formHtml).toMatch(/<option value="Dollars">\$<\/option>/);
  });
  it('the payer radios are renamed to a distinct key (no collision)', () => {
    expect(formHtml).toMatch(/name="saleBuyerAgentPays" value="OwnerPays"[^>]*checked/);
    expect(formHtml).toMatch(/name="saleBuyerAgentPays" value="BuyerPays"/);
  });
  it('no control uses the old colliding saleCommissionType key anymore', () => {
    expect(formHtml).not.toMatch(/id="saleCommissionType"/);
    expect(formHtml).not.toMatch(/name="saleCommissionType"/);
  });
  it('restore maps both type and payer (payer falls back to legacy saleCommissionType)', () => {
    expect(formHtml).toMatch(/rls:\s*'saleExclusiveCommissionType',\s*form:\s*'saleExclusiveCommissionType'/);
    expect(formHtml).toMatch(/rls:\s*'saleExclusiveCommission',\s*form:\s*'saleExclusiveCommission'/);
    expect(formHtml).toMatch(
      /rls:\s*'saleBuyerAgentPays',\s*name:\s*'saleBuyerAgentPays'[^}]*fallback:\s*'saleCommissionType'/,
    );
  });
});

describe('Building — fields reclassified to match live Cotality', () => {
  it('saleBldgNumElevators is tagged as the live Cotality CustomFields key ElevatorsTotal', () => {
    // ElevatorsTotal is a real key inside CustomProperty.CustomFields (13,094 of 14,000 sale listings, verified live 2026-10-23).
    expect(formHtml).toMatch(/id="saleBldgNumElevators"[^>]*data-concept="ElevatorsTotal"/);
    expect(formHtml).not.toMatch(/id="saleBldgNumElevators"[^>]*data-removed-field="ElevatorsTotal"/);
  });
  it('the phantom "New Development" building box is gone: New Development IS new construction (NewConstructionYN)', () => {
    // Owner rule 2026-10-26: new development = new construction. Building Status (Essentials) carries
    // it as the live field; the building-tab "New Construction" box mirrors it.
    expect(formHtml).not.toMatch(/id="saleBldgNewDevelopment"/);
    expect(formHtml).toMatch(/name="saleBuildingStatus" value="NewDevelopment"[^>]*data-concept="NewConstructionYN"/);
    expect(formHtml).not.toMatch(/name="saleBuildingStatus" value="SponsorUnit"/);
  });
  it('Sponsor Unit is its own Yes/No (REBNY SponsorUnitYN), independent of Building Status, not a building box', () => {
    expect(formHtml).toMatch(/name="saleSponsorUnit" value="No"[^>]*data-concept="SponsorUnitYN"/);
    expect(formHtml).toMatch(/name="saleSponsorUnit" value="Yes"/);
    expect(formHtml).not.toMatch(/id="saleBldgSponsorUnits"/);
  });
  it('collect emits NewConstructionYN from Building Status and SponsorUnitYN from the Yes/No; never the phantom keys', () => {
    const collect = extractFn(formHtml, 'collectSaleFormData');
    // ElevatorsTotal is a live REBNY CustomFields key (2026-10-28): the Building panel sends it
    expect(collect).toMatch(/data\.NewConstructionYN\s*=\s*data\.saleBuildingStatus === 'NewDevelopment'/);
    expect(collect).toMatch(/data\.SponsorUnitYN\s*=\s*data\.saleSponsorUnit === 'Yes'/);
  });
  it('restore keeps the values internal with legacy fallback', () => {
    expect(formHtml).toMatch(/rls:\s*'saleBldgNumElevators',\s*form:\s*'saleBldgNumElevators'[^}]*fallbackRls:\s*'ElevatorsTotal'/);
    expect(formHtml).not.toMatch(/form:\s*'saleBldgNewDevelopment'/);
    // saleBldgNewConstruction stays mapped to the REAL NewConstructionYN; the sponsor Yes/No restores
    // from SponsorUnitYN and the legacy exclusive 'SponsorUnit' Building Status choice
    expect(formHtml).toMatch(/rls:\s*'NewConstructionYN',\s*form:\s*'saleBldgNewConstruction'/);
    expect(formHtml).toMatch(/rls:\s*'SponsorUnitYN',\s*name:\s*'saleSponsorUnit'[^}]*fallback:\s*'SponsorUnitYN'/);
    expect(formHtml).toMatch(/raw\.saleBuildingStatus === 'SponsorUnit'\)\s*setRadio\('saleSponsorUnit', 'Yes'\)/);
  });
});

describe('Building auto-fill — AssociationFee/Frequency from the Cotality lookup', () => {
  type El = { value: string | number };
  function runPopulate(building: Record<string, unknown>, pre: Record<string, El>): Record<string, El> {
    const els: Record<string, El> = pre;
    const document = {
      getElementById: (id: string) => els[id] || null,
      // populateBuildingFromIDX now also reads checkbox groups (docs/pets) via
      // querySelectorAll; this fixture has no groups, so return empty.
      querySelectorAll: () => [] as unknown[],
      createElement: () => ({ value: '', text: '', dataset: {} }),
    };
    const src = extractFn(formHtml, 'populateBuildingFromIDX');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const runner = new Function('document', '_syncSaleBuildingAddressFields', `${src}; return populateBuildingFromIDX;`);
    runner(document, () => {})('sale', building);
    return els;
  }

  it('leaves Maintenance blank for the agent: the building lookup no longer prefills the fee or its frequency', () => {
    // Maintenance / common charges / operating expenses are entered by the agent for the unit (owner rule 2026-10-16); the building association fee is not the unit's.
    const els = runPopulate(
      { association_fee: 1500, association_fee_frequency: 'Quarterly' },
      { saleMaintCC: { value: '' }, saleMaintCCFreq: { value: 'Monthly' } },
    );
    expect(els.saleMaintCC.value).toBe('');
    expect(els.saleMaintCCFreq.value).toBe('Monthly');
  });

  it('does NOT clobber an agent-entered maintenance value (fee+freq left untouched)', () => {
    const els = runPopulate(
      { association_fee: 1500, association_fee_frequency: 'Quarterly' },
      { saleMaintCC: { value: '999' }, saleMaintCCFreq: { value: 'Monthly' } },
    );
    expect(els.saleMaintCC.value).toBe('999');
    expect(els.saleMaintCCFreq.value).toBe('Monthly'); // unchanged — autofill skipped
  });
});
