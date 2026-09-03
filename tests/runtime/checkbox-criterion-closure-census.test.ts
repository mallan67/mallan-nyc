/// <reference types="jest" />
/**
 * THE CLOSURE CENSUS — every checkbox the form can emit, and where it stands.
 *
 * The canonical registry answers "what does this criterion mean to the
 * provider" for the criteria that are IN it. It says nothing about the
 * controls that are not, and that silence is where criteria go missing: a
 * checkbox ships, nobody registers it, the server refuses it anonymously (or,
 * before this workstream, dropped it and widened the search), and no test
 * anywhere notices that the broker has a control which cannot work.
 *
 * So this file enumerates the checkbox keys the SERVED form can emit and
 * demands a disposition for each. It fails BY KEY. Adding a checkbox without
 * deciding what it means is the defect it catches.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DISPOSITIONS. Each names a DIFFERENT problem with a different fix. Collapsing
 * any two of them into "unsupported" is how a working field stayed refused for
 * years — `Furnished` was listed as unsupported and pinned by a test, and had
 * never been executed against the feed. Live it returns 77,944 Unfurnished and
 * 16,285 Furnished.
 *
 *   REGISTERED            in the registry; the registry's own contract test
 *                         owns it from there
 *   ABSENT                the provider has no such field, on any resource
 *                         reachable under this licence
 *   PROVIDER_SUPPRESSED   the field exists and the licence forbids filtering it
 *   NEEDS_SEMANTIC_MAPPING the field or a candidate home exists, but what the
 *                         control ASKS and what the field ANSWERS are not the
 *                         same question
 *   DEDICATED_CONTRACT    handled by its own canonical module, deliberately not
 *                         in the generic checkbox registry
 *   NOT_A_CHECKBOX_CRITERION  the attribute is shared with a non-Search
 *                         subsystem, or the control drives a range/gate rather
 *                         than a checkbox criterion
 *
 * Live results below are from api.cotality.com on 2026-08-26. Property carries
 * 757 fields; every absence was checked against that list with ListPrice,
 * Furnished and StandardStatus as positive controls, because a probe that
 * cannot find anything proves nothing.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const html = readFileSync(resolve(REPO, 'public/crm/html/search-form-and-results.html'), 'utf8');
const registry = readFileSync(resolve(REPO, 'lib/search/canonical/checkbox-criteria.ts'), 'utf8');

type Disposition =
  | 'ABSENT'
  | 'PROVIDER_SUPPRESSED'
  | 'NEEDS_SEMANTIC_MAPPING'
  | 'DEDICATED_CONTRACT'
  | 'NOT_A_CHECKBOX_CRITERION';

const OPEN_CRITERIA: Readonly<Record<string, { disposition: Disposition; note: string }>> =
  Object.freeze({
    AttendanceType: {
      disposition: 'ABSENT',
      note:
        "Doorman / Concierge / Elevator-Attendant controls. Live: \"Could not find a " +
        "property named 'AttendanceType' on type Cotality.DataStandard.RESO.DD.Property\". " +
        'Not suppressed — the provider has no such field to suppress.',
    },
    BuildingRules: {
      disposition: 'NEEDS_SEMANTIC_MAPPING',
      note:
        'Pied-a-terre / Guarantors / Co-purchasers. Absent from Property (757 fields) ' +
        'and from Building. CustomProperty carries a `Restrictions` field that is a ' +
        'plausible home, but mapping building rules onto it is a semantic claim, not ' +
        'a lookup, and this route has no verified CustomProperty contract.',
    },
    BuildingSecurityFeatures: {
      disposition: 'ABSENT',
      note: 'Absent from Property and from Building. No candidate home identified.',
    },
    BuildingSmokeFreeYN: {
      disposition: 'ABSENT',
      note:
        "Live: \"Could not find a property named 'BuildingSmokeFreeYN'\" on Property, " +
        'and the Building resource carries exactly one field (BuildingKey) plus two ' +
        'relationships — it holds no building attributes at all under this licence.',
    },
    BuildingLaundryFeatures: {
      disposition: 'ABSENT',
      note:
        'Absent from Property and from Building. Distinct from the registered ' +
        '`laundry` criterion (LaundryFeatures), which is a UNIT fact — building-level ' +
        'laundry is a different question and must not borrow the unit field.',
    },
    BuildingPetsAllowed: {
      disposition: 'ABSENT',
      note:
        'Absent from Property and from Building. Distinct from the registered ' +
        '`pet_policy` (PetsAllowed), which is unit-level.',
    },
    BuildingPoolFeatures: {
      disposition: 'ABSENT',
      note: 'Absent from Property and from Building. Distinct from the registered `pool`.',
    },
    LeaseType: {
      disposition: 'ABSENT',
      note: "Live: \"Could not find a property named 'LeaseType'\" on Property.",
    },
    RentingAllowedYN: {
      disposition: 'ABSENT',
      note: "Subletting Allowed. Live: no such property on Property.",
    },
    Concessions: {
      disposition: 'PROVIDER_SUPPRESSED',
      note:
        'Live: Concessions eq \'Yes\' -> HTTP 400 "Invalid field \'Concessions\' - cannot ' +
        'be used for filtering, grouping or ordering queries". Yes IS a declared member ' +
        '(CallListingAgent / No / Yes), so this is not a value error. Recorded in the ' +
        "registry's PROVIDER_SUPPRESSED map so the refusal carries this reason.",
    },
    PropertyCondition: {
      disposition: 'PROVIDER_SUPPRESSED',
      note:
        'Declared with a 27-member picklist and still unfilterable under this licence. ' +
        'The original reason the executed-field guard exists.',
    },
    SponsorUnit: {
      disposition: 'NEEDS_SEMANTIC_MAPPING',
      note:
        'Lives inside CustomProperty.CustomFields, not as a top-level Property ' +
        'property. The route refuses it by name rather than return a page-local ' +
        'universe. Needs a verified CustomProperty contract, not a near-neighbour field.',
    },
    MaximumFinancingPercent: {
      disposition: 'NEEDS_SEMANTIC_MAPPING',
      note:
        '"Financing Available" / "No Financing" are yes/no; the field is a PERCENTAGE. ' +
        'Held: no provider fact resolves the question the control asks.',
    },
    PriceChangeTimestamp: {
      disposition: 'NEEDS_SEMANTIC_MAPPING',
      note:
        'The control asks for a price-change DIRECTION (reduced / increased). A ' +
        'timestamp records that a change happened, not which way it went. Deriving ' +
        'direction requires a proven price chronology, which is a Mallan-derived fact.',
    },
    MlsStatus: {
      disposition: 'DEDICATED_CONTRACT',
      note:
        'Owns its own canonical status boundary, including the Mallan sub-statuses ' +
        'that are not live StandardStatus members. Must not fall through to the ' +
        'generic checkbox engine or it would be canonicalised twice.',
    },
    CommonInterest: {
      disposition: 'DEDICATED_CONTRACT',
      note: 'Ownership criterion with its own exact-enum renderer.',
    },
    PropertySubType: {
      disposition: 'DEDICATED_CONTRACT',
      note: 'Its own canonical module and live-verified member set.',
    },
    StoriesTotal: {
      disposition: 'NOT_A_CHECKBOX_CRITERION',
      note:
        'A numeric RANGE criterion, executed through the min/max table ' +
        '(minFloors/maxFloors -> StoriesTotal, 255,257 at le 6). The checkbox-shaped ' +
        'controls sharing this data-field are presets over that range.',
    },
    YearBuilt: {
      disposition: 'NOT_A_CHECKBOX_CRITERION',
      note:
        'Numeric range via minYear/maxYear (459,044 at ge 1900). The Pre-War / Post-War ' +
        'presets over it are a SEPARATE held question: no provider fact defines those ' +
        'boundaries, and inventing a year would be a Mallan claim wearing provider ' +
        'clothing.',
    },
    InternetEntireListingDisplayYN: {
      disposition: 'NOT_A_CHECKBOX_CRITERION',
      note:
        'A DISPLAY GATE, not a search axis. REBNY pre-filters it, so null means ' +
        'displayable — the exact field whose null-handling caused the 7,594-row ' +
        'corruption. It must never become a broker-facing filter.',
    },
    RLSParticipantOnly: {
      disposition: 'NOT_A_CHECKBOX_CRITERION',
      note: 'Distribution gate, enforced in the display layer rather than searched on.',
    },
    ListOfficeMlsId: {
      disposition: 'NEEDS_SEMANTIC_MAPPING',
      note:
        'The "In-House" filter. Mallan office MLS ids are an empty config today ' +
        '(MALLAN_OFFICE_MLS_IDS = []), and syndication/office identity is a held ' +
        'surface, so there is no verified value set to filter on.',
    },
    CRM: {
      disposition: 'NOT_A_CHECKBOX_CRITERION',
      note:
        'Not a provider field. A local CRM-scope toggle sharing the data-field ' +
        'attribute, which is precisely why the canonical migration is additive ' +
        '(data-criterion alongside data-field) rather than a rename.',
    },
  });

/** Checkbox keys the served form can emit: canonical if present, else legacy. */
function emittedCheckboxKeys(): string[] {
  const keys = new Set<string>();
  for (const tag of html.match(/<input[^>]*type="checkbox"[^>]*>/g) || []) {
    const canonical = tag.match(/data-criterion="([a-z_]+)"/);
    const legacy = tag.match(/data-field="([A-Za-z]+)"/);
    if (canonical) keys.add(canonical[1]);
    else if (legacy) keys.add(legacy[1]);
  }
  return [...keys].sort();
}

