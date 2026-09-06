/**
 * SERVER-OWNED Mallan form → Cotality vocabulary conversion (Packet 2 closure, rounds 2 + 3).
 *
 * Every provider-vocabulary value the server can write must be a LIVE enum member (dated live pull
 * data/cotality-enums.live.json); unknown form values are refused, never defaulted; the browser's
 * former translated keys are ignored when the Mallan form keys are present.
 *
 * THREE STATUS DOMAINS: the CRM workflow value → the Mallan business status under `_mallanStatus`
 * (+ `_crmWorkflowStatus`). The provider's MlsStatus / StandardStatus / Permission are NEVER written by
 * this layer: Mallan's Draft / Sold / Rented / Cancelled are not live members and a Mallan-authored
 * listing has no provider status. The permission decision travels under `_mallanPermission`.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  applyServerFormMapping,
  canonicalStatusFromForm,
  classifyMallanPropertyType,
  mallanPermissionFromForm,
  MALLAN_FORM_PROPERTY_TYPE_VALUES,
  MALLAN_PERMISSION_VALUES,
  PROVIDER_DECISION_FIELDS,
  WRITABLE_COMMON_INTERESTS,
  WRITABLE_PROPERTY_SUB_TYPES,
  WRITABLE_PROPERTY_TYPES,
} from '../listing-form-mapping';
import { CANONICAL_STATUSES, CRM_WORKFLOW_STATUSES } from '../status-mapping';
import { isCotalityStandardStatus } from '@/lib/cotality/live-contract';

const live = JSON.parse(readFileSync(resolve(__dirname, '../../../data/cotality-enums.live.json'), 'utf8')) as {
  pulled_at: string;
  enums: Record<string, string[]>;
};

/** Every provider-named key a write may carry, with the live enum that governs its value. */
const PROVIDER_ENUM_FIELDS = ['PropertyType', 'PropertySubType', 'CommonInterest', 'StandardStatus', 'MlsStatus', 'Permission'] as const;

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

