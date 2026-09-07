/**
 * RLS Eligibility Classifier
 *
 * Determines whether a listing must go through REBNY RLS or is website-only.
 *
 * UCBA Art. I, Sec. 5(F): RLS rules apply to professional/retail units
 * within residential properties of **5 units or less**.
 *
 * Classification tiers:
 *   1. Pure residential  → always RLS-eligible
 *   2. Mixed-use, ≤5 units (small building) → RLS-eligible per UCBA Sec. 5(F)
 *   3. Mixed-use, >5 units (large building) → website-only
 *   4. Commercial PropertyType ("CommercialLease" / "CommercialSale") → website-only
 *   5. Explicit opt-out (rls_eligible=false) → website-only
 */

export type RlsEligibilityResult = {
  rlsEligible: boolean;
  reason: string;
  ucbaRef: string | null;
  /**
   * When true, the listing is mixed-use in a small building and UCBA Sec. 5(F) applies.
   * All standard RLS validation rules must be enforced on this listing.
   */
  mixedUseSmallBuilding: boolean;
};

/**
 * PropertySubTypes that indicate mixed-use or commercial use within a residential building.
 * These require the 5-unit threshold check per UCBA Sec. 5(F).
 */
const MIXED_USE_SUBTYPES = new Set([
  "MixedUse",
  "Office",
  "Retail",
]);

/**
 * PropertySubTypes that are always purely residential — no mixed-use check needed.
 */
const RESIDENTIAL_SUBTYPES = new Set([
  "Apartment",
  "Condominium",
  "CoOwnership",
  "DeededParking",
  "Duplex",
  "Loft",
  "MultiFamily",
  "Quadruplex",
  "SingleFamilyResidence",
  "Timeshare",
  "Townhouse",           // the live member (both Mallan townhouse form values map to it)
  "Triplex",
  "UnimprovedLand",
]);

/**
 * Classify a listing's RLS eligibility based on UCBA rules.
 *
 * @param payload - The POST-SERVER-MAPPING listing payload. Both callers reassign
 *   `body = applyServerFormMapping(...).body` before calling this, so provider-named keys here
 *   (PropertyType, PropertySubType, NumberOfUnitsTotal) already carry live Cotality vocabulary;
 *   that mapping refuses unknown values rather than defaulting them. This is NOT a raw Cotality
 *   record and NOT the raw browser form payload.
 * @param overrides - Explicit opt-out or commercial classification from the form
 */
