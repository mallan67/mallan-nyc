/**
 * THE CLOSED CHECKBOX CRITERION REGISTRY.
 *
 * The browser sends a MALLAN CRITERION. It does not get to construct a Cotality
 * expression. This module owns the entire allowed surface: which fields may be
 * filtered, which values are permitted for each, and what OData that renders to.
 *
 * WHY A CLOSED REGISTRY RATHER THAN A PASSTHROUGH
 *
 * `checkboxFilters` is a browser-authored object. Forwarding it as an open
 * `field=value` passthrough would let the client name any Cotality field and any
 * value, which is the same class of hazard as the caller-supplied `gridFilter`
 * this codebase already rejects. The server therefore validates every field and
 * every value against live-verified members BEFORE any provider call.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE (probed api.cotality.com 2026-08-26, this session)
 *
 * Every `allowed` value below is an EXACT member of that field's live picklist.
 * Nothing here was inferred from a matching-looking word, an old file, or a
 * RESO document.
 *
 * OPERATOR — proven, not assumed. For a multi-enum, `Field eq 'Member'` matches
 * rows whose collection CONTAINS that member, identically to `has`:
 *
 *     View eq 'Bridges'   2,633      View has ...Multi.View'Bridges'   2,633
 *     View eq 'City'    112,760      View has ...Multi.View'City'    112,760
 *
 * A non-member is rejected by the provider with HTTP 400 rather than returning a
 * silent zero — but we still validate locally so the criterion is named in OUR
 * error instead of arriving as an opaque provider 400.
 *
 * COMBINATION — proven arithmetically, not assumed:
 *
 *     View eq 'City'                    112,760
 *     View eq 'Water'                       983
 *     (City or Water)                   112,980   = 112,760 + 983 - 763 overlap
 *     (City and Water)                      763   = true intersection
 *
 * Within one field the selections are OR (the checkbox-group convention: "a City
 * view OR a Water view"). Across fields they are AND. Both forms are supported
 * by the provider on multi-enums; OR is the one that matches the UI's meaning.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNRESOLVED VALUES ARE NOT MAPPED. A matching word is not proof.
 *
 * `CatsOnly` is the clearest case: the provider has `CatsOk`, which asserts cats
 * are PERMITTED. "Only cats" is a different claim and would require composing
 * `CatsOk` with `NoDogs`. Mapping one to the other is exactly how `PENDING` came
 * to mean `ActiveUnderContract`. Each unresolved value carries its reason and
 * fails by name until its semantics are established.
 */
export type CheckboxFieldName = string;

export interface CheckboxFieldContract {
  /**
   * How the criterion is expressed against the provider.
   *
   * `multi_enum` renders `Field eq 'Member'` (which matches collection
   * membership — proven identical to `has`). `boolean` renders
   * `Field eq true|false`. Keeping the kind ON the registry entry is what
   * allowed crm-idx-filter to drop its own separate booleanFields/aliases
   * table: one registry, one mapping, one place to be wrong.
   */
  readonly kind: 'multi_enum' | 'scalar_enum' | 'boolean';
  /** Exact live Cotality Property field. */
  readonly cotalityField: string;
  /** Live-verified exact members this UI may request. */
  readonly allowed: ReadonlySet<string>;
  /** UI values with no proven provider equivalence, and why. */
  readonly unresolved: ReadonlyMap<string, string>;
  /**
   * UI NOTATION -> provider member, where the two are the SAME fact written
   * differently. Kept here so the single registry remains the only translator;
   * a browser-side or persistence-side copy would drift from it exactly as the
   * boolean mapping did.
   *
   * Only for closed, unambiguous notation — the compass abbreviations, where
   * exactly 8 UI values map one-to-one onto exactly 8 provider directions. This
   * is NOT a place to assert two different CONCEPTS are equivalent; that is
   * what `unresolved` is for (CatsOnly is not CatsOk).
   */
  readonly valueAliases?: ReadonlyMap<string, string>;
}

/** A checkbox criterion Mallan cannot currently express against the live contract. */
export class UnsupportedCheckboxCriterionError extends Error {
  readonly criterion: string;
  readonly unsupportedValues: readonly string[];

  constructor(criterion: string, unsupportedValues: readonly string[], detail?: string) {
    super(
      `Unsupported ${criterion} criterion: ${unsupportedValues.map((v) => `'${v}'`).join(', ')}.` +
        (detail ? ` ${detail}` : '') +
        ' The criterion is rejected rather than dropped — dropping it would widen the search.',
    );
    this.name = 'UnsupportedCheckboxCriterionError';
    this.criterion = criterion;
    this.unsupportedValues = unsupportedValues;
  }
}

