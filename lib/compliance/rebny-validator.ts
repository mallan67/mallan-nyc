/**
 * REBNY compliance REPORTING wrapper — thin, over the canonical contracts (Packet 2 closure).
 *
 *   COTALITY LIVE CONTRACT (lib/cotality/live-contract.ts)  → provider facts: field existence, enum members
 *   REBNY / UCBA (lib/compliance/rebny-ucba-rules.ts)        → compliance / business rules
 *   MALLAN (lib/listings/mallan-form-contract.ts)           → form, workflow, storage
 *   RESO = vocabulary only.
 *
 * This module carries NO rule catalogue of its own. Required and conditional fields are evaluated by
 * exactly one evaluator — lib/compliance/rls-enforcement.ts (`assertRlsCompliantPayload`, over
 * REBNY_UCBA_RULES). When a caller passes a ListingContext, that evaluator's findings are folded into
 * the report; when it does not (the write routes already run the gate themselves), the report carries
 * the checks that are unique to this wrapper:
 *   - every provider enum value on the record is a live Cotality member (the live-enum boundary)
 *   - Fair Housing prohibited terms (REBNY_UCBA_RULES.contentRules.fairHousingProhibitedTerms)
 *   - NY DOS / NYC facts (borough ↔ county, tax lot, co-op / condo / new-construction advisories, YearBuilt)
 *   - date formats, enhancement suggestions (BathroomsTotal, UnparsedAddress)
 *
 * The former catalogue (lib/compliance/rls-rules.json, generated from the old RLS CSV and declaring
 * "UCBA > RLS > RESO/IDX > Internal") is deleted; it was a second required/conditional authority on
 * the write path.
 */

import { liveEnumViolations, isLiveEnumMember, liveEnumMembers } from '@/lib/cotality/live-contract';
import { REBNY_UCBA_RULES } from './rebny-ucba-rules';
import { assertRlsCompliantPayload, type ListingContext } from './rls-enforcement';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  enhancedData?: Record<string, unknown>;
  compliance: {
    /** REBNY / UCBA required + conditional rules (only evaluated when a ListingContext is given). */
    rebnyRls: boolean;
    /** Every provider enum value on the record is a live Cotality member. */
    cotalityLiveContract: boolean;
    /** Date formats (RESO is vocabulary only — this is a format check, not an authority). */
    reso: boolean;
    fairHousing: boolean;
    nycDos: boolean;
  };
  fieldResults: Array<{
    field: string;
    status: 'valid' | 'error' | 'warning' | 'missing';
    message?: string;
  }>;
}

export interface ListingData {
  [key: string]: unknown;
}

/** NYC borough → county (a public geographic fact used by the NY DOS checks; not a provider fact). */
export const NYC_BOROUGHS: Readonly<Record<string, { county: string; fips: string }>> = Object.freeze({
  Manhattan: { county: 'New York', fips: '36061' },
  Brooklyn: { county: 'Kings', fips: '36047' },
  Queens: { county: 'Queens', fips: '36081' },
  Bronx: { county: 'Bronx', fips: '36005' },
  'Staten Island': { county: 'Richmond', fips: '36085' },
});

/**
 * Main reporting entry point.
 *
 * @param listing  the record (a Mallan payload or a stored raw_data object)
 * @param rls      when given, the one required/conditional evaluator (rls-enforcement) runs and its
 *                 blockers / warnings are folded into the report. The CRM write routes call the gate
 *                 themselves and pass nothing here.
 */