/** Everything the registry knows, by either name. */
function registryKnows(): Set<string> {
  // `[A-Za-z_]+` on the legacy side, not `[A-Za-z]+`. Legacy keys are not all
  // provider-shaped CamelCase: a legacy MALLAN spelling can carry an underscore,
  // and `['pet_policy', 'pets']` was invisible to the narrower pattern — so a key
  // the registry demonstrably knows was reported as undecided.
  const pairs = [...registry.matchAll(/\['([A-Za-z_]+)',\s*'([a-z_]+)'\]/g)];
  return new Set([...pairs.map((m) => m[1]), ...pairs.map((m) => m[2])]);
}

describe('every checkbox the form can emit has a decided disposition', () => {
  it('no checkbox key is undecided', () => {
    // Fails BY KEY. A new control must be either registered against a live
    // provider fact or explicitly parked here with a reason.
    const known = registryKnows();
    const undecided = emittedCheckboxKeys().filter(
      (k) => !known.has(k) && !(k in OPEN_CRITERIA),
    );
    expect(undecided).toEqual([]);
  });

  it('no parked key has quietly been registered without being removed from here', () => {
    // The opposite drift: a criterion gets registered and its old entry lingers,
    // so the census keeps reporting a closed question as open.
    const known = registryKnows();
    const stale = Object.keys(OPEN_CRITERIA).filter((k) => known.has(k));
    expect(stale).toEqual([]);
  });

  it('no parked key has silently vanished from the form', () => {
    const emitted = new Set(emittedCheckboxKeys());
    const gone = Object.keys(OPEN_CRITERIA).filter((k) => !emitted.has(k));
    expect(gone).toEqual([]);
  });

  it('every disposition carries a substantive reason', () => {
    for (const [key, entry] of Object.entries(OPEN_CRITERIA)) {
      expect(entry.note.length).toBeGreaterThan(40);
      expect(key).toBeTruthy();
    }
  });
});