const REGISTRY: ReadonlyMap<CheckboxFieldName, CheckboxFieldContract> = new Map<CheckboxFieldName, CheckboxFieldContract>([
  ['view', {
    kind: 'multi_enum',
    cotalityField: 'View',
    allowed: new Set(['Bay', 'Beach', 'Bridges', 'Canal', 'City', 'CityLights', 'Downtown', 'Forest', 'Garden', 'Lake', 'Mountains', 'Ocean', 'Panoramic', 'ParkGreenbelt', 'River', 'Skyline', 'TreesWoods', 'Water']),
    unresolved: new Map([
      ['Park', "Provider View enum rejects Park (HTTP 400). Not a member."],
    ]),
  }],
  ['pet_policy', {
    kind: 'multi_enum',
    cotalityField: 'PetsAllowed',
    allowed: new Set<string>([]),
    unresolved: new Map([
      ['CatsOnly', "Provider has CatsOk (cats PERMITTED). \"Only cats\" is a different assertion and would require composing CatsOk with NoDogs. Not a spelling variant."],
      ['DogsOnly', "Provider has DogsOk (dogs PERMITTED). \"Only dogs\" is a different assertion. Not a spelling variant."],
      ['NoRestrictions', "Provider has NoPetRestrictions, NoBreedRestrictions and NoSizeLimit as distinct members. Which one Mallan means is unproven."],
    ]),
  }],
  ['laundry', {
    kind: 'multi_enum',
    cotalityField: 'LaundryFeatures',
    allowed: new Set(['InUnit']),
    unresolved: new Map([
      ['Common', "Provider has CommonArea AND CommonOnFloor. Which one \"Common\" means is unproven."],
    ]),
  }],
  ['building_structure', {
    kind: 'multi_enum',
    cotalityField: 'StructureType',
    allowed: new Set(['HighRise', 'Townhouse']),
    unresolved: new Map([
      ['Loft', "Not a StructureType member. Loft is carried as a PropertySubType concept; needs its own contract."],
      ['WalkUp', "Not a StructureType member. Needs proof of the provider fact that expresses walk-up."],
    ]),
  }],
  ['architectural_style', {
    kind: 'multi_enum',
    cotalityField: 'ArchitecturalStyle',
    allowed: new Set(['Loft', 'Prewar', 'WalkUp']),
    unresolved: new Map([
      ['Brownstone', "Not an ArchitecturalStyle member. Needs proof."],
    ]),
  }],
  ['accessibility', {
    kind: 'multi_enum',
    cotalityField: 'AccessibilityFeatures',
    allowed: new Set<string>([]),
    unresolved: new Map([
      ['WheelchairAccessible', "Provider exposes many granular Accessible* members; no single wheelchair member. Mapping would be a Mallan composition."],
    ]),
  }],
  ['outdoor_features', {
    kind: 'multi_enum',
    cotalityField: 'ExteriorFeatures',
    allowed: new Set(['Balcony', 'BuildingRoofDeck', 'Courtyard', 'Garden', 'Patio']),
    unresolved: new Map([
      ['RoofDeck', "Not an ExteriorFeatures member. May live in BuildingFeatures; unproven."],
      ['Terrace', "Not an ExteriorFeatures member. Unproven."],
    ]),
  }],
  ['pool', {
    kind: 'multi_enum',
    cotalityField: 'PoolFeatures',
    allowed: new Set(['Indoor']),
    unresolved: new Map<string, string>(),
  }],
  ['building_amenities', {
    kind: 'multi_enum',
    cotalityField: 'BuildingFeatures',
    allowed: new Set(['Elevators', 'FitnessCenter', 'HealthClub', 'Storage']),
    unresolved: new Map([
      ['BikeRoom', "Not a BuildingFeatures member. Unproven."],
      ['Fitness', "Not a BuildingFeatures member (provider may use a different token). Unproven."],
    ]),
  }],
  ['business_use', {
    kind: 'multi_enum',
    cotalityField: 'BusinessType',
    allowed: new Set(['Accounting', 'Bakery', 'BarTavernLounge', 'BarberBeauty', 'BedAndBreakfast', 'Cafe', 'ChildCare', 'Dental', 'Distribution', 'DryCleaner', 'FastFood', 'Financial', 'Fitness', 'Grocery', 'HealthServices', 'Hospitality', 'HotelMotel', 'Industrial', 'Institutional', 'Laundromat', 'Manufacturing', 'Medical', 'MultiTenant', 'ProfessionalOffice', 'ProfessionalService', 'RealEstate', 'Restaurant', 'Showroom', 'SingleTenant', 'SpecialUse', 'Storage', 'StripMall', 'Technology', 'Warehouse']),
    unresolved: new Map([
      ['FlexibleSpace', "Not a BusinessType member. Unproven."],
      ['Investment', "Not a BusinessType member. Unproven."],
    ]),
  }],
  ['land_lease', {
    kind: 'boolean',
    cotalityField: 'LandLeaseYN',
    // Live-verified 2026-08-26: 806 rows true.
    allowed: new Set(['true', 'false', 'Yes', 'No']),
    unresolved: new Map<string, string>(),
  }],
  ['cooling', {
    kind: 'boolean',
    cotalityField: 'CoolingYN',
    // Live-verified 2026-08-26: 152,792 rows true.
    allowed: new Set(['true', 'false', 'Yes', 'No']),
    unresolved: new Map<string, string>(),
  }],
  ['garage', {
    kind: 'boolean',
    cotalityField: 'GarageYN',
    // Live-verified 2026-08-26: 149,777 rows true. GARAGE, not all parking — the broader word would be an invented equivalence.
    allowed: new Set(['true', 'false', 'Yes', 'No']),
    unresolved: new Map<string, string>(),
  }],
  ['new_construction', {
    kind: 'boolean',
    cotalityField: 'NewConstructionYN',
    // Live-verified 2026-08-26: 64,222 rows true.
    allowed: new Set(['true', 'false', 'Yes', 'No']),
    unresolved: new Map<string, string>(),
  }],
  ['facing_direction', {
    kind: 'scalar_enum',
    cotalityField: 'DirectionFaces',
    // Live-verified 2026-08-26. East 205 / North 173 / West 530 / South 474 /
    // Northeast 1. Northwest, Southeast and Southwest are VALID members with
    // ZERO population — filterable, simply empty. That is a different state
    // from unresolved and is not treated as a defect.
    allowed: new Set(['East', 'North', 'Northeast', 'Northwest', 'South', 'Southeast', 'Southwest', 'West']),
    // The UI writes compass abbreviations. Exactly 8 UI values map one-to-one
    // onto exactly 8 provider directions, so this is NOTATION, not a semantic
    // claim — unlike CatsOnly/CatsOk, which are different assertions.
    valueAliases: new Map([
      ['N', 'North'], ['S', 'South'], ['E', 'East'], ['W', 'West'],
      ['NE', 'Northeast'], ['NW', 'Northwest'], ['SE', 'Southeast'], ['SW', 'Southwest'],
    ]),
    unresolved: new Map<string, string>(),
  }],
  ['listing_agreement', {
    kind: 'scalar_enum',
    cotalityField: 'ListingAgreement',
    // Live-verified 2026-08-26. ExclusiveAgency 576,423 / ExclusiveRightToLease
    // 2,870 / ExclusiveRightToSell 2,723 / ExclusiveRightWithException 1.
    allowed: new Set(['ExclusiveAgency', 'ExclusiveRightToLease', 'ExclusiveRightToSell', 'ExclusiveRightWithException']),
    unresolved: new Map([
      [
        'CoExclusive',
        'The provider member is CoExclusiveAgency (9,275 rows). Whether the ' +
          'Mallan "CoExclusive" label means that exact agreement type is not ' +
          'established, and an agreement type is a CONTRACTUAL fact — the wrong ' +
          'one misstates the brokerage relationship. Unresolved until proven.',
      ],
    ]),
  }],
]);


