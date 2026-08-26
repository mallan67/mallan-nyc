/// <reference types="jest" />
/**
 * EXECUTED_WITHOUT_VERIFIED_CONTRACT.
 *
 * The fourth transport class. Everything upstream can be perfect — collected,
 * serialized, forwarded, read — and the clause the server finally emits can
 * still name a provider field nobody ever executed against the live feed.
 *
 * `PropertyCondition` is why this guard exists. It is a declared Property field
 * with a 27-member picklist, and it is PROVIDER-SUPPRESSED for filtering: the
 * licence forbids it. Metadata membership proved nothing. Only running the query
 * revealed it, and it had already been promoted to VERIFIED_WORKING on the
 * strength of a picklist lookup.
 *
 * So this file pins the fields `buildCrmIdxODataFilter` can actually emit, each
 * against a recorded EXECUTION result. Adding a new provider field to the filter
 * without executing it fails here, by field name.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FIVE OUTCOMES, ALL DISTINCT. Collapsing any two is how a broken criterion
 * gets called supported:
 *
 *   FILTERABLE          query returns rows or an honest zero
 *   PROVIDER_SUPPRESSED field exists, licence forbids filtering it (400)
 *   INVALID_VALUE       field filterable, the VALUE is not a member (400)
 *   NOT_VIABLE          syntactically accepted, cannot answer in time
 *   ABSENT              field does not exist on the resource
 *
 * All results below were obtained from api.cotality.com on 2026-08-26.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const filterSource = readFileSync(join(REPO, 'lib/search/crm-idx-filter.ts'), 'utf8');
// The checkbox registry now owns the boolean criteria too, so the provider
// fields it can emit live there rather than in a booleanFields set.
const registrySource = readFileSync(join(REPO, 'lib/search/canonical/checkbox-criteria.ts'), 'utf8');

/**
 * Every provider field `buildCrmIdxODataFilter` can emit, with its live
 * execution result. `count` is evidence of the moment, not a pinned value — the
 * feed moves. What is pinned is the OUTCOME.
 */
const EXECUTED_FIELD_CONTRACT: Readonly<Record<string, { outcome: string; note: string }>> =
  Object.freeze({
    ListPrice: { outcome: 'FILTERABLE', note: 'numeric range, ge/le' },
    BedroomsTotal: { outcome: 'FILTERABLE', note: 'numeric range; zero is a real value' },
    BathroomsTotalInteger: { outcome: 'FILTERABLE', note: '584,883 at ge 1' },
    RoomsTotal: { outcome: 'FILTERABLE', note: '572,968 at ge 2' },
    LivingArea: { outcome: 'FILTERABLE', note: '252,242 at ge 500' },
    YearBuilt: { outcome: 'FILTERABLE', note: '459,044 at ge 1900' },
    StoriesTotal: { outcome: 'FILTERABLE', note: '255,257 at le 6' },
    NumberOfUnitsTotal: { outcome: 'FILTERABLE', note: '323,533 at ge 1' },
    BuildingName: { outcome: 'FILTERABLE', note: "contains() 3,451 for 'Plaza'" },
    ListingId: { outcome: 'FILTERABLE', note: 'exact match' },
    PostalCode: { outcome: 'FILTERABLE', note: "24,535 for '10016'" },
    UnitNumber: { outcome: 'FILTERABLE', note: "5,230 for '4B'" },
    StreetNumber: { outcome: 'FILTERABLE', note: 'startswith() 3,562' },
    StreetName: { outcome: 'FILTERABLE', note: 'contains() 11,107' },
    StreetDirPrefix: { outcome: 'FILTERABLE', note: "130,526 for 'E'" },
    CloseDate: { outcome: 'FILTERABLE', note: '13,779 after 2026-01-01' },
    ListingContractDate: { outcome: 'FILTERABLE', note: '17,361 after 2026-01-01' },
    CoolingYN: { outcome: 'FILTERABLE', note: '152,792 true' },
    GarageYN: { outcome: 'FILTERABLE', note: '149,777 true' },
    LandLeaseYN: { outcome: 'FILTERABLE', note: '806 true' },
    NewConstructionYN: { outcome: 'FILTERABLE', note: '64,222 true' },
    DirectionFaces: {
      outcome: 'FILTERABLE',
      note:
        'East 205 / North 173 / West 530 / South 474 / Northeast 1. Northwest, ' +
        'Southeast and Southwest are VALID members with ZERO population — ' +
        'filterable and simply empty, which is not the same state as unresolved.',
    },
    ListingAgreement: {
      outcome: 'FILTERABLE',
      note: 'ExclusiveAgency 576,423 / ExclusiveRightToLease 2,870 / ExclusiveRightToSell 2,723.',
    },
    StandardStatus: { outcome: 'FILTERABLE', note: 'all 11 members probed; 4 are zero-population' },

    PublicRemarks: {
      outcome: 'NOT_VIABLE',
      note:
        'contains(PublicRemarks,...) TIMES OUT — "Cotality request unreachable: This ' +
        'operation was aborted" — unscoped AND scoped to Active sale, three attempts. ' +
        'Not suppressed and not invalid: the provider accepts the syntax and cannot ' +
        'answer in time over this corpus. The `keyword` criterion emits this clause ' +
        'and is separately TRANSPORT_BROKEN, so restoring its transport naively would ' +
        'turn a silently-inert filter into a hanging search. Keyword needs a different ' +
        'execution strategy, not just a wire fix.',
    },
  });

