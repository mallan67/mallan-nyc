/**
 * THE CANONICAL SALE / RENTAL UNIVERSE — defined by positive membership.
 *
 * A broker asking for "sales" and a broker asking for "rentals" must be asking
 * about explicitly enumerated PropertyType members, never about the complement
 * of the other question. This file is the one place that decides which.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE LIVE API ACTUALLY CONTAINS (probed 2026-08-22, api.cotality.com)
 *
 * Full evidence: `docs/idx/COTALITY-SALE-RENTAL-STATUS-EVIDENCE-2026-08-22.md`
 *
 * `PropertyType` is a nullable enum, `Edm.Int64`, with THIRTEEN declared members:
 *
 *     BusinessOpportunity=0   CommercialLease=1      CommercialSale=2
 *     DisasterReliefRental=3  Farm=4                 HighRise=5
 *     Land=6                  ManufacturedInPark=7   MultiFamily=8
 *     Residential=9           ResidentialIncome=10   ResidentialLease=11
 *     Specialty=12
 *
 * `'Commercial'` is NOT among them — a filter on it returns HTTP 400, "not a
 * valid enumeration type constant". Neither is `'Rental'` or `'Sale'`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACED, AND WHY IT WAS UNSAFE
 *
 * `lib/search/crm-idx-mapper.ts` decided the split with:
 *
 *     const isRental = propertyType.toLowerCase().includes('lease');
 *     ...
 *     listingCategory: isRental ? 'rental' : undefined
 *
 * Two defects, and the second is structural.
 *
 * 1. SUBSTRING MATCHING against an enum. `DisasterReliefRental` is a RENTAL and
 *    contains no "lease", so it classified as a SALE. This is the same defect
 *    shape already corrected elsewhere in this codebase, where a substring test
 *    on `PetsAllowed` "Yes" also matched "BuildingYes".
 *
 * 2. SALE DEFINED BY NEGATION. `: undefined` means sale is whatever is left over,
 *    so every member Cotality has not yet populated — `Land`, `CommercialSale`,
 *    `MultiFamily`, `ResidentialIncome`, `Farm`, `BusinessOpportunity` — becomes
 *    residential SALE inventory the moment it appears, with no code change and
 *    no warning. A broker's sale search would quietly start returning land and
 *    commercial listings.
 *
 * The negation is INDISTINGUISHABLE FROM CORRECT TODAY, which is exactly why it
 * had to be measured rather than reasoned about. On 2026-08-22:
 *
 *     PropertyType eq 'Residential'        215,388
 *     PropertyType ne 'ResidentialLease'   215,388   <- identical, today
 *
 * The two agree only because the other eleven members are unpopulated. That is a
 * fact about one day's data, not a definition.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE
 *
 * Membership is POSITIVE and EXPLICIT on both sides. A PropertyType that is in
 * neither set is UNKNOWN — it is not silently assigned to sale, and not assigned
 * to rental either. Unknown is a real answer and callers must handle it.
 */

/** Every member the live `PropertyType` enum declares (2026-08-22). */
export const PROPERTY_TYPE_MEMBERS = [
  'BusinessOpportunity',
  'CommercialLease',
  'CommercialSale',
  'DisasterReliefRental',
  'Farm',
  'HighRise',
  'Land',
  'ManufacturedInPark',
  'MultiFamily',
  'Residential',
  'ResidentialIncome',
  'ResidentialLease',
  'Specialty',
] as const;

export type PropertyTypeMember = (typeof PROPERTY_TYPE_MEMBERS)[number];

/**
 * What Mallan means by a residential SALE listing.
 *
 * Deliberately narrow. REBNY RLS accepts only `Residential` and
 * `ResidentialLease` (`lib/compliance/rls-enforcement.ts:309`), and `Residential`
 * is the only sale member the live feed carries. Widening this set is a product
 * decision for Maya, not an inference from a member appearing in the vocabulary:
 * `MultiFamily`, `ResidentialIncome` and `Land` are all plausibly "sales" in
 * ordinary speech and are NOT included, because nobody has decided that they
 * belong in a residential sale search.
 */
export const SALE_PROPERTY_TYPES: readonly PropertyTypeMember[] = ['Residential'];

/**
 * What Mallan means by a residential RENTAL listing.
 *
 * `ResidentialLease` only. `CommercialLease` and `DisasterReliefRental` are
 * genuinely leases but are not residential rental inventory, and neither is
 * carried by this licence today. They are excluded by decision, not by accident
 * — which is the difference between this and a substring test.
 */
export const RENTAL_PROPERTY_TYPES: readonly PropertyTypeMember[] = ['ResidentialLease'];

/** How Mallan classifies a listing for search purposes. */
export type ListingUniverse = 'sale' | 'rental' | 'unknown';

/**
 * Which universe does this PropertyType belong to?
 *
 * Returns `'unknown'` for an absent, unrecognised, or deliberately-unassigned
 * member. Unknown is NOT sale. A caller that needs a binary answer has to decide
 * what to do with unknown; it does not get one by default.
 */
export function classifyPropertyType(propertyType: unknown): ListingUniverse {
  if (typeof propertyType !== 'string' || propertyType === '') return 'unknown';
  // Exact membership, never substring, and never case-folded: these are enum
  // member names and the provider emits them exactly as declared.
  if ((SALE_PROPERTY_TYPES as readonly string[]).includes(propertyType)) return 'sale';
  if ((RENTAL_PROPERTY_TYPES as readonly string[]).includes(propertyType)) return 'rental';
  return 'unknown';
}

/** True only for a member Mallan has positively assigned to the rental universe. */
export function isRentalPropertyType(propertyType: unknown): boolean {
  return classifyPropertyType(propertyType) === 'rental';
}

/** True only for a member Mallan has positively assigned to the sale universe. */
export function isSalePropertyType(propertyType: unknown): boolean {
  return classifyPropertyType(propertyType) === 'sale';
}

/** Is this a member of the live provider vocabulary at all? */
export function isPropertyTypeMember(value: unknown): value is PropertyTypeMember {
  return typeof value === 'string' && (PROPERTY_TYPE_MEMBERS as readonly string[]).includes(value);
}

/**
 * The OData `$filter` fragment for a universe.
 *
 * Rendered as positive `eq` predicates joined by `or`, never as `ne` against the
 * other universe. Two reasons, and both were measured:
 *
 *   * a negation silently absorbs every future member (see the header);
 *   * operator behaviour on Cotality enums is NOT uniform. `ne` is well-behaved
 *     on `PropertyType` and on `StandardStatus`, but on `MediaClassification`
 *     — which has case-variant member pairs — `ne 'Document'` excludes nothing
 *     and returns the whole population. Verified per-field, never assumed.
 *     See `docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md` §5.1.
 *
 * Throws for `'unknown'`: there is no provider predicate for "we do not know
 * what this is", and inventing one would put unclassified rows into a broker's
 * result set under a label nobody earned.
 */
export function propertyTypeUniverseOData(universe: ListingUniverse): string {
  const members =
    universe === 'sale' ? SALE_PROPERTY_TYPES
    : universe === 'rental' ? RENTAL_PROPERTY_TYPES
    : null;

  if (!members) {
    throw new Error(
      `[property-type-universe] no provider filter exists for universe "${universe}". ` +
        'Unknown is a state to surface, not a set to query.',
    );
  }
  return members.map((m) => `PropertyType eq '${m}'`).join(' or ');
}