/**
 * COMPATIBILITY ADAPTER — legacy `data-field` values to canonical Mallan keys.
 *
 * The CRM's generic scanner still reads raw HTML `data-field` attributes, which
 * happen to carry Cotality field names. Accepting them here keeps the form
 * working during migration WITHOUT making the provider's vocabulary Mallan's
 * permanent API vocabulary — the registry is keyed by the Mallan criterion, and
 * Cotality names live only inside `cotalityField`.
 *
 * This adapter is the ONLY place a legacy name is understood. It is a migration
 * boundary, not a second contract, and it should shrink to nothing as the form
 * is re-keyed to canonical criteria.
 */
const CANONICAL_BY_LEGACY: ReadonlyMap<string, string> = new Map([
  ['View', 'view'],
  ['PetsAllowed', 'pet_policy'],
  ['LaundryFeatures', 'laundry'],
  ['StructureType', 'building_structure'],
  ['ArchitecturalStyle', 'architectural_style'],
  ['AccessibilityFeatures', 'accessibility'],
  ['ExteriorFeatures', 'outdoor_features'],
  ['PoolFeatures', 'pool'],
  ['BuildingFeatures', 'building_amenities'],
  ['BusinessType', 'business_use'],
  ['DirectionFaces', 'facing_direction'],
  ['ListingAgreement', 'listing_agreement'],
  ['LandLeaseYN', 'land_lease'],
  ['CoolingYN', 'cooling'],
  ['GarageYN', 'garage'],
  ['NewConstructionYN', 'new_construction'],
  // Legacy UI spelling with no YN suffix.
  ['NewConstruction', 'new_construction'],
]);

