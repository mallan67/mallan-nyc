/**
 * SERVER-OWNED Mallan form → Cotality vocabulary conversion (Packet 2 closure).
 *
 * Every provider-vocabulary value the server can write must be a LIVE enum member (dated live
 * pull data/cotality-enums.live.json); unknown form values are refused, never defaulted; the
 * browser's former translated keys are ignored when the Mallan form keys are present.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  applyServerFormMapping,
  canonicalStatusFromForm,
  classifyMallanPropertyType,
  MALLAN_FORM_PROPERTY_TYPE_VALUES,
  WRITABLE_COMMON_INTERESTS,
  WRITABLE_PROPERTY_SUB_TYPES,
  WRITABLE_PROPERTY_TYPES,
} from '../listing-form-mapping';

const live = JSON.parse(readFileSync(resolve(__dirname, '../../../data/cotality-enums.live.json'), 'utf8')) as {
  pulled_at: string;
  enums: Record<string, string[]>;
};

describe('every writable provider value is a live Cotality enum member', () => {
  it('PropertyType', () => {
    const members = new Set(live.enums.PropertyType);
    expect(WRITABLE_PROPERTY_TYPES.filter((v) => !members.has(v))).toEqual([]);
  });
  it('PropertySubType', () => {
    const members = new Set(live.enums.PropertySubType);
    expect(WRITABLE_PROPERTY_SUB_TYPES.filter((v) => !members.has(v))).toEqual([]);
  });
  it('CommonInterest', () => {
    const members = new Set(live.enums.CommonInterest);
    expect(WRITABLE_COMMON_INTERESTS.filter((v) => !members.has(v))).toEqual([]);
  });
  it('the former browser tables wrote non-live members that this module never writes', () => {
    expect(WRITABLE_PROPERTY_TYPES).not.toContain('Commercial');
    expect(WRITABLE_COMMON_INTERESTS).not.toContain('Cooperative');
    expect(WRITABLE_PROPERTY_SUB_TYPES).not.toContain('SingleFamilyTownhouse');
    expect(WRITABLE_PROPERTY_SUB_TYPES).not.toContain('MultiFamilyTownhouse');
  });
  it('every Mallan form value classifies to live members on both form types', () => {
    const pt = new Set(live.enums.PropertyType);
    const st = new Set(live.enums.PropertySubType);
    const ci = new Set(live.enums.CommonInterest);
    for (const formType of ['sale', 'rent'] as const) {
      for (const v of MALLAN_FORM_PROPERTY_TYPE_VALUES) {
        const cls = classifyMallanPropertyType(formType, v, 'Coop');
        expect(cls).not.toBeNull();
        expect(pt.has(cls!.PropertyType)).toBe(true);
        expect(st.has(cls!.PropertySubType)).toBe(true);
        expect(ci.has(cls!.CommonInterest)).toBe(true);
      }
    }
  });
});

describe('classifyMallanPropertyType', () => {
  it('sale Condo / Coop / Condop carry the ownership on CommonInterest', () => {
    expect(classifyMallanPropertyType('sale', 'Condo')).toEqual({ PropertyType: 'Residential', PropertySubType: 'Apartment', CommonInterest: 'Condominium' });
    expect(classifyMallanPropertyType('sale', 'Coop')).toEqual({ PropertyType: 'Residential', PropertySubType: 'Apartment', CommonInterest: 'StockCooperative' });
    expect(classifyMallanPropertyType('sale', 'Condop')!.CommonInterest).toBe('Condop');
  });
  it('rentals use ResidentialLease and RentalBuilding is a live CommonInterest member', () => {
    expect(classifyMallanPropertyType('rent', 'Condo')!.PropertyType).toBe('ResidentialLease');
    expect(classifyMallanPropertyType('rent', 'RentalBuilding')).toEqual({ PropertyType: 'ResidentialLease', PropertySubType: 'Apartment', CommonInterest: 'RentalBuilding' });
  });
  it('commercial maps to the live CommercialSale / CommercialLease members (never "Commercial")', () => {
    expect(classifyMallanPropertyType('sale', 'Commercial')!.PropertyType).toBe('CommercialSale');
    expect(classifyMallanPropertyType('rent', 'Commercial')!.PropertyType).toBe('CommercialLease');
  });
  it('office / retail take CommonInterest from the ownership sub-selector', () => {
    expect(classifyMallanPropertyType('sale', 'Office', 'Condo')!.CommonInterest).toBe('Condominium');
    expect(classifyMallanPropertyType('sale', 'Retail', 'Coop')!.CommonInterest).toBe('StockCooperative');
    expect(classifyMallanPropertyType('sale', 'Office', null)!.CommonInterest).toBe('None');
  });
  it('the townhouse form values map to the single live Townhouse member; Land to Land / UnimprovedLand', () => {
    expect(classifyMallanPropertyType('sale', 'SingleFamilyTownhouse')!.PropertySubType).toBe('Townhouse');
    expect(classifyMallanPropertyType('sale', 'MultiFamilyTownhouse')!.PropertySubType).toBe('Townhouse');
    expect(classifyMallanPropertyType('sale', 'Land')).toEqual({ PropertyType: 'Land', PropertySubType: 'UnimprovedLand', CommonInterest: 'None' });
  });
  it('an unknown form value is refused (null), never defaulted', () => {
    expect(classifyMallanPropertyType('sale', 'Castle')).toBeNull();
    expect(classifyMallanPropertyType('sale', '')).toBeNull();
    expect(classifyMallanPropertyType('sale', undefined)).toBeNull();
  });
});

describe('canonicalStatusFromForm', () => {
  it('maps workflow values through the canonical Mallan status map', () => {
    expect(canonicalStatusFromForm('OfferOut')).toBe('ActiveUnderContract');
    expect(canonicalStatusFromForm('ContractSigned')).toBe('Pending');
    expect(canonicalStatusFromForm('SoldThruUs')).toBe('Sold');
    expect(canonicalStatusFromForm('AppOut')).toBe('Pending');
    expect(canonicalStatusFromForm('LeaseSigned')).toBe('Pending');
    expect(canonicalStatusFromForm('RentedThruUs')).toBe('Rented');
  });
  it('accepts an already-canonical value and refuses the unknown', () => {
    expect(canonicalStatusFromForm('ActiveUnderContract')).toBe('ActiveUnderContract');
    expect(canonicalStatusFromForm('Rented')).toBe('Rented');
    // legacy CRM draft marker
    expect(canonicalStatusFromForm('Incomplete')).toBe('Draft');
    expect(canonicalStatusFromForm('OffMarket')).toBeNull();
    expect(canonicalStatusFromForm('')).toBeNull();
    expect(canonicalStatusFromForm(42)).toBeNull();
  });
});

describe('applyServerFormMapping', () => {
  it('derives the provider vocabulary from the Mallan form keys and ignores client-translated values', () => {
    const r = applyServerFormMapping({
      saleStatus: 'OfferOut', salePropertyType: 'Coop',
      // what the retired browser mapper used to send — must be ignored, not trusted
      MlsStatus: 'Active', PropertyType: 'Commercial', PropertySubType: 'SingleFamilyTownhouse', CommonInterest: 'Cooperative',
    }, 'sale');
    expect(r.errors).toEqual([]);
    expect(r.body.MlsStatus).toBe('ActiveUnderContract');
    expect(r.body.PropertyType).toBe('Residential');
    expect(r.body.PropertySubType).toBe('Apartment');
    expect(r.body.CommonInterest).toBe('StockCooperative');
    expect(r.derived).toEqual(['MlsStatus', 'PropertyType', 'PropertySubType', 'CommonInterest']);
  });
  it('rental form keys drive the rental vocabulary', () => {
    const r = applyServerFormMapping({ rentalStatus: 'AppAccepted', rentalPropertyType: 'RentalBuilding' }, 'rent');
    expect(r.errors).toEqual([]);
    expect(r.body.MlsStatus).toBe('Pending');
    expect(r.body.PropertyType).toBe('ResidentialLease');
    expect(r.body.CommonInterest).toBe('RentalBuilding');
  });
  it('validates client-supplied provider values against the live enums when no form key is present', () => {
    expect(applyServerFormMapping({ MlsStatus: 'Active', PropertyType: 'Residential', CommonInterest: 'Condominium' }, 'sale').errors).toEqual([]);
    const bad = applyServerFormMapping({ PropertyType: 'Commercial', CommonInterest: 'Cooperative', MlsStatus: 'OffMarket' }, 'sale');
    expect(bad.errors.length).toBe(3);
    expect(bad.errors.join(' ')).toMatch(/not a live Cotality PropertyType member/);
    expect(bad.errors.join(' ')).toMatch(/not a live Cotality CommonInterest member/);
    expect(bad.errors.join(' ')).toMatch(/not a Mallan canonical status/);
  });
  it('refuses an unknown Mallan form value instead of defaulting', () => {
    const r = applyServerFormMapping({ salePropertyType: 'Castle', saleStatus: 'Whatever' }, 'sale');
    expect(r.errors.length).toBe(2);
    expect(r.body.PropertyType).toBeUndefined();
    expect(r.body.MlsStatus).toBeUndefined();
  });
  it('does not mutate the input', () => {
    const input = { saleStatus: 'Active', salePropertyType: 'Condo' };
    applyServerFormMapping(input, 'sale');
    expect(input).toEqual({ saleStatus: 'Active', salePropertyType: 'Condo' });
  });
});
