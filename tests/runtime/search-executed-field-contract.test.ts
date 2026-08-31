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
 * StandardStatus clauses are rendered HERE, not in the filter.
 *
 * Section 5 moved the default on-market universe out of crm-idx-filter.ts, which
 * had been pushing a literal
 * `"(StandardStatus eq 'Active' or ... 'ComingSoon' or ... 'ActiveUnderContract')"`
 * of its own while `market_status` declared status-token-contract as its mapping
 * owner — so the field had two renderers. This scan follows the mapping to where
 * it now lives, exactly as the registry scan below already does for booleans.
 * Dropping StandardStatus from the recorded set instead would have discarded a
 * real live probe result (all 11 members) to make a source grep pass.
 */
const statusSource = readFileSync(join(REPO, 'lib/search/canonical/status-token-contract.ts'), 'utf8');

/**
 * Every provider field `buildCrmIdxODataFilter` can emit, with its live
 * execution result. `count` is evidence of the moment, not a pinned value — the
 * feed moves. What is pinned is the OUTCOME.
 */
const EXECUTED_FIELD_CONTRACT: Readonly<Record<string, { outcome: string; note: string }>> =
  Object.freeze({
    ListPrice: { outcome: 'FILTERABLE', note: 'numeric range, ge/le' },
    BedroomsTotal: { outcome: 'FILTERABLE', note: 'numeric range; zero is a real value' },
    // BathroomsTotalInteger REMOVED 2026-08-30 (Section 5).
    //
    // It WAS filterable — 584,883 at ge 1 — and that was never the problem.
    // `bath-contract.ts` rejects it on an exhaustive 8,103-row live read: an
    // Edm.Int32 that cannot carry 1.5, disagreeing with its own components on
    // ~1% of rows. The executor now renders that contract's disjunction over
    // `BathroomsFull` and `BathroomsHalf`.
    //
    // Those two are deliberately NOT listed here. Like PropertyType, CityRegion
    // and PropertySubType below, they are contracted by their own canonical
    // module and carry their live proof there — recording them again would be a
    // second place for the same evidence to drift.
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
    ListingContractDate: {
      outcome: 'FILTERABLE',
      note: '17,361 after 2026-01-01; 1,260 within 2026-08-01..2026-08-26 (reprobed 2026-08-26)',
    },
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
    ModificationTimestamp: {
      outcome: 'FILTERABLE',
      note:
        '265,990 modified since 2026-08-01; 255,689 when the le bound is narrowed ' +
        'to 2026-08-05, which proves the upper bound bites rather than being ' +
        'ignored. This is the `dateType=Updated` branch. It went UNRECORDED for ' +
        'as long as this guard has existed because the filter emits it as ' +
        '`${field} ${op} ${val}` — the name never appears next to an operator in ' +
        'source, so a source-scanning census could not see it.',
    },
    Furnished: {
      outcome: 'FILTERABLE',
      note:
        'Unfurnished 77,944 / Furnished 16,285 / Negotiable 553 / Partially 69; ' +
        'FurnishedOrUnfurnished is a valid member with zero population. The row ' +
        'value comes back as a plain string, so this is a scalar enum. The repo ' +
        'listed this field as UNSUPPORTED until it was actually executed.',
    },
    OwnerPays: {
      outcome: 'FILTERABLE',
      note:
        'AllUtilities 4,816 / AssociationFees 18 / AirConditioning 0 (valid, ' +
        'empty). FILTERABLE is about the FIELD. The form control is still ' +
        'refused, because its only value is a yes/no `true` and OwnerPays names ' +
        'WHICH charges the owner pays — a separate, unresolved question.',
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
  /**
   * Source with comments removed.
   *
   * A census that scans raw source also scans its own prose. Writing
   * "ModificationTimestamp gt / le" in an explanatory comment would register a
   * provider field that no code emits — and worse, a real emitted field could be
   * "recorded" purely because someone described it. Only code counts.
   */
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }
  const code = stripComments(filterSource);
  const registryCode = stripComments(registrySource);
  const statusCode = stripComments(statusSource);

  function emittedProviderFields(): string[] {
    const found = new Set<string>();

    /**
     * FIELDS THAT REACH THE WIRE THROUGH A VARIABLE.
     *
     * The date clauses are built as `${field} ${op} ${val}`, where `field` is
     * chosen by a ternary. The provider name therefore never appears adjacent to
     * an operator anywhere in the source, and every pattern below was blind to
     * it: `ModificationTimestamp` sat unrecorded for the entire life of this
     * guard while being emitted on every "Updated" date search.
     *
     * Indirection is the normal way a clause gets built, so scanning only for
     * literal `Field op` text is not a small gap — it is a hole the size of
     * every well-factored clause in the file.
     */
    for (const decl of code.matchAll(/(?:const|let|var)\s+field\s*=\s*([^;]+);/g)) {
      // Only the RESULT branches name a provider field. The condition operand
      // does not: `dateType === "Updated" ? "ModificationTimestamp" : ...`
      // contains "Updated", which is a criterion VALUE. Scanning the whole
      // right-hand side would demand live execution proof for a string that
      // never reaches the provider as a field name at all.
      const rhs = decl[1];
      const q = rhs.indexOf('?');
      const branches = q === -1 ? rhs : rhs.slice(q + 1);
      for (const lit of branches.matchAll(/"([A-Z][A-Za-z]{3,})"/g)) found.add(lit[1]);
    }
    for (const m of code.matchAll(/\["(?:min|max)[A-Za-z]+", "([A-Za-z]+)"/g)) found.add(m[1]);
    for (const m of code.matchAll(/contains\(([A-Z][A-Za-z]+),/g)) found.add(m[1]);
    for (const m of code.matchAll(/startswith\(([A-Z][A-Za-z]+),/g)) found.add(m[1]);
    for (const m of code.matchAll(/`([A-Z][A-Za-z]+) eq /g)) found.add(m[1]);
    for (const m of code.matchAll(/([A-Z][A-Za-z]{3,}) (?:eq|ge|le|gt|lt) /g)) found.add(m[1]);
    // A field can also be COMPARED THROUGH A FUNCTION — `toupper(UnitNumber) eq
    // 'X'` — where the name is followed by `)` rather than by the operator. Every
    // pattern above went blind to UnitNumber the moment the unit clause became
    // case-insensitive on 2026-08-31, which would have read as the field no
    // longer being emitted at all.
    for (const m of code.matchAll(/(?:toupper|tolower|trim)\(([A-Z][A-Za-z]+)\)\s*(?:eq|ne|ge|le|gt|lt) /g)) {
      found.add(m[1]);
    }
    // Boolean criteria are emitted from the REGISTRY now, as
    // `${contract.cotalityField} eq true|false`. Reading their provider names
    // from the registry keeps this guard pointed at wherever the mapping
    // actually lives, instead of at where it used to live.
    for (const m of registryCode.matchAll(/kind: '(?:boolean|scalar_enum)',\s+cotalityField: '([A-Za-z]+)'/g)) {
      found.add(m[1]);
    }
    // Same principle for status: read the field from the module that renders it.
    for (const m of statusCode.matchAll(/`([A-Z][A-Za-z]+) eq /g)) found.add(m[1]);

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
    // NOT_VIABLE is recorded as a PROHIBITION, not as an emission. PublicRemarks
    // is the case: this file already warned that "restoring its transport naively
    // would turn a silently-inert filter into a hanging search", and on
    // 2026-08-31 the `keyword` criterion was changed to refuse by name rather
    // than emit a clause the provider never answers. Requiring a NOT_VIABLE field
    // to still be emitted would make acting on this file's own warning fail the
    // test that carries it.
    const stale = Object.keys(EXECUTED_FIELD_CONTRACT)
      .filter((f) => EXECUTED_FIELD_CONTRACT[f].outcome !== 'NOT_VIABLE')
      .filter((f) => !emitted.has(f));
    expect(stale).toEqual([]);
  });

  it('and a NOT_VIABLE field is genuinely NOT emitted any more', () => {
    // The other half of the exemption above. Excusing NOT_VIABLE from the rot
    // check would otherwise let a field be recorded as unusable while the
    // executor kept right on sending it.
    const emitted = new Set(emittedProviderFields());
    const stillEmitted = Object.keys(EXECUTED_FIELD_CONTRACT)
      .filter((f) => EXECUTED_FIELD_CONTRACT[f].outcome === 'NOT_VIABLE')
      .filter((f) => emitted.has(f));
    expect(stillEmitted).toEqual([]);
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
