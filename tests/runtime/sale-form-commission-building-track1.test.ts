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
 * Verified against artifacts/metadata.xml (refreshed 2026-05-30):
 *   - ElevatorsTotal  → NOT in Cotality (phantom) → internal-only.
 *   - NewDevelopmentYN → NOT in Cotality (phantom) → internal-only.
 *   - NewConstructionYN, AssociationFee, AssociationFeeFrequency → REAL → kept.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM_PATH = resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const META_PATH = resolve(__dirname, '../../artifacts/metadata.xml');
const formHtml = readFileSync(FORM_PATH, 'utf8');
const metadata = readFileSync(META_PATH, 'utf8');

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
const hasCotalityField = (f: string) => new RegExp(`Property Name="${f}"`).test(metadata);

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

describe('Building — phantom fields reclassified internal (match Cotality)', () => {
  it('saleBldgNumElevators is no longer tagged as Cotality ElevatorsTotal', () => {
    expect(formHtml).toMatch(/id="saleBldgNumElevators"[^>]*data-rls-ignore="true"[^>]*data-removed-field="ElevatorsTotal"/);
    expect(formHtml).not.toMatch(/id="saleBldgNumElevators"[^>]*data-rls-field="ElevatorsTotal"/);
  });
  it('saleBldgNewDevelopment is no longer tagged as Cotality (was duplicating NewConstructionYN)', () => {
    expect(formHtml).toMatch(/id="saleBldgNewDevelopment"[^>]*data-rls-ignore="true"[^>]*data-removed-field="NewDevelopmentYN"/);
    expect(formHtml).not.toMatch(/id="saleBldgNewDevelopment"[^>]*data-rls-field="NewConstructionYN"/);
  });
  it('collect no longer emits the phantom canonical keys; NewConstructionYN (real) still emitted', () => {
    const collect = extractFn(formHtml, 'collectSaleFormData');
    expect(collect).not.toMatch(/data\.NewDevelopmentYN\s*=/);
    expect(collect).not.toMatch(/data\.ElevatorsTotal\s*=/);
    expect(collect).toMatch(/data\.NewConstructionYN\s*=/);
  });
  it('restore keeps the values internal with legacy fallback', () => {
    expect(formHtml).toMatch(/rls:\s*'saleBldgNumElevators',\s*form:\s*'saleBldgNumElevators'[^}]*fallbackRls:\s*'ElevatorsTotal'/);
    expect(formHtml).toMatch(/rls:\s*'saleBldgNewDevelopment',\s*form:\s*'saleBldgNewDevelopment'[^}]*fallbackRls:\s*'NewDevelopmentYN'/);
    // saleBldgNewConstruction stays mapped to the REAL NewConstructionYN
    expect(formHtml).toMatch(/rls:\s*'NewConstructionYN',\s*form:\s*'saleBldgNewConstruction'/);
  });
});

describe('Building auto-fill — AssociationFee/Frequency from the Cotality lookup', () => {
  type El = { value: string | number };
  function runPopulate(building: Record<string, unknown>, pre: Record<string, El>): Record<string, El> {
    const els: Record<string, El> = pre;
    const document = {
      getElementById: (id: string) => els[id] || null,
      createElement: () => ({ value: '', text: '', dataset: {} }),
    };
    const src = extractFn(formHtml, 'populateBuildingFromIDX');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const runner = new Function('document', '_syncSaleBuildingAddressFields', `${src}; return populateBuildingFromIDX;`);
    runner(document, () => {})('sale', building);
    return els;
  }

  it('fills #saleMaintCC / #saleMaintCCFreq from association_fee / association_fee_frequency when empty', () => {
    const els = runPopulate(
      { association_fee: 1500, association_fee_frequency: 'Monthly' },
      { saleMaintCC: { value: '' }, saleMaintCCFreq: { value: '' } },
    );
    expect(els.saleMaintCC.value).toBe(1500);
    expect(els.saleMaintCCFreq.value).toBe('Monthly');
  });

  it('does NOT clobber an agent-entered maintenance value', () => {
    const els = runPopulate(
      { association_fee: 1500, association_fee_frequency: 'Monthly' },
      { saleMaintCC: { value: '999' }, saleMaintCCFreq: { value: 'Quarterly' } },
    );
    expect(els.saleMaintCC.value).toBe('999');
    expect(els.saleMaintCCFreq.value).toBe('Quarterly');
  });
});