export function validateListing(listing: ListingData, rls?: ListingContext): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];
  const fieldResults: ValidationResult['fieldResults'] = [];
  const enhancedData: Record<string, unknown> = {};

  let rebnyRlsCompliant = true;
  let cotalityCompliant = true;
  let resoCompliant = true;
  let fairHousingCompliant = true;
  let nycDosCompliant = true;

  // 1. Required / conditional REBNY-UCBA rules — ONE evaluator, only when a context is supplied.
  if (rls) {
    const gate = assertRlsCompliantPayload(listing as Record<string, unknown>, rls);
    for (const b of gate.blockers) {
      errors.push(`[REBNY] ${b.code}${b.field ? ` ${b.field}` : ''}: ${b.message}`);
      if (b.field) fieldResults.push({ field: b.field, status: 'error', message: b.message });
      rebnyRlsCompliant = false;
    }
    for (const w of gate.warnings) {
      warnings.push(`[REBNY] ${w.code}${w.field ? ` ${w.field}` : ''}: ${w.message}`);
      if (w.field) fieldResults.push({ field: w.field, status: 'warning', message: w.message });
    }
  }

  // 2. The live-enum boundary — every provider enum value must be a live Cotality member.
  for (const v of liveEnumViolations(listing as Record<string, unknown>)) {
    errors.push(`[Cotality] ${v.field} "${v.value}" is not a live Cotality ${v.field} member`);
    fieldResults.push({ field: v.field, status: 'error', message: `"${v.value}" is not a live ${v.field} member` });
    cotalityCompliant = false;
  }

  // 3. Fair Housing
  const fairHousingResult = validateFairHousing(listing);
  if (!fairHousingResult.valid) {
    errors.push(...fairHousingResult.errors);
    fairHousingCompliant = false;
    nycDosCompliant = false;
  }
  warnings.push(...fairHousingResult.warnings);
  if (fairHousingResult.enhancedRemarks) {
    enhancedData.PublicRemarks = fairHousingResult.enhancedRemarks;
    suggestions.push('PublicRemarks has been sanitized for Fair Housing compliance');
  }

  // 4. NY DOS / NYC-specific
  const nycResult = validateNYCSpecific(listing);
  if (!nycResult.valid) {
    errors.push(...nycResult.errors);
    nycDosCompliant = false;
  }
  warnings.push(...nycResult.warnings);
  suggestions.push(...nycResult.suggestions);

  // 5. Date formats
  const formatResult = validateDateFormats(listing);
  if (!formatResult.valid) {
    warnings.push(...formatResult.errors);
    resoCompliant = false;
  }

  // 6. Enhancement suggestions
  Object.assign(enhancedData, generateEnhancements(listing));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    enhancedData: Object.keys(enhancedData).length > 0 ? enhancedData : undefined,
    compliance: {
      rebnyRls: rebnyRlsCompliant,
      cotalityLiveContract: cotalityCompliant,
      reso: resoCompliant,
      fairHousing: fairHousingCompliant,
      nycDos: nycDosCompliant,
    },
    fieldResults,
  };
}

/**
 * Fair Housing scan over the same four free-text fields as the write-path gate
 * (lib/compliance/rls-enforcement.ts). Terms come from the REBNY/UCBA content rules.
 */
