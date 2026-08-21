/**
 * THE CANONICAL PROPERTY SUB-TYPE CONTRACT — one definition, two renderers.
 *
 * A sub-type criterion must mean the same thing whether it executes against the
 * Mallan projection or an authorized live Cotality query. Defined ONCE here and
 * rendered to Prisma and to OData, so the two paths cannot drift into different
 * answers to the same broker question.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE LIVE API ACTUALLY CONTAINS (probed 2026-08-21, api.cotality.com)
 *
 * Full evidence: `docs/idx/cotality-property-subtype-live-contract-2026-08-21.md`
 * Raw captures:  `artifacts/.property-subtype-live-probe{,-2}.json`
 *
 *   <Property Name="PropertySubType"
 *             Type="Cotality.DataStandard.RESO.DD.Enums.PropertySubType" />
 *
 * SCALAR. Nullable (no `Nullable` attribute → OData default true). NOT wrapped in
 * `Collection(...)`. 75 declared members.
 *
 * The registry previously called this `multi_enum`. It is not. The MULTI field is
 * the SEPARATE `PropertySubTypeAdditional`, whose type sits in the `.Enums.Multi.`
 * namespace and which is deliberately NOT folded in here — see the bottom of this
 * header.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OPERATORS — probed, never inferred from "it is an enum"
 *
 *   PropertySubType eq 'Apartment'              SUPPORTED         200   6,625
 *   PropertySubType in ('Apartment','Loft')     SUPPORTED         200   6,704
 *   (… eq 'Office' or … eq 'Retail')            SUPPORTED         200       1
 *   contains(PropertySubType,'Apartment')       PROVIDER_REJECTED 400       -
 *   PropertySubType eq 'NotARealMemberZZZ'      PROVIDER_REJECTED 400       -
 *   PropertySubType eq 'apartment'  (miscased)  SUPPORTED         200       0
 *
 * `contains` fails because it takes strings and this is an enum:
 *   "No function signature for the function with name 'contains' matches the
 *    specified arguments. The function signatures considered are:
 *    contains(Edm.String Nullable=true, Edm.String Nullable=true)."
 *
 * THE DANGEROUS ONE IS THE LAST LINE. An outright invalid literal is rejected with
 * 400, but a MIS-CASED one is accepted and returns ZERO ROWS. So the provider will
 * not catch `'apartment'` for us — it hands back a legitimate-looking empty result
 * set. Validation therefore happens HERE, case-exactly, before a request is built.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POPULATION — exhaustive census of all 75 members on StandardStatus eq 'Active'
 *
 * 75/75 probes SUPPORTED, zero UNVERIFIED. Eight members carry rows; the other 67
 * are zero. The eight sum to 8,021, which is exactly `PropertySubType ne null`, so
 * coverage is complete — a census, not a sample.
 *
 * Four members the CRM UI offers are populated ZERO at EVERY status, not merely on
 * Active: Townhouse, Condominium, StockCooperative, UnimprovedLand. `Retail` has 4
 * rows across all statuses and 0 Active.
 *
 * VALID-AND-ZERO IS NOT INVALID. `eq 'Townhouse'` is a well-formed query that
 * legitimately matches nothing (200/0); `eq 'NotARealMember'` is rejected (400).
 * Those two states may never collapse — which is why every declared member stays
 * accepted here, and population is recorded separately as a capability fact.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `PropertySubTypeAdditional` IS NOT FOLDED IN
 *
 * It is a genuinely separate provider fact with its own live population — 6,781
 * non-null against 8,021. Probed on Active, it never disagrees with
 * `PropertySubType` and is never populated where `PropertySubType` is null, so on
 * today's inventory it is a strictly narrower duplicate carrying no extra
 * information. The multi-enum `has` operator does work on it. If Advanced Search
 * later needs it, it becomes its OWN criterion once its brokerage semantics are
 * established — not an alias of this one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `CommonInterest` IS NOT DERIVED FROM THIS
 *
 * Condo / co-op / condop ownership is a different provider fact. The enum's
 * `Condominium` and `StockCooperative` members are populated zero at every status,
 * so using sub-type as an ownership proxy would silently match nothing.
 */

/** The 75 members the live Property entity declares, in provider order. */
const MEMBERS = [
  "Acreage", "Agriculture", "Apartment", "Attached",
  "BoatSlip", "Building", "BuildingBusiness", "BuildingLand",
  "BuildingLandBusiness", "Business", "BusinessLand", "Cabin",
  "Chalet", "Cluster", "Commercial", "Condominium",
  "CoOwnership", "DeededParking", "Detached", "Dockominium",
  "Duplex", "Earthship", "Farm", "FlexibleSpace",
  "Fractional", "Garage", "HalfDuplex", "HotelMotel",
  "ImprovedLand", "Industrial", "Institutional", "Investment",
  "Land", "LiveWork", "Loft", "ManufacturedHome",
  "ManufacturedOnLand", "MiningClaim", "MixedUse", "MobileHome",
  "MobileHomePark", "ModularHome", "MultiFamily", "MultipleParcels",
  "NewHomeCommunity", "NewHomePlan", "NewHomeSpecHome", "NoLand",
  "Office", "Other", "OwnYourOwn", "ParkModel",
  "Quadruplex", "Ranch", "Recreation", "Residential",
  "Retail", "RoomingHouse", "RoomsForRent", "SemiDetached",
  "SingleFamilyResidence", "SitePlanned", "SpecialPurpose", "StockCooperative",
  "Studio", "TenancyInCommon", "Timeshare", "ToBeBuilt",
  "Townhouse", "Triplex", "TwoApartment", "UnimprovedLand",
  "Villa", "Warehouse", "WaterPositionWithLand",
] as const;

