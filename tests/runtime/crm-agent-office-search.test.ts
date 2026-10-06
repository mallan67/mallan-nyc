/// <reference types="jest" />
/**
 * CRM Agent Search: primary and co-list agent/office filters are separate, built only from live Cotality Property fields.
 *
 * Live evidence (2026-10-06, api.cotality.com/trestle/odata through Mallan's own credential):
 *   - Property.ListAgentKey/-MlsId/-FullName equal Member.MemberKey/-MlsId/-FullName; ListOfficeKey/-MlsId/-Name equal
 *     Office.OfficeKey/-MlsId/-Name; CoListAgentKey/CoListOfficeKey resolve to the same Member/Office rows.
 *   - Co-list is independent of the agreement: 210,150 listings carry a co-list agent, only 10,037 are CoExclusiveAgency.
 *   - Co-list agents 1/2/3 are populated on 210,150 / 52,078 / 8,298 listings; co-list offices 1/2 on 209,528 / 51,838.
 *   - Office relation is only same / different / unknown from the two office MLS IDs: Corcoran Group's offices (334, 40076,
 *     40094, ...) are different offices of one firm, so office equality can never stand in for "same company".
 * The filter shapes pinned below were each executed live and accepted (count queries, HTTP 200).
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildAgentOfficeFilterParts,
  buildCrmIdxODataFilter,
  CRM_AGENT_OFFICE_FILTERS,
} from '@/lib/search/crm-idx-filter';
import { SEARCH_SELECT_FIELDS } from '@/app/api/idx/search/route';
import { mapTrestleToCrmListing } from '@/lib/search/crm-idx-mapper';

const ROOT = path.resolve(__dirname, '../..');
const q = (obj: Record<string, string>) => new URLSearchParams(obj);

describe('agent/office filters: one parameter per side, never merged', () => {
  it('primary listing agent: id -> exact ListAgentMlsId; name -> every word in ListAgentFullName', () => {
    expect(buildAgentOfficeFilterParts(q({ listAgent: '39361' }))).toEqual([`ListAgentMlsId eq '39361'`]);
    expect(buildAgentOfficeFilterParts(q({ listAgent: 'maya allan' }))).toEqual([
      `(contains(ListAgentFullName,'maya') and contains(ListAgentFullName,'allan'))`,
    ]);
  });

  it('co-list agent covers all three live co-list slots and nothing on the primary side', () => {
    const [clause] = buildAgentOfficeFilterParts(q({ coListAgent: '39361' }));
    expect(clause).toBe(`(CoListAgentMlsId eq '39361' or CoListAgent2MlsId eq '39361' or CoListAgent3MlsId eq '39361')`);
    expect(clause).not.toMatch(/(^|[^A-Za-z])ListAgentMlsId/);
    const [byName] = buildAgentOfficeFilterParts(q({ coListAgent: 'leda' }));
    expect(byName).toBe(`(contains(CoListAgentFullName,'leda') or contains(CoListAgent2FullName,'leda') or contains(CoListAgent3FullName,'leda'))`);
  });

  it('agent involved anywhere spans the primary agent and every co-list slot', () => {
    const [clause] = buildAgentOfficeFilterParts(q({ anyAgent: '39361' }));
    expect(clause).toBe(
      `(ListAgentMlsId eq '39361' or CoListAgentMlsId eq '39361' or CoListAgent2MlsId eq '39361' or CoListAgent3MlsId eq '39361')`,
    );
  });

  it('primary office and co-list office are separate; co-list covers both live co-list offices', () => {
    expect(buildAgentOfficeFilterParts(q({ listOffice: '7041' }))).toEqual([`ListOfficeMlsId eq '7041'`]);
    expect(buildAgentOfficeFilterParts(q({ listOffice: 'compass' }))).toEqual([`contains(ListOfficeName,'compass')`]);
    expect(buildAgentOfficeFilterParts(q({ coListOffice: '7041' }))).toEqual([`(CoListOfficeMlsId eq '7041' or CoListOffice2MlsId eq '7041')`]);
    expect(buildAgentOfficeFilterParts(q({ coListOffice: 'corcoran' }))).toEqual([
      `(contains(CoListOfficeName,'corcoran') or contains(CoListOffice2Name,'corcoran'))`,
    ]);
  });

  it('each parameter touches only its own side (negative proof)', () => {
    const only = (param: string) => buildAgentOfficeFilterParts(q({ [param]: '39361' })).join(' ');
    expect(only('listAgent')).not.toMatch(/CoList|ListOffice/);
    expect(only('coListAgent')).not.toMatch(/ListOffice|[^o]ListAgent/);
    expect(only('listOffice')).not.toMatch(/CoList|Agent/);
    expect(only('coListOffice')).not.toMatch(/Agent|[^o]ListOffice/);
  });

  it('several tokens are OR-ed, capped at five, and blank input adds no clause', () => {
    expect(buildAgentOfficeFilterParts(q({ listAgent: '39361, 42201' }))).toEqual([`(ListAgentMlsId eq '39361' or ListAgentMlsId eq '42201')`]);
    const many = buildAgentOfficeFilterParts(q({ listAgent: '1,2,3,4,5,6,7' }))[0];
    expect((many.match(/ListAgentMlsId eq/g) || []).length).toBe(5);
    expect(buildAgentOfficeFilterParts(q({ listAgent: '  ,  ', coListOffice: '' }))).toEqual([]);
    expect(buildAgentOfficeFilterParts(q({}))).toEqual([]);
  });

  it('quotes are escaped and cannot break out of the string literal', () => {
    expect(buildAgentOfficeFilterParts(q({ listAgent: "O'Brien" }))).toEqual([`contains(ListAgentFullName,'O''Brien')`]);
    const hostile = buildAgentOfficeFilterParts(q({ coListOffice: "x') or (1 eq 1" }))[0];
    expect(hostile).not.toMatch(/'\) or \(1 eq 1/);
    expect(hostile).toContain("x''");
  });

  it('only digit strings become MLS ID comparisons; mixed text stays a name match', () => {
    expect(buildAgentOfficeFilterParts(q({ listOffice: '7041 realty' }))[0]).toBe(
      `(contains(ListOfficeName,'7041') and contains(ListOfficeName,'realty'))`,
    );
    expect(buildAgentOfficeFilterParts(q({ listAgent: '12345678901234' }))[0]).toMatch(/^contains\(/);
  });

  it('is wired into the full filter, AND-ed with the default status clause', () => {
    const filter = buildCrmIdxODataFilter(q({ type: 'sale', coListAgent: '39361', listOffice: '7041' }));
    expect(filter).toContain(`(CoListAgentMlsId eq '39361' or CoListAgent2MlsId eq '39361' or CoListAgent3MlsId eq '39361')`);
    expect(filter).toContain(`ListOfficeMlsId eq '7041'`);
    expect(filter).toContain(`StandardStatus eq 'Active'`);
    expect(filter.split(' and ').length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the existing ListingAgreement filter independent of the agent/office filters', () => {
    const filter = buildCrmIdxODataFilter(
      q({ checkboxFilters: JSON.stringify({ ListingAgreement: ['CoExclusiveAgency'] }), anyAgent: '39361' }),
    );
    expect(filter).toContain(`ListingAgreement eq 'CoExclusiveAgency'`);
    expect(filter).toContain(`CoListAgent3MlsId eq '39361'`);
  });

  it('exposes exactly the five documented parameters', () => {
    expect(Object.keys(CRM_AGENT_OFFICE_FILTERS)).toEqual(['listAgent', 'coListAgent', 'anyAgent', 'listOffice', 'coListOffice']);
  });
});

describe('SEARCH_SELECT_FIELDS: co-list names and ids come back, co-list contact data does not', () => {
  const mirror = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cotality-enums.live.json'), 'utf8'));
  const liveProperty = new Set(Object.keys(mirror.entities.Property));
  const colist = [
    'CoListAgentMlsId', 'CoListAgentFullName', 'CoListAgent2MlsId', 'CoListAgent2FullName', 'CoListAgent3MlsId', 'CoListAgent3FullName',
    'CoListOfficeMlsId', 'CoListOfficeName', 'CoListOffice2MlsId', 'CoListOffice2Name',
  ];

  it('selects every co-list id and name used by the filters and the mapper', () => {
    for (const field of colist) expect(SEARCH_SELECT_FIELDS).toContain(field);
  });

  it('every one of them is a declared live Property field', () => {
    for (const field of colist) expect({ field, live: liveProperty.has(field) }).toEqual({ field, live: true });
  });

  it('selects no co-list contact field (email, phone, URL, license, fax)', () => {
    const contact = SEARCH_SELECT_FIELDS.filter((f) => /^CoList/.test(f) && /Email|Phone|URL|StateLicense|Fax|NationalAssociationId|Pager|VoiceMail/.test(f));
    expect(contact).toEqual([]);
  });

  it('still has no duplicate names', () => {
    expect(new Set(SEARCH_SELECT_FIELDS).size).toBe(SEARCH_SELECT_FIELDS.length);
  });
});

describe('mapTrestleToCrmListing: co-list is carried beside the primary side, never merged into it', () => {
  const base = { ListingId: 'RLS-T1', StandardStatus: 'Active', PropertyType: 'ResidentialSale', ListPrice: 1000000 };

  it('keeps the primary agent/office exactly as before and adds the co-list slots separately', () => {
    const out = mapTrestleToCrmListing(
      {
        ...base,
        ListAgentFullName: 'Maya Allan', ListAgentMlsId: '39361', ListOfficeName: 'MAllan Real Estate Inc', ListOfficeMlsId: '7041',
        CoListAgentFullName: 'Co One', CoListAgentMlsId: '108207', CoListAgent2FullName: 'Co Two', CoListAgent2MlsId: '94356',
        CoListOfficeName: 'Compass', CoListOfficeMlsId: '7222', CoListOffice2Name: 'MAllan Real Estate Inc', CoListOffice2MlsId: '7041',
      },
      0,
    ) as Record<string, unknown>;
    expect(out.agentName).toBe('Maya Allan');
    expect(out.company).toBe('MAllan Real Estate Inc');
    expect(out.listAgentMlsId).toBe('39361');
    expect(out.listOfficeMlsId).toBe('7041');
    expect(out.coListingAgentName).toBe('Co One');
    expect(out.coListAgents).toEqual([
      { slot: 1, mlsId: '108207', name: 'Co One' },
      { slot: 2, mlsId: '94356', name: 'Co Two' },
    ]);
    expect(out.coListOffices).toEqual([
      { slot: 1, mlsId: '7222', name: 'Compass', relation: 'different' },
      { slot: 2, mlsId: '7041', name: 'MAllan Real Estate Inc', relation: 'same' },
    ]);
  });

  it('a listing with no co-list data yields empty co-list output and an untouched primary side', () => {
    const out = mapTrestleToCrmListing({ ...base, ListAgentFullName: 'Maya Allan', ListAgentMlsId: '39361' }, 0) as Record<string, unknown>;
    expect(out.agentName).toBe('Maya Allan');
    expect(out.coListAgents).toEqual([]);
    expect(out.coListOffices).toEqual([]);
    expect(out.coListingAgentName).toBe('');
  });

  it('office relation is unknown when either office id is blank, and never claims a firm relationship', () => {
    const out = mapTrestleToCrmListing({ ...base, CoListOfficeMlsId: '334', CoListOfficeName: 'Corcoran Group' }, 0) as Record<string, unknown>;
    expect(out.coListOffices).toEqual([{ slot: 1, mlsId: '334', name: 'Corcoran Group', relation: 'unknown' }]);
    const two = mapTrestleToCrmListing(
      { ...base, ListOfficeMlsId: '40076', CoListOfficeMlsId: '40094', CoListOfficeName: 'Corcoran Group' },
      0,
    ) as Record<string, unknown>;
    expect((two.coListOffices as Array<{ relation: string }>)[0].relation).toBe('different');
  });

  it('a co-list agent never overwrites the primary agent fields', () => {
    const out = mapTrestleToCrmListing({ ...base, CoListAgentFullName: 'Only Co', CoListAgentMlsId: '5' }, 0) as Record<string, unknown>;
    expect(out.agentName).toBe('');
    expect(out.listAgentMlsId).toBe('');
    expect(out.coListingAgentName).toBe('Only Co');
  });
});