describe('the dispositions stay distinct', () => {
  it('ABSENT and PROVIDER_SUPPRESSED are never used interchangeably', () => {
    // A field the provider does not have and a field it refuses to filter need
    // different fixes. Telling a broker the wrong one sends them looking in the
    // wrong place, which is the whole reason five outcomes exist.
    expect(OPEN_CRITERIA.AttendanceType.disposition).toBe('ABSENT');
    expect(OPEN_CRITERIA.Concessions.disposition).toBe('PROVIDER_SUPPRESSED');
  });

  it('building-level questions do not borrow the unit-level registered fields', () => {
    // BuildingLaundryFeatures is not LaundryFeatures; BuildingPetsAllowed is not
    // PetsAllowed. Substituting the unit fact for the building fact is exactly
    // the near-neighbour move this codebase refuses.
    for (const key of ['BuildingLaundryFeatures', 'BuildingPetsAllowed', 'BuildingPoolFeatures']) {
      expect(OPEN_CRITERIA[key].disposition).toBe('ABSENT');
    }
    expect(registryKnows().has('laundry')).toBe(true);
    expect(registryKnows().has('pet_policy')).toBe(true);
    expect(registryKnows().has('pool')).toBe(true);
  });

  it('the display gate is never listed as a searchable criterion', () => {
    expect(OPEN_CRITERIA.InternetEntireListingDisplayYN.disposition).toBe(
      'NOT_A_CHECKBOX_CRITERION',
    );
  });
});