export type PropertySubTypeMember = (typeof MEMBERS)[number];

const MEMBER_SET: ReadonlySet<string> = new Set(MEMBERS);

/**
 * The live contract. Read by `search:verify-live`, which re-probes every claim
 * here against api.cotality.com and fails on drift.
 */
export const PROPERTY_SUB_TYPE_LIVE = {
  cotalityResource: "Property",
  cotalityField: "PropertySubType",
  /** SCALAR — not `multi_enum`, whatever the field registry used to say. */
  shape: "scalar_enum",
  nullable: true,
  members: MEMBERS,

  /** Probed per-operator. Three states; they never collapse. */
  operators: {
    eq: "SUPPORTED",
    in: "SUPPORTED",
    or: "SUPPORTED",
    /** HTTP 400 — `contains` takes strings, this is an enum. Never render it. */
    contains: "PROVIDER_REJECTED",
    /** 400 on an unparseable literal, but 200/0 on a mis-cased one. */
    invalidLiteral: "PROVIDER_REJECTED",
    miscasedLiteral: "SILENT_ZERO",
  },

  /** Exhaustive census on `StandardStatus eq 'Active'`. The 67 omitted are zero. */
  populatedActive: {
    Apartment: 6625,
    MultiFamily: 425,
    SingleFamilyResidence: 402,
    Duplex: 354,
    Loft: 79,
    MixedUse: 72,
    Triplex: 63,
    Office: 1,
  },

  /**
   * Valid literals this feed has NEVER carried, at ANY status. Offering them as
   * filters is a product problem, not a mapping one — they are still accepted.
   */
  neverPopulatedAnyStatus: ["Townhouse", "Condominium", "StockCooperative", "UnimprovedLand"],

  coverage: {
    activeTotal: 8032,
    activeNonNull: 8021,
    activeNull: 11,
    membersProbed: 75,
    unverified: 0,
    complete: true,
  },

  verifiedAt: "2026-08-21",
} as const;

/** Exact, CASE-SENSITIVE membership. Case matters: the provider returns 200/0. */
export function isPropertySubTypeMember(value: string): value is PropertySubTypeMember {
  return MEMBER_SET.has(value);
}

/** A sub-type criterion carried a token the live provider does not declare. */
export class UnknownPropertySubTypeError extends Error {
  readonly unknownTokens: readonly string[];

  constructor(unknownTokens: readonly string[]) {
    super(
      `Unsupported PropertySubType criterion: ${unknownTokens.map((t) => `'${t}'`).join(", ")}. ` +
        `Not a live Cotality PropertySubType member (matching is exact and case-sensitive). ` +
        `A mis-cased or unknown token is never substring-matched and never silently dropped.`,
    );
    this.name = "UnknownPropertySubTypeError";
    this.unknownTokens = unknownTokens;
  }
}

/**
 * Parse a criterion into exact live members.
 *
 * Accepts a comma-joined string (what the CRM collector emits — the commercial
 * checkbox carries `"Office,Retail"`) or an array. Whitespace is trimmed; CASE IS
 * NEVER ALTERED. Any token that is not a live member aborts the whole criterion:
 * a partial universe is worse than a loud failure, because a broker cannot see
 * that half their filter was discarded.
 */
export function parsePropertySubTypeCriterion(
  raw: string | readonly string[] | null | undefined,
): PropertySubTypeMember[] {
  if (raw === null || raw === undefined) return [];

  const tokens = (Array.isArray(raw) ? raw : String(raw).split(","))
    .map((token) => String(token).trim())
    .filter((token) => token !== "");

  const unknown = tokens.filter((token) => !isPropertySubTypeMember(token));
  if (unknown.length > 0) throw new UnknownPropertySubTypeError(unknown);

  return [...new Set(tokens)] as PropertySubTypeMember[];
}

/**
 * PROVIDER rendering — exact `eq`, OR-joined. Never `contains`, which is 400.
 * A single member renders without parentheses so the surrounding filter reads
 * the same way it did before the operator changed.
 */
export function propertySubTypeOData(members: readonly PropertySubTypeMember[]): string {
  if (members.length === 0) return "";
  const parts = members.map((member) => `PropertySubType eq '${member}'`);
  return parts.length === 1 ? parts[0] : `(${parts.join(" or ")})`;
}

/**
 * PROJECTION rendering — exact `IN`, the same set the OData renderer describes.
 * `undefined` for an empty list so the caller adds no predicate at all.
 */
export function propertySubTypePrisma(
  members: readonly PropertySubTypeMember[],
): { in: string[] } | undefined {
  if (members.length === 0) return undefined;
  return { in: [...members] };
}
