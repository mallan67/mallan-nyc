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
  /** Exact live Cotality Property field. */
  readonly cotalityField: string;
  /** Live-verified exact members this UI may request. */
  readonly allowed: ReadonlySet<string>;
  /** UI values with no proven provider equivalence, and why. */
  readonly unresolved: ReadonlyMap<string, string>;
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

const REGISTRY: ReadonlyMap<CheckboxFieldName, CheckboxFieldContract> = new Map([
  ['view', {
    cotalityField: 'View',
    allowed: new Set(['Bay', 'Beach', 'Bridges', 'Canal', 'City', 'CityLights', 'Downtown', 'Forest', 'Garden', 'Lake', 'Mountains', 'Ocean', 'Panoramic', 'ParkGreenbelt', 'River', 'Skyline', 'TreesWoods', 'Water']),
    unresolved: new Map([
      ['Park', "Provider View enum rejects Park (HTTP 400). Not a member."],
    ]),
  }],
  ['pet_policy', {
    cotalityField: 'PetsAllowed',
    allowed: new Set<string>([]),
    unresolved: new Map([
      ['CatsOnly', "Provider has CatsOk (cats PERMITTED). \"Only cats\" is a different assertion and would require composing CatsOk with NoDogs. Not a spelling variant."],
      ['DogsOnly', "Provider has DogsOk (dogs PERMITTED). \"Only dogs\" is a different assertion. Not a spelling variant."],
      ['NoRestrictions', "Provider has NoPetRestrictions, NoBreedRestrictions and NoSizeLimit as distinct members. Which one Mallan means is unproven."],
    ]),
  }],
  ['laundry', {
    cotalityField: 'LaundryFeatures',
    allowed: new Set(['InUnit']),
    unresolved: new Map([
      ['Common', "Provider has CommonArea AND CommonOnFloor. Which one \"Common\" means is unproven."],
    ]),
  }],
  ['building_structure', {
    cotalityField: 'StructureType',
    allowed: new Set(['HighRise', 'Townhouse']),
    unresolved: new Map([
      ['Loft', "Not a StructureType member. Loft is carried as a PropertySubType concept; needs its own contract."],
      ['WalkUp', "Not a StructureType member. Needs proof of the provider fact that expresses walk-up."],
    ]),
  }],
  ['architectural_style', {
    cotalityField: 'ArchitecturalStyle',
    allowed: new Set(['Loft', 'Prewar', 'WalkUp']),
    unresolved: new Map([
      ['Brownstone', "Not an ArchitecturalStyle member. Needs proof."],
    ]),
  }],
  ['accessibility', {
    cotalityField: 'AccessibilityFeatures',
    allowed: new Set<string>([]),
    unresolved: new Map([
      ['WheelchairAccessible', "Provider exposes many granular Accessible* members; no single wheelchair member. Mapping would be a Mallan composition."],
    ]),
  }],
  ['outdoor_features', {
    cotalityField: 'ExteriorFeatures',
    allowed: new Set(['Balcony', 'BuildingRoofDeck', 'Courtyard', 'Garden', 'Patio']),
    unresolved: new Map([
      ['RoofDeck', "Not an ExteriorFeatures member. May live in BuildingFeatures; unproven."],
      ['Terrace', "Not an ExteriorFeatures member. Unproven."],
    ]),
  }],
  ['pool', {
    cotalityField: 'PoolFeatures',
    allowed: new Set(['Indoor']),
    unresolved: new Map<string, string>(),
  }],
  ['building_amenities', {
    cotalityField: 'BuildingFeatures',
    allowed: new Set(['Elevators', 'FitnessCenter', 'HealthClub', 'Storage']),
    unresolved: new Map([
      ['BikeRoom', "Not a BuildingFeatures member. Unproven."],
      ['Fitness', "Not a BuildingFeatures member (provider may use a different token). Unproven."],
    ]),
  }],
  ['business_use', {
    cotalityField: 'BusinessType',
    allowed: new Set(['Accounting', 'Bakery', 'BarTavernLounge', 'BarberBeauty', 'BedAndBreakfast', 'Cafe', 'ChildCare', 'Dental', 'Distribution', 'DryCleaner', 'FastFood', 'Financial', 'Fitness', 'Grocery', 'HealthServices', 'Hospitality', 'HotelMotel', 'Industrial', 'Institutional', 'Laundromat', 'Manufacturing', 'Medical', 'MultiTenant', 'ProfessionalOffice', 'ProfessionalService', 'RealEstate', 'Restaurant', 'Showroom', 'SingleTenant', 'SpecialUse', 'Storage', 'StripMall', 'Technology', 'Warehouse']),
    unresolved: new Map([
      ['FlexibleSpace', "Not a BusinessType member. Unproven."],
      ['Investment', "Not a BusinessType member. Unproven."],
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
    const value = String(raw).trim();
    if (!value) continue;
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

  // OR within the field. Always parenthesised so it cannot bind loosely against
  // the surrounding ` and ` joins.
  const terms = wanted.map((v) => `${contract.cotalityField} eq '${v.replace(/'/g, "''")}'`);
  return `(${terms.join(' or ')})`;
}
