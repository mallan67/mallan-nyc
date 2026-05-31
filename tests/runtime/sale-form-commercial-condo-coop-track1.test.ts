/// <reference types="jest" />
/**
 * Sale form — Commercial condo / co-op adaptation. (PR #304, gap B)
 *
 * Proves that a commercial condo / co-op (and commercial condop, whole
 * building) listing:
 *   1. resolves to the correct sale-form SUBTYPE via resolveListingSubtype,
 *   2. shows the appropriate co-op/condo building & board/financial sections
 *      (so the commercial-coop board package, financing, flip-tax fields are
 *      available — not just the residential ones),
 *   3. is forced to WWW-only distribution (IDX / VOW / RLS / syndication
 *      disabled) by applyCommercialDistribution, so NO residential-style
 *      public IDX/RLS distribution is accidentally enabled for commercial.
 *
 * Static-source + Function-eval style (same as building-autofill-mapping.test.ts).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

function sliceFn(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`not found: ${name}`);
  const b = src.indexOf('{', start);
  let d = 0;
  for (let i = b; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced');
}
function sliceConst(src: string, name: string): string {
  const start = src.indexOf(`const ${name}`);
  if (start === -1) throw new Error(`const not found: ${name}`);
  return src.slice(start, src.indexOf('};', start) + 2);
}

// resolveListingSubtype references `document` only in the Office/Retail branch;
// stub it so the Commercial branch (which we exercise) eval-loads cleanly.
const resolveListingSubtype = new Function(
  'var document = { querySelector: function () { return null; } };' +
    sliceFn(FORM, 'resolveListingSubtype') +
    '; return resolveListingSubtype;',
)() as (p: string, c: string | null, b: string) => string;

const SALES_FIELD_VISIBILITY_RULES = new Function(
  sliceConst(FORM, 'SALES_FIELD_VISIBILITY_RULES') + '; return SALES_FIELD_VISIBILITY_RULES;',
)() as Record<string, string[]>;

describe('Commercial condo/co-op — subtype resolution', () => {
  it('Commercial + CommercialCondo → COMMERCIAL_CONDO', () => {
    expect(resolveListingSubtype('Commercial', 'CommercialCondo', 'Resale')).toBe('COMMERCIAL_CONDO');
  });
  it('Commercial + CommercialCoop → COMMERCIAL_COOP', () => {
    expect(resolveListingSubtype('Commercial', 'CommercialCoop', 'Resale')).toBe('COMMERCIAL_COOP');
  });
  it('Commercial + CommercialCondop → COMMERCIAL_CONDO (condop billed like condo)', () => {
    expect(resolveListingSubtype('Commercial', 'CommercialCondop', 'Resale')).toBe('COMMERCIAL_CONDO');
  });
  it('Commercial + WholeBuilding → COMMERCIAL_BUILDING', () => {
    expect(resolveListingSubtype('Commercial', 'WholeBuilding', 'Resale')).toBe('COMMERCIAL_BUILDING');
  });
});

describe('Commercial condo/co-op — correct building/profile sections are available', () => {
  it('commercial co-op shows the co-op/condop section (board, financing)', () => {
    expect(SALES_FIELD_VISIBILITY_RULES.saleCoopCondopSection).toContain('COMMERCIAL_COOP');
    expect(SALES_FIELD_VISIBILITY_RULES.saleBoardApprovalField).toContain('COMMERCIAL_COOP');
    expect(SALES_FIELD_VISIBILITY_RULES.saleBoardInterviewField).toContain('COMMERCIAL_COOP');
  });
  it('commercial condo shows the condo-only section + right of first refusal', () => {
    expect(SALES_FIELD_VISIBILITY_RULES.saleCondoOnlySection).toContain('COMMERCIAL_CONDO');
    expect(SALES_FIELD_VISIBILITY_RULES.saleFirstRefusalField).toContain('COMMERCIAL_CONDO');
  });
  it('both commercial condo and co-op expose maintenance/CC, flip-tax, and board application', () => {
    for (const field of ['saleMaintCCField', 'saleFlipTaxSection', 'saleBoardApplicationField']) {
      expect(SALES_FIELD_VISIBILITY_RULES[field]).toContain('COMMERCIAL_CONDO');
      expect(SALES_FIELD_VISIBILITY_RULES[field]).toContain('COMMERCIAL_COOP');
    }
  });
  it('commercial co-op is NOT treated as a plain residential-only condo (distinct subtype keys)', () => {
    // COMMERCIAL_COOP must appear in the co-op section, NOT only CONDO sections.
    expect(SALES_FIELD_VISIBILITY_RULES.saleCondoOnlySection).not.toContain('COMMERCIAL_COOP');
  });
});

describe('Commercial — WWW-only distribution (no residential IDX/RLS leak)', () => {
  const applyCommercial = sliceFn(FORM, 'applyCommercialDistribution');

  it('applyCommercialDistribution disables IDX, VOW, RLS and syndication channels', () => {
    for (const ch of ['IDX', 'VOW', 'Syndication', 'RLS', 'Realtor', 'NYMLS']) {
      expect(applyCommercial).toContain(`'${ch}'`);
    }
    // The disabled channels are unchecked + disabled, WWW is the only one checked.
    expect(applyCommercial).toMatch(/el\.checked\s*=\s*false;\s*el\.disabled\s*=\s*true/);
    expect(applyCommercial).toMatch(/www\.checked\s*=\s*true/);
  });

  it('applySalesFieldRules routes Commercial to WWW-only distribution', () => {
    const rules = sliceFn(FORM, 'applySalesFieldRules');
    expect(rules).toMatch(/propertyType\s*===\s*'Commercial'/);
    expect(rules).toMatch(/applyCommercialDistribution\('sale'\)/);
  });

  it('form exposes the Commercial property type + commercial ownership radios', () => {
    expect(FORM).toMatch(/name="salePropertyType"\s+value="Commercial"/);
    expect(FORM).toMatch(/name="saleCommercialOwnership"\s+value="CommercialCondo"/);
    expect(FORM).toMatch(/name="saleCommercialOwnership"\s+value="CommercialCoop"/);
  });
});