/**
 * The canonical Mallan criterion for an incoming key.
 *
 * Accepts a canonical key directly, or a legacy `data-field` name through the
 * adapter. Returns null when neither — the caller then fails closed by name.
 */
export function canonicalCheckboxCriterion(key: string): string | null {
  if (REGISTRY.has(key)) return key;
  return CANONICAL_BY_LEGACY.get(key) ?? null;
}

/**
 * FIELDS THE PROVIDER SUPPRESSES FOR FILTERING.
 *
 * Declared in `$metadata` with a full picklist, and STILL not filterable — the
 * licence forbids it. `MlsStatus` behaves the same way. Metadata membership is
 * NOT executable-filter proof, which is why every family here was execution
 * tested rather than generalised from one successful `View` experiment.
 */
const PROVIDER_SUPPRESSED: ReadonlyMap<string, string> = new Map([
  [
    'PropertyCondition',
    "Provider-suppressed for filtering. Live 2026-08-26: PropertyCondition eq " +
      "'Excellent' -> HTTP 400 \"Results from 'RLS' has been suppressed (provider " +
      'Level) as field PropertyCondition cannot be used for filtering or ordering ' +
      'queries." Excellent IS a declared member of the 27-value picklist, so this ' +
      'is NOT a value error — the whole field is unfilterable under this licence.',
  ],
]);

/** Is this field suppressed for filtering by the provider licence? */
export function isProviderSuppressedField(field: string): boolean {
  return PROVIDER_SUPPRESSED.has(field);
}

/** Is this field filterable at all under the verified contract? */
export function isRegisteredCheckboxField(field: string): boolean {
  return canonicalCheckboxCriterion(field) !== null;
}

export function checkboxFieldContract(field: string): CheckboxFieldContract | null {
  const canonical = canonicalCheckboxCriterion(field);
  return canonical ? REGISTRY.get(canonical) ?? null : null;
}

/** Every registered field, for tests and diagnostics. */
export function registeredCheckboxFields(): string[] {
  return Array.from(REGISTRY.keys()).sort();
}


/** What a requested VALUE is, against the verified contract. */
export type CheckboxValueDisposition =
  | 'executable'
  | 'unresolved'
  | 'invalid'
  | 'boolean_contradiction'
  | 'provider_suppressed'
  | 'unregistered';

export interface CheckboxValueVerdict {
  readonly disposition: CheckboxValueDisposition;
  readonly offending: string[];
  readonly reason?: string;
}

/**
 * THE SINGLE VALUE AUTHORITY.
 *
 * A canonical KEY is not a verified criterion. `view` is canonical and
 * `view: Park` is still unexecutable — the provider rejects Park outright. Any
 * consumer that checks only the key will happily store or run a criterion that
 * cannot execute.
 *
 * Persistence delegates here rather than keeping its own allowed-value table,
 * because a second value authority drifts from this one exactly as the boolean
 * mapping did.
 */
