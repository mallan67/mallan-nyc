/// <reference types="jest" />
/**
 * The reporting validator is a THIN WRAPPER over the canonical contracts (Packet 2 closure, correction round):
 * no rule catalogue of its own, no runtime rls-rules.json, ONE required / conditional evaluator.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { validateListing, validateField, getRequiredFields, NYC_BOROUGHS } from '../rebny-validator';
import { assertRlsCompliantPayload } from '../rls-enforcement';
import { REBNY_UCBA_RULES } from '../rebny-ucba-rules';

const ROOT = join(__dirname, '../../..');
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js|mjs|cjs|json|html)$/.test(name)) out.push(p);
  }
  return out;
}
const codeOnly = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('no second runtime rule catalogue', () => {
  it('rls-rules.json, its loader, the prompt builder and the manual test script are gone', () => {
    for (const f of ['lib/compliance/rls-rules.json', 'lib/compliance/data-loader.ts', 'lib/compliance/prompts.ts', 'lib/compliance/test-validation.ts']) {
      expect({ f, exists: existsSync(join(ROOT, f)) }).toEqual({ f, exists: false });
    }
  });
  it('no runtime file imports the retired catalogue or loader, and no runtime file states an RLS-first authority order', () => {
    const files = ['app', 'lib', 'scripts', 'public/crm', 'compliance', 'prisma'].filter((d) => existsSync(join(ROOT, d))).flatMap((d) => walk(join(ROOT, d)));
    const hits = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      const body = f.endsWith('.json') ? src : codeOnly(src);
      return /rls-rules\.json|compliance\/data-loader'|from '\.\/data-loader'|from '\.\/prompts'|RLS TRUMPS ALL|RLS overrides RESO|REBNY overrides RESO|fieldAuthorityOrder/.test(body) && !/__tests__|\.test\./.test(f);
    }).map((f) => f.slice(ROOT.length + 1));
    expect(hits).toEqual([]);
  });
  it('the wrapper carries no required / conditional catalogue and consumes only the canonical contracts', () => {
    const src = readFileSync(join(ROOT, 'lib/compliance/rebny-validator.ts'), 'utf8');
    expect(src).toMatch(/from '@\/lib\/cotality\/live-contract'/);
    expect(src).toMatch(/from '\.\/rebny-ucba-rules'/);
    expect(src).toMatch(/assertRlsCompliantPayload/);
    expect(codeOnly(src)).not.toMatch(/requirements|lmpAddEdit|matrixFieldName|Conditional:/);
  });
});

describe('required / conditional findings come from the ONE evaluator', () => {
  const payload = { PropertyType: 'Residential', PropertySubType: 'Apartment', CommonInterest: 'Condominium', _mallanStatus: 'Active', ListPrice: 100 };
  const ctx = { listingType: 'sale' as const, rlsEligible: true };
  it('validateListing(payload, ctx) reports exactly the enforcement gate blockers', () => {
    const gate = assertRlsCompliantPayload(payload, ctx);
    const report = validateListing(payload, ctx);
    const reported = report.errors.filter((e) => e.startsWith('[REBNY] '));
    expect(reported).toHaveLength(gate.blockers.length);
    for (const b of gate.blockers) expect(reported).toContain(`[REBNY] ${b.code}${b.field ? ` ${b.field}` : ''}: ${b.message}`);
    expect(report.compliance.rebnyRls).toBe(false);
  });
  it('without a context (the write routes run the gate themselves) the wrapper reports no required-field finding', () => {
    const report = validateListing(payload);
    expect(report.errors.filter((e) => e.startsWith('[REBNY] '))).toEqual([]);
    expect(report.compliance.rebnyRls).toBe(true);
  });
  it('getRequiredFields derives from REBNY_UCBA_RULES only', () => {
    const fields = getRequiredFields('Residential', 'Condominium');
    for (const f of REBNY_UCBA_RULES.requiredFields.agentSubmitted) expect(fields).toContain(f);
    expect(fields).toContain('PercentOfCommonElements'); // CONDO conditional rule
    expect(getRequiredFields('ResidentialLease')).toContain('AvailabilityDate'); // RENTAL-001
  });
});

describe('the unique checks the wrapper keeps', () => {
  it('provider enum values are checked against the live contract', () => {
    const report = validateListing({ PropertySubType: 'SingleFamilyTownhouse', View: ['City', 'Park'] });
    expect(report.errors).toEqual([
      '[Cotality] PropertySubType "SingleFamilyTownhouse" is not a live Cotality PropertySubType member',
      '[Cotality] View "Park" is not a live Cotality View member',
    ]);
    expect(report.compliance.cotalityLiveContract).toBe(false);
    expect(validateField('PropertySubType', 'Townhouse')).toEqual({ valid: true });
    expect(validateField('PropertySubType', 'SingleFamilyTownhouse').valid).toBe(false);
    expect(validateField('PublicRemarks', 'anything')).toEqual({ valid: true });
  });
  it('Fair Housing terms come from the REBNY / UCBA content rules', () => {
    expect(REBNY_UCBA_RULES.contentRules.fairHousingProhibitedTerms).toHaveLength(35);
    const report = validateListing({ PublicRemarks: 'Sunny two-bedroom, perfect for families, near synagogue.' });
    expect(report.errors).toEqual([expect.stringContaining('[Fair Housing] Prohibited terms found in PublicRemarks: "perfect for families", "near synagogue"')]);
    expect(report.compliance.fairHousing).toBe(false);
    expect(report.enhancedData?.PublicRemarks).toBe('Sunny two-bedroom, [REMOVED], [REMOVED].');
  });
  it('NY DOS / NYC facts: TaxLot required, borough ↔ county checked, YearBuilt sanity', () => {
    expect(NYC_BOROUGHS.Manhattan.county).toBe('New York');
    const missing = validateListing({ StateOrProvince: 'NY', CityRegion: 'Manhattan', CountyOrParish: 'Kings', YearBuilt: 1500 });
    expect(missing.errors).toEqual([
      '[NYC] TaxLot is required for NYC properties',
      '[NYC] County mismatch: Manhattan should have county "New York", not "Kings"',
      '[NYC] YearBuilt 1500 is before 1700 - invalid',
    ]);
    expect(missing.compliance.nycDos).toBe(false);
    expect(validateListing({ StateOrProvince: 'NY', CityRegion: 'Brooklyn', CountyOrParish: 'Kings', TaxLot: '12' }).errors).toEqual([]);
  });
  it('date formats are reported as warnings (RESO is vocabulary only)', () => {
    const report = validateListing({ ListingContractDate: '01/15/2026' });
    expect(report.warnings).toEqual(['[Format] ListingContractDate: Should be ISO 8601 date format (YYYY-MM-DD)']);
    expect(report.valid).toBe(true);
  });
});