export function classifyRlsEligibility(
  payload: Record<string, unknown>,
  overrides?: {
    /** MALLAN-OWNED. Explicit opt-out from the form (agent marked the listing website-only).
     *  Derived by the callers from `listings.rls_eligible === false` or an InHouse listing type. */
    explicitOptOut?: boolean;
    /** MALLAN-OWNED, not Cotality. Backed by `listings.commercial_sub_type`
     *  (prisma/schema.prisma:463, e.g. "RetailStore", "OfficeSpace", "Restaurant").
     *  Used here only as a PRESENCE flag — its value is never compared. */
    commercialSubType?: string;
    /** MALLAN-OWNED, not Cotality. Backed by `listings.commercial_ownership`
     *  (prisma/schema.prisma:464, e.g. "CommercialCondo", "CommercialCoop").
     *  ACCEPTED BUT UNUSED — the function body never reads it. Both callers pass it. Left in
     *  place rather than removed so the call sites are untouched by this scoped change. */
    commercialOwnership?: string;
  }
): RlsEligibilityResult {
  // Priority 1: Explicit opt-out always wins
  if (overrides?.explicitOptOut === true) {
    return {
      rlsEligible: false,
      reason: "Listing explicitly marked as website-only (rls_eligible=false)",
      ucbaRef: null,
      mixedUseSmallBuilding: false,
    };
  }

  const propertyType = payload.PropertyType as string | undefined;
  const propertySubType = payload.PropertySubType as string | undefined;
  const numberOfUnits = parseNumberOfUnits(payload);
  const hasCommercialSubType = !!(overrides?.commercialSubType);

  // Priority 2: a commercial PropertyType → always website-only.
  // Only "CommercialLease" and "CommercialSale" are tested: both are VERIFIED live
  // PropertyType members. A bare "Commercial" was tested here previously and is NOT a live
  // PropertyType member (13 live members, verified 2026-09-07), so that branch was dead.
  // "Commercial" IS a live PropertySubType member — a different field — and is not tested here.
  if (
    propertyType === "CommercialLease" ||
    propertyType === "CommercialSale"
  ) {
    return {
      rlsEligible: false,
      reason: `PropertyType "${propertyType}" is not accepted by REBNY RLS. Website-only listing.`,
      ucbaRef: "RLS Data Rules — PropertyType enum",
      mixedUseSmallBuilding: false,
    };
  }

  // Priority 3: Pure residential subtypes → always RLS-eligible
  if (propertySubType && RESIDENTIAL_SUBTYPES.has(propertySubType) && !hasCommercialSubType) {
    return {
      rlsEligible: true,
      reason: `Residential property (${propertySubType}) — RLS-eligible`,
      ucbaRef: null,
      mixedUseSmallBuilding: false,
    };
  }

  // Priority 4: Mixed-use or commercial subtype within a Residential PropertyType
  // → apply UCBA Sec. 5(F) threshold: ≤5 units = RLS-eligible
  if (
    propertySubType && MIXED_USE_SUBTYPES.has(propertySubType) ||
    hasCommercialSubType
  ) {
    // If we don't know the unit count, we can't determine eligibility.
    // Fail closed: require the agent to provide NumberOfUnitsTotal.
    if (numberOfUnits === null) {
      // Mixed-use with no unit count: default to RLS-eligible so the listing is routed INTO
      // the stricter RLS path rather than silently becoming website-only.
      //
      // CITATION CORRECTED 2026-09-07: this previously claimed NumberOfUnitsTotal is "already
      // required ... in rebny-ucba-rules.ts BUILDING-001". That is FALSE. BUILDING-001 requires
      // BuildingAreaTotal, TaxAnnualAmount, LotSizeArea and LotSizeDimensions — not
      // NumberOfUnitsTotal. The field IS mandatory, but via
      // REBNY_UCBA_RULES.requiredFields.agentSubmitted.
      //
      // DEFECT REPORTED, NOT FIXED HERE (out of this file's scope): that mandatory set is only
      // enforced by assertRlsCompliantPayload, which the CRM write paths do not reach for a
      // CRM-created listing. POST calls validateListing(body) with NO rls context, and
      // validateListing only runs the required/conditional gate `if (rls)`. PATCH does call
      // assertRlsCompliantPayload but skips it when `isCrmCreated` (no mls_id). So a CRM-created
      // mixed-use listing can persist with rls_eligible = true and an unknown unit count. See
      // docs/operations/STEP3-FORBIDDEN-AUTHORITY-LEDGER.md Part 8.
      return {
        rlsEligible: true,
        reason: "Mixed-use property — NumberOfUnitsTotal not provided. Defaulting to RLS-eligible. Agent must provide unit count for accurate classification.",
        ucbaRef: "UCBA Art. I, Sec. 5(F)",
        mixedUseSmallBuilding: true, // Assume small until proven otherwise
      };
    }

    if (numberOfUnits <= 5) {
      return {
        rlsEligible: true,
        reason: `Mixed-use property with ${numberOfUnits} total units (≤5). RLS rules apply per UCBA Sec. 5(F).`,
        ucbaRef: "UCBA Art. I, Sec. 5(F)",
        mixedUseSmallBuilding: true,
      };
    } else {
      return {
        rlsEligible: false,
        reason: `Mixed-use property with ${numberOfUnits} total units (>5). Commercial portion not covered by UCBA Sec. 5(F). Website-only.`,
        ucbaRef: "UCBA Art. I, Sec. 5(F)",
        mixedUseSmallBuilding: false,
      };
    }
  }

  // Priority 5: No PropertyType or SubType → default RLS-eligible if Residential
  if (propertyType === "Residential" || propertyType === "ResidentialLease") {
    return {
      rlsEligible: true,
      reason: "Residential property — RLS-eligible",
      ucbaRef: null,
      mixedUseSmallBuilding: false,
    };
  }

  // Priority 6: Unknown PropertyType — fail closed (website-only) unless explicitly residential
  if (propertyType) {
    return {
      rlsEligible: false,
      reason: `PropertyType "${propertyType}" is not recognized as residential. Website-only by default (fail closed).`,
      ucbaRef: null,
      mixedUseSmallBuilding: false,
    };
  }

  // No PropertyType at all — default RLS-eligible (Draft listings may not have it yet)
  return {
    rlsEligible: true,
    reason: "No PropertyType specified — default RLS-eligible (Draft)",
    ucbaRef: null,
    mixedUseSmallBuilding: false,
  };
}

/**
 * Extract NumberOfUnitsTotal from the payload, checking multiple field name variants.
 */
function parseNumberOfUnits(payload: Record<string, unknown>): number | null {
  const raw =
    payload.NumberOfUnitsTotal ??
    payload.numberOfUnitsTotal ??
    payload.number_of_units_total;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}
