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
  ['View', {
    cotalityField: 'View',
    allowed: new Set(['Bay', 'Beach', 'Bridges', 'Canal', 'City', 'CityLights', 'Downtown', 'Forest', 'Garden', 'Lake', 'Mountains', 'Ocean', 'Panoramic', 'ParkGreenbelt', 'River', 'Skyline', 'TreesWoods', 'Water']),
    unresolved: new Map([
      ['Park', "Provider View enum rejects Park (HTTP 400). Not a member."],
    ]),
  }],
  ['PetsAllowed', {
    cotalityField: 'PetsAllowed',
    allowed: new Set<string>([]),
    unresolved: new Map([
      ['CatsOnly', "Provider has CatsOk (cats PERMITTED). \"Only cats\" is a different assertion and would require composing CatsOk with NoDogs. Not a spelling variant."],
      ['DogsOnly', "Provider has DogsOk (dogs PERMITTED). \"Only dogs\" is a different assertion. Not a spelling variant."],
      ['NoRestrictions', "Provider has NoPetRestrictions, NoBreedRestrictions and NoSizeLimit as distinct members. Which one Mallan means is unproven."],
    ]),
  }],
  ['LaundryFeatures', {
    cotalityField: 'LaundryFeatures',
    allowed: new Set(['InUnit']),
    unresolved: new Map([
      ['Common', "Provider has CommonArea AND CommonOnFloor. Which one \"Common\" means is unproven."],
    ]),
  }],
  ['StructureType', {
    cotalityField: 'StructureType',
    allowed: new Set(['HighRise', 'Townhouse']),
    unresolved: new Map([
      ['Loft', "Not a StructureType member. Loft is carried as a PropertySubType concept; needs its own contract."],
      ['WalkUp', "Not a StructureType member. Needs proof of the provider fact that expresses walk-up."],
    ]),
  }],
  ['ArchitecturalStyle', {
    cotalityField: 'ArchitecturalStyle',
    allowed: new Set(['Loft', 'Prewar', 'WalkUp']),
    unresolved: new Map([
      ['Brownstone', "Not an ArchitecturalStyle member. Needs proof."],
    ]),
  }],
  ['PropertyCondition', {
    cotalityField: 'PropertyCondition',
    allowed: new Set(['Excellent']),
    unresolved: new Map([
      ['Fair', "Provider has AverageCondition and BelowAverage. There is no Fair. The intended member is genuinely ambiguous."],
      ['Good', "Provider has GoodCondition. Plausible spelling variant but UNCONFIRMED against Mallan business meaning."],
      ['Poor', "Provider has PoorCondition. Plausible spelling variant but UNCONFIRMED."],
    ]),
  }],
  ['AccessibilityFeatures', {
    cotalityField: 'AccessibilityFeatures',
    allowed: new Set<string>([]),
    unresolved: new Map([
      ['WheelchairAccessible', "Provider exposes many granular Accessible* members; no single wheelchair member. Mapping would be a Mallan composition."],
    ]),
  }],
  ['ExteriorFeatures', {
    cotalityField: 'ExteriorFeatures',
    allowed: new Set(['Balcony', 'BuildingRoofDeck', 'Courtyard', 'Garden', 'Patio']),
    unresolved: new Map([
      ['RoofDeck', "Not an ExteriorFeatures member. May live in BuildingFeatures; unproven."],
      ['Terrace', "Not an ExteriorFeatures member. Unproven."],
    ]),
  }],
  ['PoolFeatures', {
    cotalityField: 'PoolFeatures',
    allowed: new Set(['Indoor']),
    unresolved: new Map<string, string>(),
  }],
  ['BuildingFeatures', {
    cotalityField: 'BuildingFeatures',
    allowed: new Set(['Elevators', 'FitnessCenter', 'HealthClub', 'Storage']),
    unresolved: new Map([
      ['BikeRoom', "Not a BuildingFeatures member. Unproven."],
      ['Fitness', "Not a BuildingFeatures member (provider may use a different token). Unproven."],
    ]),
  }],
  ['BusinessType', {
    cotalityField: 'BusinessType',
    allowed: new Set(['Accounting', 'Bakery', 'BarTavernLounge', 'BarberBeauty', 'BedAndBreakfast', 'Cafe', 'ChildCare', 'Dental', 'Distribution', 'DryCleaner', 'FastFood', 'Financial', 'Fitness', 'Grocery', 'HealthServices', 'Hospitality', 'HotelMotel', 'Industrial', 'Institutional', 'Laundromat', 'Manufacturing', 'Medical', 'MultiTenant', 'ProfessionalOffice', 'ProfessionalService', 'RealEstate', 'Restaurant', 'Showroom', 'SingleTenant', 'SpecialUse', 'Storage', 'StripMall', 'Technology', 'Warehouse']),
    unresolved: new Map([
      ['FlexibleSpace', "Not a BusinessType member. Unproven."],
      ['Investment', "Not a BusinessType member. Unproven."],
    ]),
  }],
]);

/** Is this field filterable at all under the verified contract? */
export function isRegisteredCheckboxField(field: string): boolean {
  return REGISTRY.has(field);
}

export function checkboxFieldContract(field: string): CheckboxFieldContract | null {
  return REGISTRY.get(field) ?? null;
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
  const contract = REGISTRY.get(field);
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
      `checkboxFilters.${field}`,
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
