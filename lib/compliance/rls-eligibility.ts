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
 *   4. Pure commercial (Office, Retail, etc. with PropertyType "Commercial") → website-only
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
  "Condo",
  "Condominium",
  "CommunityApartment",
  "CoOwnership",
  "DeededParking",
  "Duplex",
  "GardenApartment",
  "Loft",
  "MultiFamily",
  "Quadruplex",
  "SingleFamilyResidence",
  "Timeshare",
  "Townhouse",           // the live PropertySubType member (both Mallan townhouse form values map to it)
  "Triplex",
  "UnimprovedLand",
  "UnitDuplex",
  "UnitQuadruplex",
  "UnitTriplex",
]);

/**
 * Classify a listing's RLS eligibility based on UCBA rules.
 *
 * @param payload - The listing payload (RESO field names)
 * @param overrides - Explicit opt-out or commercial classification from the form
 */
export function classifyRlsEligibility(
  payload: Record<string, unknown>,
  overrides?: {
    /** Explicit opt-out from the form (e.g., agent marked as website-only) */
    explicitOptOut?: boolean;
    /** Commercial sub-type from form (e.g., "RetailStore", "OfficeSpace") */
    commercialSubType?: string;
    /** Commercial ownership from form (e.g., "CommercialCondo") */
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

  // Priority 2: PropertyType = "Commercial" or "CommercialLease" → always website-only
  if (
    propertyType === "Commercial" ||
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
      // Mixed-use with no unit count: warn but default to RLS-eligible
      // (agent must provide NumberOfUnitsTotal — the field is already required
      // for MixedUse/MultiFamily in rebny-ucba-rules.ts BUILDING-001)
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