export function validateCheckboxValues(field: string, values: readonly unknown[]): CheckboxValueVerdict {
  const suppressed = PROVIDER_SUPPRESSED.get(field);
  if (suppressed) {
    return { disposition: 'provider_suppressed', offending: values.map(String), reason: suppressed };
  }

  const canonical = canonicalCheckboxCriterion(field);
  const contract = canonical ? REGISTRY.get(canonical) : undefined;
  if (!contract) {
    return {
      disposition: 'unregistered',
      offending: values.map(String),
      reason: 'This field has no verified live Cotality contract.',
    };
  }

  const wanted = values
    .map((v) => String(v).trim())
    .filter(Boolean)
    .map((v) => contract.valueAliases?.get(v) ?? v);
  if (wanted.length === 0) return { disposition: 'executable', offending: [] };

  if (contract.kind === 'boolean') {
    const wantsTrue = wanted.some((v) => v === 'true' || v === 'Yes');
    const wantsFalse = wanted.some((v) => v === 'false' || v === 'No');
    const recognised = wanted.every((v) => contract.allowed.has(v));
    if (!recognised) {
      return {
        disposition: 'invalid',
        offending: wanted.filter((v) => !contract.allowed.has(v)),
        reason: 'A boolean criterion accepts only true/false/Yes/No.',
      };
    }
    if (wantsTrue === wantsFalse) {
      // Asking for both is a contradiction, not a widening.
      return {
        disposition: 'boolean_contradiction',
        offending: wanted,
        reason: 'A boolean criterion must select exactly one of true/false.',
      };
    }
    return { disposition: 'executable', offending: [] };
  }

  const unresolved = wanted.filter((v) => contract.unresolved.has(v));
  if (unresolved.length > 0) {
    return {
      disposition: 'unresolved',
      offending: unresolved,
      reason: unresolved.map((v) => `${v}: ${contract.unresolved.get(v)}`).join(' | '),
    };
  }

  const invalid = wanted.filter((v) => !contract.allowed.has(v));
  if (invalid.length > 0) {
    return {
      disposition: 'invalid',
      offending: invalid,
      reason: 'Not a live provider member for this criterion.',
    };
  }

  return { disposition: 'executable', offending: [] };
}

/**
 * The OData predicate for one checkbox field, or null when nothing is selected.
 *
 * THROWS when a field is not registered, or when any requested value is not a
 * live-verified member. Both are named — an unresolved value reports WHY it is
 * unresolved so the broker learns the criterion is unproven rather than broken.
 */
export function checkboxFieldOData(field: string, values: readonly unknown[]): string | null {
  const suppressed = PROVIDER_SUPPRESSED.get(field);
  if (suppressed) {
    // PROVIDER_UNAVAILABLE is not the same state as "we have not mapped it".
    throw new UnsupportedCheckboxCriterionError(
      `checkboxFilters.${field}`,
      values.map(String),
      suppressed,
    );
  }

  const canonical = canonicalCheckboxCriterion(field);
  const contract = canonical ? REGISTRY.get(canonical) : undefined;
  if (!contract) {
    throw new UnsupportedCheckboxCriterionError(
      `checkboxFilters.${field}`,
      values.map(String),
      'This field has no verified live Cotality contract.',
    );
  }

  const wanted: string[] = [];
  const rejected: string[] = [];
  const reasons: string[] = [];

  for (const raw of values) {
    const rawValue = String(raw).trim();
    if (!rawValue) continue;
    // Resolve UI notation to the provider member before judging it.
    const value = contract.valueAliases?.get(rawValue) ?? rawValue;
    if (contract.allowed.has(value)) {
      if (!wanted.includes(value)) wanted.push(value);
      continue;
    }
    rejected.push(value);
    const why = contract.unresolved.get(value);
    if (why) reasons.push(`${value}: ${why}`);
  }

  if (rejected.length > 0) {
    throw new UnsupportedCheckboxCriterionError(
      `checkboxFilters.${canonical ?? field}`,
      rejected,
      reasons.join(' | ') || 'Not a live provider member.',
    );
  }
  if (wanted.length === 0) return null;

  if (contract.kind === 'boolean') {
    // true/false is not an OR set: asking for both is a contradiction, not a
    // widening, so it is rejected rather than silently collapsed to one side.
    const wantsTrue = wanted.some((v) => v === 'true' || v === 'Yes');
    const wantsFalse = wanted.some((v) => v === 'false' || v === 'No');
    if (wantsTrue === wantsFalse) {
      throw new UnsupportedCheckboxCriterionError(
        `checkboxFilters.${canonical ?? field}`,
        wanted,
        'A boolean criterion must select exactly one of true/false.',
      );
    }
    return `${contract.cotalityField} eq ${wantsTrue ? 'true' : 'false'}`;
  }

  // OR within the field. Always parenthesised so it cannot bind loosely against
  // the surrounding ` and ` joins.
  const terms = wanted.map((v) => `${contract.cotalityField} eq '${v.replace(/'/g, "''")}'`);
  return `(${terms.join(' or ')})`;
}