function validateFairHousing(listing: ListingData): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  enhancedRemarks?: string;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  let enhancedRemarks: string | undefined;
  const prohibited: readonly string[] = REBNY_UCBA_RULES.contentRules.fairHousingProhibitedTerms;

  type FieldEntry = { name: string; value: string };
  const rawFields: FieldEntry[] = [
    { name: 'PublicRemarks', value: String(listing.PublicRemarks || listing.description || '') },
    { name: 'ShowingInstructions', value: String(listing.ShowingInstructions || '') },
    { name: 'PrivateRemarks', value: String(listing.PrivateRemarks || '') },
    { name: 'SyndicationRemarks', value: String(listing.SyndicationRemarks || '') },
  ];
  const fields: FieldEntry[] = rawFields.filter((f) => f.value);

  for (const field of fields) {
    const lower = field.value.toLowerCase();
    const foundTerms = prohibited.filter((term) => lower.includes(term.toLowerCase()));

    if (foundTerms.length > 0) {
      errors.push(
        `[Fair Housing] Prohibited terms found in ${field.name}: "${foundTerms.join('", "')}". ` +
          'These terms may violate Fair Housing Act by implying discrimination based on ' +
          'race, color, religion, national origin, sex, familial status, or disability.'
      );
      // Generate a sanitized version only for PublicRemarks (the displayed field).
      if (field.name === 'PublicRemarks') {
        let sanitized = field.value;
        for (const term of foundTerms) {
          const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          sanitized = sanitized.replace(regex, '[REMOVED]');
        }
        enhancedRemarks = sanitized;
      }
    }

    // Softer patterns: warnings only.
    const warningPatterns = [
      { pattern: /perfect for/i, message: 'Avoid "perfect for [group]" - may imply targeting' },
      { pattern: /ideal for/i, message: 'Avoid "ideal for [group]" - may imply targeting' },
      { pattern: /walking distance to (church|temple|mosque|synagogue)/i, message: 'Religious proximity may imply preference' },
      { pattern: /quiet neighborhood/i, message: 'May imply discrimination against families' },
      { pattern: /executive/i, message: 'May imply income discrimination' },
      { pattern: /prestigious/i, message: 'May imply socioeconomic discrimination' },
    ];
    for (const { pattern, message } of warningPatterns) {
      if (pattern.test(field.value)) warnings.push(`[Fair Housing Warning] (${field.name}) ${message}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings, enhancedRemarks };
}

/** NY DOS / NYC facts. Field names are live Cotality fields or declared Mallan-internal keys. */
function validateNYCSpecific(listing: ListingData): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const city = listing.City || listing.city;
  const borough = listing.CityRegion || listing.Borough || listing.borough;
  const county = listing.CountyOrParish || listing.county;
  const stateOrProvince = listing.StateOrProvince || listing.state;

  if (stateOrProvince === 'NY' || stateOrProvince === 'New York') {
    const boroughNames = Object.keys(NYC_BOROUGHS);
    const boroughKey = boroughNames.find((b) => b === String(borough) || b === String(city));
    const isNYC = !!boroughKey || Object.values(NYC_BOROUGHS).some((b) => b.county === county);

    if (isNYC) {
      // TaxLot is the live Cotality field; BuildingTaxLot is a Mallan-internal legacy key kept for stored rows.
      if (!listing.TaxLot && !listing.BuildingTaxLot && !listing.buildingTaxLot) {
        errors.push('[NYC] TaxLot is required for NYC properties');
      }
      if (boroughKey && county) {
        const expected = NYC_BOROUGHS[boroughKey].county;
        if (expected !== county) {
          errors.push(`[NYC] County mismatch: ${boroughKey} should have county "${expected}", not "${String(county)}"`);
        }
      }

      const commonInterest = listing.CommonInterest || listing.commonInterest;
      if (commonInterest === 'StockCooperative') {
        if (listing.MaximumFinancingPercent === undefined && listing.maxFinancing === undefined) {
          suggestions.push('[NYC] Co-op: Consider adding MaximumFinancingPercent');
        }
        if (listing.FlipTax === undefined && listing.flipTax === undefined) {
          warnings.push('[NYC] Co-op: FlipTax should be specified');
        }
      }
      if (commonInterest === 'Condominium') {
        if (listing.TaxAnnualAmount === undefined && listing.TaxMonthlyAmount === undefined && listing.realEstateTaxes === undefined) {
          warnings.push('[NYC] Condo: TaxAnnualAmount / TaxMonthlyAmount should be specified');
        }
        if (listing.TaxAbatementYN === undefined && listing.taxAbatement === undefined) {
          suggestions.push('[NYC] Condo: Consider specifying TaxAbatementYN');
        }
      }
      if (listing.NewConstructionYN === true || listing.NewDevelopmentYN === true) {
        if (listing.SponsorUnitYN === undefined) {
          warnings.push('[NYC] New construction: SponsorUnitYN should be specified');
        }
      }
    }
  }

  const yearBuilt = Number(listing.YearBuilt || listing.yearBuilt);
  if (yearBuilt) {
    const currentYear = new Date().getFullYear();
    if (yearBuilt < 1700) errors.push(`[NYC] YearBuilt ${yearBuilt} is before 1700 - invalid`);
    if (yearBuilt > currentYear + 10) errors.push(`[NYC] YearBuilt ${yearBuilt} is more than 10 years in the future - invalid`);
  }

  return { valid: errors.length === 0, errors, warnings, suggestions };
}

/** ISO 8601 date format check on the date fields Mallan stores. */
function validateDateFormats(listing: ListingData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const dateFields = ['ListingContractDate', 'OnMarketDate', 'ExpirationDate', 'CloseDate', 'AvailabilityDate', 'ActivationDate'];
  for (const field of dateFields) {
    const value = listing[field];
    if (value && typeof value === 'string' && !isValidDate(value)) {
      errors.push(`[Format] ${field}: Should be ISO 8601 date format (YYYY-MM-DD)`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Suggested enhancements (never written by this module). */
function generateEnhancements(listing: ListingData): Record<string, unknown> {
  const enhancements: Record<string, unknown> = {};

  if (!listing.BathroomsTotal) {
    const full = Number(listing.BathroomsFull) || 0;
    const half = Number(listing.BathroomsHalf) || 0;
    const threeQuarter = Number(listing.BathroomsThreeQuarter) || 0;
    if (full > 0 || half > 0 || threeQuarter > 0) {
      enhancements.BathroomsTotal = full + threeQuarter * 0.75 + half * 0.5;
    }
  }

  if (!listing.UnparsedAddress) {
    const parts = [listing.StreetNumber, listing.StreetDirPrefix, listing.StreetName, listing.StreetSuffix, listing.StreetDirSuffix].filter(Boolean);
    if (parts.length > 0) enhancements.UnparsedAddress = parts.join(' ');
  }

  return enhancements;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return false;
  return !isNaN(new Date(value).getTime());
}

/**
 * Quick validation for a single field: provider enum membership against the live contract.
 * Non-enum fields pass (their required-ness is the REBNY/UCBA evaluator's business).
 */
export function validateField(fieldName: string, value: unknown): { valid: boolean; error?: string } {
  if (!liveEnumMembers(fieldName)) return { valid: true };
  if (value === undefined || value === null || value === '') return { valid: true };
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    if (!isLiveEnumMember(fieldName, v)) {
      return { valid: false, error: `[Cotality] ${fieldName} "${String(v)}" is not a live Cotality ${fieldName} member` };
    }
  }
  return { valid: true };
}

/**
 * Required fields for a property type / ownership — from the REBNY/UCBA rules only:
 * the agent-submitted required set plus the conditional rules whose conditions name the type.
 */
export function getRequiredFields(propertyType: string, commonInterest?: string): string[] {
  const required = new Set<string>(REBNY_UCBA_RULES.requiredFields.agentSubmitted as readonly string[]);
  for (const rule of REBNY_UCBA_RULES.conditionalRules) {
    const when = rule.appliesWhen as Record<string, unknown>;
    const pt = when.PropertyType;
    const ci = when.CommonInterest;
    const ptMatch = Array.isArray(pt) ? pt.includes(propertyType) : pt === undefined || pt === propertyType;
    const ciMatch = ci === undefined || (commonInterest !== undefined && (Array.isArray(ci) ? ci.includes(commonInterest) : ci === commonInterest));
    if (ptMatch && ciMatch && (pt !== undefined || ci !== undefined)) {
      for (const f of rule.requireFields as readonly string[]) required.add(f);
    }
  }
  return [...required];
}

/** A neutral-language public remarks template (never written by this module). */
export function generatePublicRemarks(listing: ListingData): string {
  const parts: string[] = [];
  const propertyInfo = listing.propertyInfo as Record<string, unknown> | undefined;
  const beds = listing.BedroomsTotal || propertyInfo?.bedroomsTotal;
  const baths = listing.BathroomsTotal || propertyInfo?.bathroomsFull;
  const sqft = listing.LivingArea || propertyInfo?.aboveGradeFinishedArea;
  const propertyType = listing.PropertySubType || propertyInfo?.propertyType;

  if (beds !== undefined && baths !== undefined) {
    parts.push(`${propertyType || 'Property'} featuring ${beds} bedroom${beds !== 1 ? 's' : ''} and ${baths} bathroom${baths !== 1 ? 's' : ''}`);
  }
  if (sqft) parts.push(`approximately ${Number(sqft).toLocaleString()} square feet of living space`);
  if (listing.BuildingName) parts.push(`located in ${String(listing.BuildingName)}`);

  const amenities: string[] = [];
  if (listing.BuildingLaundryFeatures) {
    const laundry = Array.isArray(listing.BuildingLaundryFeatures) ? listing.BuildingLaundryFeatures : [listing.BuildingLaundryFeatures];
    if (laundry.includes('In Unit') || laundry.includes('InUnit')) amenities.push('in-unit washer/dryer');
  }
  if (listing.AttendanceType) {
    const attendance = Array.isArray(listing.AttendanceType) ? listing.AttendanceType : [listing.AttendanceType];
    if (attendance.some((a) => String(a).includes('Doorman'))) amenities.push('doorman');
  }
  if (amenities.length > 0) parts.push(`Building amenities include ${amenities.join(', ')}`);

  const views = listing.View;
  if (views && Array.isArray(views) && views.length > 0) parts.push(`Views include ${views.join(' and ').toLowerCase()}`);

  return parts.join('. ') + '.';
}

export const rebnyValidator = {
  validateListing,
  validateField,
  getRequiredFields,
  generatePublicRemarks,
};