describe('every provider field the filter can emit has an execution result', () => {
  /**
   * Pull provider field names out of the clauses the filter builds. Deliberately
   * source-derived: a new clause added tomorrow is picked up without anyone
   * remembering to update a list.
   */
  function emittedProviderFields(): string[] {
    const found = new Set<string>();
    for (const m of filterSource.matchAll(/\["(?:min|max)[A-Za-z]+", "([A-Za-z]+)"/g)) found.add(m[1]);
    for (const m of filterSource.matchAll(/contains\(([A-Z][A-Za-z]+),/g)) found.add(m[1]);
    for (const m of filterSource.matchAll(/startswith\(([A-Z][A-Za-z]+),/g)) found.add(m[1]);
    for (const m of filterSource.matchAll(/`([A-Z][A-Za-z]+) eq /g)) found.add(m[1]);
    for (const m of filterSource.matchAll(/([A-Z][A-Za-z]{3,}) (?:eq|ge|le|gt|lt) /g)) found.add(m[1]);
    // Boolean criteria are emitted from the REGISTRY now, as
    // `${contract.cotalityField} eq true|false`. Reading their provider names
    // from the registry keeps this guard pointed at wherever the mapping
    // actually lives, instead of at where it used to live.
    for (const m of registrySource.matchAll(/kind: '(?:boolean|scalar_enum)',\s+cotalityField: '([A-Za-z]+)'/g)) {
      found.add(m[1]);
    }

    // Fields contracted by their own canonical modules carry their proof there.
    for (const contracted of ['PropertyType', 'CityRegion', 'SubdivisionName', 'PropertySubType', 'CommonInterest']) {
      found.delete(contracted);
    }
    return [...found].sort();
  }

  it('no field is executed without a recorded live result', () => {
    const unproven = emittedProviderFields().filter((f) => !(f in EXECUTED_FIELD_CONTRACT));
    // Fails BY FIELD NAME. Adding a provider field to the filter without running
    // it against the live feed is the defect this catches.
    expect(unproven).toEqual([]);
  });

  it('the recorded set has not rotted — every entry is still emitted', () => {
    const emitted = new Set(emittedProviderFields());
    const stale = Object.keys(EXECUTED_FIELD_CONTRACT).filter((f) => !emitted.has(f));
    expect(stale).toEqual([]);
  });

  it('records PublicRemarks as NOT_VIABLE rather than filterable', () => {
    // The distinction that matters: `keyword` cannot be closed by restoring
    // transport alone, because the clause it emits cannot complete.
    expect(EXECUTED_FIELD_CONTRACT.PublicRemarks.outcome).toBe('NOT_VIABLE');
  });

  it('does not record any field as merely "supported"', () => {
    // Five outcomes exist; a vague one would re-collapse them.
    const allowed = ['FILTERABLE', 'PROVIDER_SUPPRESSED', 'INVALID_VALUE', 'NOT_VIABLE', 'ABSENT'];
    for (const [field, entry] of Object.entries(EXECUTED_FIELD_CONTRACT)) {
      expect(allowed).toContain(entry.outcome);
      expect(entry.note.length).toBeGreaterThan(0);
      expect(field).toBeTruthy();
    }
  });
});

describe('the suppressed field is not reachable through the filter', () => {
  it('PropertyCondition is not emitted by the filter at all', () => {
    // It was promoted on a picklist lookup and demoted on execution. It must not
    // reappear as a clause without a new execution proof.
    expect(filterSource).not.toMatch(/`PropertyCondition eq/);
  });
});
