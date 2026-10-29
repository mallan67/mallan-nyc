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

import {
  buildAgentOfficeFilterParts,
  buildCrmIdxQuery,
  CRM_AGENT_OFFICE_FILTERS,
} from '@/lib/search/crm-idx-filter';

// The agent/office filters now live inside the live-contract query builder (integration 2026-10-28):
// the whole Cotality filter string is buildCrmIdxQuery(params).filter.
const buildCrmIdxODataFilter = (params: URLSearchParams): string => buildCrmIdxQuery(params).filter;

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
