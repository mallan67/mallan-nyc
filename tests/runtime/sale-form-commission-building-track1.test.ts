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
 * Verified against the live Cotality contract (committed snapshot data/cotality-contract/**; first verified 2026-05-30):
 *   - ElevatorsTotal  → NOT in Cotality (phantom) → internal-only.
 *   - NewDevelopmentYN → NOT in Cotality (phantom) → internal-only.
 *   - NewConstructionYN, AssociationFee, AssociationFeeFrequency → REAL → kept.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { hasContractField } from './cotality-contract-facts';

const FORM_PATH = resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const formHtml = readFileSync(FORM_PATH, 'utf8');

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
const hasCotalityField = (f: string) => hasContractField(f); // the committed live Cotality contract

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
    expect(formHtml).toMatch(/mallan:\s*'saleExclusiveCommissionType',\s*form:\s*'saleExclusiveCommissionType'/);
    expect(formHtml).toMatch(/mallan:\s*'saleExclusiveCommission',\s*form:\s*'saleExclusiveCommission'/);
    expect(formHtml).toMatch(
      /mallan:\s*'saleBuyerAgentPays',\s*name:\s*'saleBuyerAgentPays'[^}]*fallback:\s*'saleCommissionType'/,
    );
  });
});

describe('Building — phantom fields reclassified internal (match Cotality)', () => {
  it('saleBldgNumElevators is no longer tagged as Cotality ElevatorsTotal', () => {
    expect(formHtml).toMatch(/id="saleBldgNumElevators"[^>]*data-mallan-ignore="true"[^>]*data-removed-field="ElevatorsTotal"/);
    expect(formHtml).not.toMatch(/id="saleBldgNumElevators"[^>]*data-cotality-field="ElevatorsTotal"/);
  });
  it('saleBldgNewDevelopment is no longer tagged as Cotality (was duplicating NewConstructionYN)', () => {
    expect(formHtml).toMatch(/id="saleBldgNewDevelopment"[^>]*data-mallan-ignore="true"[^>]*data-removed-field="NewDevelopmentYN"/);
    expect(formHtml).not.toMatch(/id="saleBldgNewDevelopment"[^>]*data-cotality-field="NewConstructionYN"/);
  });
  it('collect emits ElevatorsTotal / NewDevelopmentYN under their DECLARED Mallan-internal names (REBNY-required submission facts, never provider fields); NewConstructionYN (live) still emitted', () => {
    // Packet 2 convergence (2026-09-06): both are REBNY_UCBA_RULES.requiredFields and declared MALLAN_INTERNAL_KEYS;
    // the form collects them under its own keys and emits the canonical Mallan-internal names. They are still not
    // live Cotality fields (asserted above) and the provider mapper never selects them.
    const { MALLAN_INTERNAL_KEYS } = require('@/lib/listings/mallan-form-contract') as { MALLAN_INTERNAL_KEYS: string[] };
    expect(MALLAN_INTERNAL_KEYS).toEqual(expect.arrayContaining(['ElevatorsTotal', 'NewDevelopmentYN']));
    const collect = extractFn(formHtml, 'collectSaleFormData');
    expect(collect).toMatch(/data[.]_mallanNewDevelopmentYN[ ]*=[ ]*data[.]saleBldgNewDevelopment/);
    // Maya ruling 2026-09-09: the old `parseInt(v || '') || null` collapsed an ENTERED 0 to null and
    // destroyed a recorded fact (a building with no elevator). Collection is now zero-safe; the
    // BuildingFeatures projection (Elevators / NoElevators, never FreightElevator) is the server's.
    expect(collect).toMatch(/data[.]_mallanElevatorsTotal[ ]*=[ ]*saleCountOrNull[(]data[.]saleBldgNumElevators/);
    expect(collect).not.toMatch(/data[.]_mallanElevatorsTotal[ ]*=[ ]*parseInt[(][^)]*[)][ ]*[|][|][ ]*null/);
    expect(collect).toMatch(/data[.]NewConstructionYN[ ]*=/);
  });
  it('restore keeps the values internal with legacy fallback', () => {
    expect(formHtml).toMatch(/mallan:\s*'saleBldgNumElevators',\s*form:\s*'saleBldgNumElevators'[^}]*legacyFallback:\s*'ElevatorsTotal'/);
    expect(formHtml).toMatch(/mallan:\s*'saleBldgNewDevelopment',\s*form:\s*'saleBldgNewDevelopment'[^}]*legacyFallback:\s*'NewDevelopmentYN'/);
    // saleBldgNewConstruction stays mapped to the REAL NewConstructionYN
    expect(formHtml).toMatch(/cotality:\s*'NewConstructionYN',\s*form:\s*'saleBldgNewConstruction'/);
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

  it('fills fee AND overrides the Monthly default with the building frequency (Codex #296)', () => {
    // #saleMaintCCFreq starts at its real HTML default "Monthly"; a Quarterly
    // building must override it (the only-when-empty guard used to skip it).
    const els = runPopulate(
      { association_fee: 1500, association_fee_frequency: 'Quarterly' },
      { saleMaintCC: { value: '' }, saleMaintCCFreq: { value: 'Monthly' } },
    );
    expect(els.saleMaintCC.value).toBe(1500);
    expect(els.saleMaintCCFreq.value).toBe('Quarterly');
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