describe('STATUS ENUM GUARD — every status / permission the write path can emit', () => {
  it('the write path NEVER emits a provider-named status or permission key (for any workflow value, canonical value or legacy provider-named input)', () => {
    const inputs: Record<string, unknown>[] = [];
    for (const w of CRM_WORKFLOW_STATUSES) inputs.push({ saleStatus: w }, { rentalStatus: w }, { _crmWorkflowStatus: w });
    for (const c of CANONICAL_STATUSES) inputs.push({ MlsStatus: c }, { StandardStatus: c }, { status: c }, { _mallanStatus: c });
    inputs.push({ MlsStatus: 'Incomplete' }, { Permission: 'OwnerOptOut' }, { Permissions: 'Private' }, { Permission: 'RLS-Owner-OptOut' }, { _mallanPermission: 'Private' });
    for (const input of inputs) {
      for (const formType of ['sale', 'rent'] as const) {
        const r = applyServerFormMapping(input, formType);
        for (const f of PROVIDER_DECISION_FIELDS) expect(r.body).not.toHaveProperty(f);
        expect(r.body).not.toHaveProperty('status');
      }
    }
  });
  it('every Mallan status the write path can produce is a Mallan canonical status, and Mallan-only values never appear under provider names', () => {
    const emitted = new Set<string>();
    for (const w of CRM_WORKFLOW_STATUSES) {
      const r = applyServerFormMapping({ saleStatus: w }, 'sale');
      expect(r.errors).toEqual([]);
      emitted.add(String(r.body._mallanStatus));
      expect(r.body._crmWorkflowStatus).toBe(w);
    }
    for (const s of emitted) expect(CANONICAL_STATUSES).toContain(s);
    // Mallan-only statuses exist internally (under the Mallan key) …
    expect(emitted).toContain('Sold');
    expect(emitted).toContain('Rented');
    expect(emitted).toContain('Draft');
    // … and are NOT live StandardStatus members — which is exactly why they never sit under a provider name.
    for (const s of ['Draft', 'Sold', 'Rented', 'Cancelled']) expect(isCotalityStandardStatus(s)).toBe(false);
  });
  it('if a provider enum field ever appears in the output, its value is a live member (currently none does)', () => {
    const r = applyServerFormMapping({ saleStatus: 'SoldThruUs', salePropertyType: 'Coop', Permission: 'OwnerOptOut' }, 'sale');
    for (const f of PROVIDER_ENUM_FIELDS) {
      if (!(f in r.body)) continue;
      expect(live.enums[f]).toContain(r.body[f]);
    }
    expect(r.body).toHaveProperty('PropertyType', 'Residential');
    expect(r.body).not.toHaveProperty('StandardStatus');
    expect(r.body).not.toHaveProperty('MlsStatus');
    expect(r.body).not.toHaveProperty('Permission');
  });
  it('the Mallan permission decision values are Mallan values, stored under the Mallan key', () => {
    expect(MALLAN_PERMISSION_VALUES).toEqual(['OwnerOptOut', 'Private']);
    // 'OwnerOptOut' is NOT a live Cotality Permission member — one more reason it never sits under `Permission`
    expect(live.enums.Permission).not.toContain('OwnerOptOut');
    expect(mallanPermissionFromForm('RLS-Owner-OptOut')).toBe('OwnerOptOut');
    expect(mallanPermissionFromForm('RLS-Participant')).toBe('Private');
    expect(mallanPermissionFromForm('Public')).toBeNull();
    expect(mallanPermissionFromForm(null)).toBeNull();
    expect(mallanPermissionFromForm('Whatever')).toBeUndefined();
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

describe('canonicalStatusFromForm (CRM workflow → Mallan business status)', () => {
  it('maps workflow values through the Mallan status map', () => {
    expect(canonicalStatusFromForm('OfferOut')).toBe('ActiveUnderContract');
    expect(canonicalStatusFromForm('ContractSigned')).toBe('Pending');
    expect(canonicalStatusFromForm('SoldThruUs')).toBe('Sold');
    expect(canonicalStatusFromForm('AppOut')).toBe('Pending');
    expect(canonicalStatusFromForm('LeaseSigned')).toBe('Pending');
    expect(canonicalStatusFromForm('RentedThruUs')).toBe('Rented');
  });
  it('accepts an already-canonical Mallan value, the legacy draft marker, and refuses the unknown', () => {
    expect(canonicalStatusFromForm('ActiveUnderContract')).toBe('ActiveUnderContract');
    expect(canonicalStatusFromForm('Rented')).toBe('Rented');
    expect(canonicalStatusFromForm('Incomplete')).toBe('Draft');
    expect(canonicalStatusFromForm('OffMarket')).toBeNull();
    expect(canonicalStatusFromForm('')).toBeNull();
    expect(canonicalStatusFromForm(42)).toBeNull();
  });
});

describe('applyServerFormMapping', () => {
  it('derives Mallan keys + live property vocabulary from the form keys and ignores client-translated provider values', () => {
    const r = applyServerFormMapping({
      saleStatus: 'OfferOut', salePropertyType: 'Coop',
      // what the retired browser mapper used to send — must be ignored, not trusted
      MlsStatus: 'Active', StandardStatus: 'Active', PropertyType: 'Commercial', PropertySubType: 'SingleFamilyTownhouse', CommonInterest: 'Cooperative', Permission: 'OwnerOptOut',
    }, 'sale');
    expect(r.errors).toEqual([]);
    expect(r.body._mallanStatus).toBe('ActiveUnderContract');
    expect(r.body._crmWorkflowStatus).toBe('OfferOut');
    expect(r.body._mallanPermission).toBe('OwnerOptOut');
    expect(r.body.PropertyType).toBe('Residential');
    expect(r.body.PropertySubType).toBe('Apartment');
    expect(r.body.CommonInterest).toBe('StockCooperative');
    for (const f of PROVIDER_DECISION_FIELDS) expect(r.body).not.toHaveProperty(f);
    expect(r.derived).toEqual(['_mallanStatus', '_mallanPermission', 'PropertyType', 'PropertySubType', 'CommonInterest']);
  });
  it('rental form keys drive the rental vocabulary', () => {
    const r = applyServerFormMapping({ rentalStatus: 'AppAccepted', rentalPropertyType: 'RentalBuilding', _mallanPermission: 'Private' }, 'rent');
    expect(r.errors).toEqual([]);
    expect(r.body._mallanStatus).toBe('Pending');
    expect(r.body._mallanPermission).toBe('Private');
    expect(r.body.PropertyType).toBe('ResidentialLease');
    expect(r.body.CommonInterest).toBe('RentalBuilding');
  });
  it('a legacy client that sends the Mallan status under a provider name gets it stored under the Mallan key, and the provider key is dropped', () => {
    const r = applyServerFormMapping({ MlsStatus: 'Active', PropertyType: 'Residential', CommonInterest: 'Condominium' }, 'sale');
    expect(r.errors).toEqual([]);
    expect(r.body._mallanStatus).toBe('Active');
    expect(r.body).not.toHaveProperty('MlsStatus');
    const draft = applyServerFormMapping({ MlsStatus: 'Incomplete' }, 'sale');
    expect(draft.body._mallanStatus).toBe('Draft');
    expect(draft.body).not.toHaveProperty('MlsStatus');
  });
  it('validates client-supplied provider values against the live enums when no form key is present', () => {
    const bad = applyServerFormMapping({ PropertyType: 'Commercial', CommonInterest: 'Cooperative', MlsStatus: 'OffMarket', Permission: 'Whatever' }, 'sale');
    expect(bad.errors.length).toBe(4);
    expect(bad.errors.join(' ')).toMatch(/not a live Cotality PropertyType member/);
    expect(bad.errors.join(' ')).toMatch(/not a live Cotality CommonInterest member/);
    expect(bad.errors.join(' ')).toMatch(/not a Mallan canonical status/);
    expect(bad.errors.join(' ')).toMatch(/not a Mallan permission decision/);
  });
  it('refuses an unknown Mallan form value instead of defaulting', () => {
    const r = applyServerFormMapping({ salePropertyType: 'Castle', saleStatus: 'Whatever' }, 'sale');
    expect(r.errors.length).toBe(2);
    expect(r.body.PropertyType).toBeUndefined();
    expect(r.body._mallanStatus).toBeUndefined();
  });
  it('does not mutate the input', () => {
    const input = { saleStatus: 'Active', salePropertyType: 'Condo' };
    applyServerFormMapping(input, 'sale');
    expect(input).toEqual({ saleStatus: 'Active', salePropertyType: 'Condo' });
  });
});
