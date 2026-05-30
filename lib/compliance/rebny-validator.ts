/**
 * REBNY RLS Compliance Validator
 *
 * Validates listing data against:
 * - REBNY RLS Data Rules (2025_LMP migration)
 * - RESO standards via Trestle Web API
 * - NYC regulations (NY DOS advertising, Fair Housing Act)
 *
 * @see https://docs.google.com/spreadsheets/d/1OiO7SQcMrLE8yMOoePWtv-dtcf2nXc-1iBssRJaOhxQ
 */

import rlsRulesData from './rls-rules.json';

// Types - matches actual rls-rules.json structure
export interface RLSField {
  field: string;
  matrixFieldName: string;
  description: string;
  lmpAddEdit: string; // "Yes" or "No"
  lmpSearch: string;  // "Yes" or "No"
  requirements: string; // "No", "Yes", or "Conditional: ..."
}

// Normalized rule for validation logic
export interface RLSRule {
  field: string;
  description: string;
  addEdit: boolean;
  search: boolean;
  required: boolean;
  conditional: {
    if: string;
    message: string;
  } | null;
  // Optional type validation properties (not currently in rls-rules.json)
  type?: string;
  enum?: string[];
  validation?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  maxFormula?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  enhancedData?: Record<string, unknown>;
  compliance: {
    rebnyRls: boolean;
    reso: boolean;
    fairHousing: boolean;
    nycDos: boolean;
  };
  fieldResults: {
    field: string;
    status: 'valid' | 'error' | 'warning' | 'missing';
    message?: string;
  }[];
}

export interface ListingData {
  [key: string]: unknown;
}

// Load and normalize rules from JSON structure
const rawFields = rlsRulesData.fields as RLSField[];
const fairHousingProhibitedTerms = rlsRulesData.fairHousingProhibitedTerms;
const nycBoroughs = rlsRulesData.nycBoroughs;

// Convert raw JSON fields to normalized rules
function normalizeFields(fields: RLSField[]): RLSRule[] {
  return fields.map((f) => {
    const reqLower = f.requirements.toLowerCase().trim();
    // "Yes", "Yes; ...", "Yes, ...", "Yes: ...", "Yes but ..." all count as required
    const isRequired = reqLower === 'yes' || /^yes[;:,\s]/.test(reqLower) || /^yes\b/.test(reqLower);
    const isConditional = reqLower.startsWith('conditional:');

    let conditional: RLSRule['conditional'] = null;
    if (isConditional) {
      // Extract condition from "Conditional: Required if X"
      const conditionText = f.requirements.replace(/^conditional:\s*/i, '');
      conditional = {
        if: conditionText,
        message: conditionText,
      };
    }

    return {
      field: f.field,
      description: f.description,
      addEdit: f.lmpAddEdit.toLowerCase() === 'yes',
      search: f.lmpSearch.toLowerCase() === 'yes',
      required: isRequired,
      conditional,
    };
  });
}

const rules = normalizeFields(rawFields);

/**
 * Main validation function for REBNY RLS compliance
 */
export function validateListing(listing: ListingData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];
  const fieldResults: ValidationResult['fieldResults'] = [];
  const enhancedData: Record<string, unknown> = {};

  // Track compliance categories
  let rebnyRlsCompliant = true;
  let resoCompliant = true;
  let fairHousingCompliant = true;
  let nycDosCompliant = true;

  // 1. Validate required fields
  for (const rule of rules) {
    const value = listing[rule.field];
    const hasValue = value !== undefined && value !== null && value !== '';

    // Check required fields
    if (rule.required && !hasValue) {
      errors.push(`[REBNY] Required field missing: ${rule.field} - ${rule.description}`);
      fieldResults.push({
        field: rule.field,
        status: 'error',
        message: `Required: ${rule.description}`,
      });
      rebnyRlsCompliant = false;
      continue;
    }

    // Check conditional requirements
    if (rule.conditional && !hasValue) {
      const conditionMet = evaluateCondition(rule.conditional.if, listing);
      if (conditionMet) {
        errors.push(`[REBNY] Conditional field required: ${rule.field} - ${rule.conditional.message}`);
        fieldResults.push({
          field: rule.field,
          status: 'error',
          message: rule.conditional.message,
        });
        rebnyRlsCompliant = false;
        continue;
      }
    }

    // Validate field value if present
    if (hasValue) {
      const fieldValidation = validateFieldValue(rule, value, listing);
      if (!fieldValidation.valid) {
        errors.push(...fieldValidation.errors);
        rebnyRlsCompliant = false;
        fieldResults.push({
          field: rule.field,
          status: 'error',
          message: fieldValidation.errors.join('; '),
        });
      } else {
        fieldResults.push({
          field: rule.field,
          status: 'valid',
        });
      }

      // Add suggestions if available
      suggestions.push(...fieldValidation.suggestions);
    } else if (!rule.required) {
      // Optional field not provided - add suggestion if beneficial
      if (rule.addEdit && rule.search) {
        suggestions.push(`Consider adding ${rule.field}: ${rule.description}`);
      }
      fieldResults.push({
        field: rule.field,
        status: 'missing',
      });
    }
  }

  // 2. Fair Housing compliance check
  const fairHousingResult = validateFairHousing(listing);
  if (!fairHousingResult.valid) {
    errors.push(...fairHousingResult.errors);
    warnings.push(...fairHousingResult.warnings);
    fairHousingCompliant = false;
    nycDosCompliant = false;
  }
  if (fairHousingResult.enhancedRemarks) {
    enhancedData.PublicRemarks = fairHousingResult.enhancedRemarks;
    suggestions.push('PublicRemarks has been sanitized for Fair Housing compliance');
  }

  // 3. NYC-specific validations
  const nycResult = validateNYCSpecific(listing);
  if (!nycResult.valid) {
    errors.push(...nycResult.errors);
    warnings.push(...nycResult.warnings);
    rebnyRlsCompliant = false;
  }
  suggestions.push(...nycResult.suggestions);

  // 4. RESO format validation
  const resoResult = validateRESOFormat(listing);
  if (!resoResult.valid) {
    warnings.push(...resoResult.errors);
    resoCompliant = false;
  }

  // 5. Generate enhanced data suggestions
  const enhancements = generateEnhancements(listing);
  Object.assign(enhancedData, enhancements);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    enhancedData: Object.keys(enhancedData).length > 0 ? enhancedData : undefined,
    compliance: {
      rebnyRls: rebnyRlsCompliant,
      reso: resoCompliant,
      fairHousing: fairHousingCompliant,
      nycDos: nycDosCompliant,
    },
    fieldResults,
  };
}

/**
 * Evaluate conditional rule expressions
 */
function evaluateCondition(condition: string, listing: ListingData): boolean {
  // Handle simple equality: "FieldName=Value"
  const equalityMatch = condition.match(/^(\w+)=(.+)$/);
  if (equalityMatch) {
    const [, field, expectedValue] = equalityMatch;
    return String(listing[field]) === expectedValue;
  }

  // Handle IN conditions: "FieldName IN (Value1,Value2)"
  const inMatch = condition.match(/^(\w+)\s+IN\s+\(([^)]+)\)$/);
  if (inMatch) {
    const [, field, valuesStr] = inMatch;
    const values = valuesStr.split(',').map((v) => v.trim());
    return values.includes(String(listing[field]));
  }

  // Handle AND conditions
  if (condition.includes(' AND ')) {
    const parts = condition.split(' AND ');
    return parts.every((part) => evaluateCondition(part.trim(), listing));
  }

  // Handle OR conditions
  if (condition.includes(' OR ')) {
    const parts = condition.split(' OR ');
    return parts.some((part) => evaluateCondition(part.trim(), listing));
  }

  // Handle existence check: just field name
  if (condition.match(/^\w+$/)) {
    const value = listing[condition];
    return value !== undefined && value !== null && value !== '';
  }

  // Handle greater than: "Field>0"
  const gtMatch = condition.match(/^(\w+)>(\d+)$/);
  if (gtMatch) {
    const [, field, threshold] = gtMatch;
    const value = Number(listing[field]);
    return !isNaN(value) && value > Number(threshold);
  }

  // Handle pipe-separated OR for field existence
  if (condition.includes('|')) {
    const fields = condition.split('|');
    return fields.some((field) => {
      const value = listing[field.trim()];
      return value !== undefined && value !== null && value !== '';
    });
  }

  return false;
}

/**
 * Validate individual field value
 */
function validateFieldValue(
  rule: RLSRule,
  value: unknown,
  _listing: ListingData // Context for future conditional validations
): { valid: boolean; errors: string[]; suggestions: string[] } {
  const errors: string[] = [];
  const suggestions: string[] = [];

  // Type validation
  switch (rule.type) {
    case 'number':
      if (typeof value !== 'number' && isNaN(Number(value))) {
        errors.push(`[REBNY] ${rule.field}: Expected number, got ${typeof value}`);
      } else {
        const numValue = Number(value);
        if (rule.min !== undefined && numValue < rule.min) {
          errors.push(`[REBNY] ${rule.field}: Value ${numValue} is below minimum ${rule.min}`);
        }
        if (rule.max !== undefined && numValue > rule.max) {
          errors.push(`[REBNY] ${rule.field}: Value ${numValue} exceeds maximum ${rule.max}`);
        }
        if (rule.maxFormula === 'currentYear + 10') {
          const maxYear = new Date().getFullYear() + 10;
          if (numValue > maxYear) {
            errors.push(`[REBNY] ${rule.field}: Year ${numValue} exceeds maximum ${maxYear}`);
          }
        }
      }
      break;

    case 'string':
      if (typeof value !== 'string') {
        errors.push(`[REBNY] ${rule.field}: Expected string, got ${typeof value}`);
      } else {
        if (rule.minLength && value.length < rule.minLength) {
          errors.push(
            `[REBNY] ${rule.field}: Text too short (${value.length} chars, minimum ${rule.minLength})`
          );
        }
        if (rule.maxLength && value.length > rule.maxLength) {
          errors.push(
            `[REBNY] ${rule.field}: Text too long (${value.length} chars, maximum ${rule.maxLength})`
          );
        }
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        errors.push(`[REBNY] ${rule.field}: Expected boolean, got ${typeof value}`);
      }
      break;

    case 'date':
      if (!isValidDate(String(value))) {
        errors.push(`[REBNY] ${rule.field}: Invalid date format. Use YYYY-MM-DD`);
      }
      break;

    case 'datetime':
      if (!isValidDateTime(String(value))) {
        errors.push(`[REBNY] ${rule.field}: Invalid datetime format. Use ISO 8601`);
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        // Allow comma-separated strings
        if (typeof value !== 'string') {
          errors.push(`[REBNY] ${rule.field}: Expected array or comma-separated string`);
        }
      }
      break;
  }

  // Enum validation
  if (rule.enum && errors.length === 0) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (!rule.enum.includes(String(v))) {
        errors.push(
          `[REBNY] ${rule.field}: Invalid value "${v}". Allowed values: ${rule.enum.join(', ')}`
        );
      }
    }
  }

  // Special validations
  if (rule.validation && errors.length === 0) {
    switch (rule.validation) {
      case 'email':
        if (typeof value === 'string' && !isValidEmail(value)) {
          errors.push(`[REBNY] ${rule.field}: Invalid email format`);
        }
        break;

      case 'phone':
        if (typeof value === 'string' && !isValidPhone(value)) {
          errors.push(`[REBNY] ${rule.field}: Invalid phone format. Use ###-###-####`);
        }
        break;

      case 'zipCode':
        if (typeof value === 'string' && !isValidZipCode(value)) {
          errors.push(`[REBNY] ${rule.field}: Invalid NYC ZIP code`);
        }
        break;

      case 'nycTaxLot':
        if (typeof value === 'string' && !isValidNYCTaxLot(value)) {
          errors.push(
            `[REBNY] ${rule.field}: Invalid NYC tax lot format. Use "Block-Lot" or "Borough-Block-Lot"`
          );
        }
        break;

      case 'streetDictionary':
        // Would validate against NYC street dictionary
        suggestions.push(`Verify ${rule.field} "${value}" exists in NYC street dictionary`);
        break;

      case 'fairHousing':
        // Handled separately
        break;

      case 'noUnitNumber':
        if (typeof value === 'string') {
          const unitPatterns = [/\bApt\.?\s*\d/i, /\bUnit\s*\d/i, /\b#\d/, /\bSuite\s*\d/i];
          for (const pattern of unitPatterns) {
            if (pattern.test(value)) {
              errors.push(`[REBNY] ${rule.field}: Should not contain unit number`);
              break;
            }
          }
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors, suggestions };
}

/**
 * Validate Fair Housing compliance in listing descriptions
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

  // Scan the same 4 fields as the write-path gate (lib/compliance/rls-enforcement.ts).
  // Previously only PublicRemarks was scanned, which let a listing pass the reporting
  // validator with discriminatory text in ShowingInstructions/SyndicationRemarks/PrivateRemarks.
  type FieldEntry = { name: string; value: string };
  const rawFields: FieldEntry[] = [
    { name: 'PublicRemarks', value: String(listing.PublicRemarks || (listing as Record<string, unknown>).description || '') },
    { name: 'ShowingInstructions', value: String((listing as Record<string, unknown>).ShowingInstructions || '') },
    { name: 'PrivateRemarks', value: String((listing as Record<string, unknown>).PrivateRemarks || '') },
    { name: 'SyndicationRemarks', value: String((listing as Record<string, unknown>).SyndicationRemarks || '') },
  ];
  const fields: FieldEntry[] = rawFields.filter((f) => f.value);

  for (const field of fields) {
    const lower = field.value.toLowerCase();
    const foundTerms: string[] = [];
    for (const term of fairHousingProhibitedTerms) {
      if (lower.includes(term.toLowerCase())) {
        foundTerms.push(term);
      }
    }

    if (foundTerms.length > 0) {
      errors.push(
        `[Fair Housing] Prohibited terms found in ${field.name}: "${foundTerms.join('", "')}". ` +
          'These terms may violate Fair Housing Act by implying discrimination based on ' +
          'race, color, religion, national origin, sex, familial status, or disability.'
      );

      // Generate sanitized version only for PublicRemarks (the displayed field).
      if (field.name === 'PublicRemarks') {
        let sanitized = field.value;
        for (const term of foundTerms) {
          const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          sanitized = sanitized.replace(regex, '[REMOVED]');
        }
        enhancedRemarks = sanitized;
      }
    }

    // Softer patterns run on every field too.
    const warningPatterns = [
      { pattern: /perfect for/i, message: 'Avoid "perfect for [group]" - may imply targeting' },
      { pattern: /ideal for/i, message: 'Avoid "ideal for [group]" - may imply targeting' },
      {
        pattern: /walking distance to (church|temple|mosque|synagogue)/i,
        message: 'Religious proximity may imply preference',
      },
      { pattern: /quiet neighborhood/i, message: 'May imply discrimination against families' },
      { pattern: /executive/i, message: 'May imply income discrimination' },
      { pattern: /prestigious/i, message: 'May imply socioeconomic discrimination' },
    ];

    for (const { pattern, message } of warningPatterns) {
      if (pattern.test(field.value)) {
        warnings.push(`[Fair Housing Warning] (${field.name}) ${message}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    enhancedRemarks,
  };
}

/**
 * NYC-specific validations
 */
function validateNYCSpecific(listing: ListingData): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Validate NYC borough/county mapping
  const city = listing.City || listing.city;
  const county = listing.CountyOrParish || listing.county;
  const stateOrProvince = listing.StateOrProvince || listing.state;

  if (stateOrProvince === 'NY' || stateOrProvince === 'New York') {
    // Check if it's NYC
    const boroughNames = Object.keys(nycBoroughs);
    const isNYC =
      boroughNames.includes(String(city)) ||
      Object.values(nycBoroughs).some((b) => b.county === county);

    if (isNYC) {
      // Validate tax lot is present. H1 (2026-05-30): the canonical Cotality
      // field is TaxLot (BuildingTaxLot is a phantom — absent from live
      // $metadata). Accept canonical TaxLot first; keep BuildingTaxLot /
      // buildingTaxLot as legacy fallback so already-saved rows still validate.
      if (!listing.TaxLot && !listing.BuildingTaxLot && !listing.buildingTaxLot) {
        errors.push('[NYC] TaxLot is required for NYC properties');
      }

      // Validate county matches borough
      if (city && county) {
        const boroughData = nycBoroughs[city as keyof typeof nycBoroughs];
        if (boroughData && boroughData.county !== county) {
          errors.push(
            `[NYC] County mismatch: ${city} should have county "${boroughData.county}", not "${county}"`
          );
        }
      }

      // Co-op specific validations
      const commonInterest = listing.CommonInterest || listing.commonInterest;
      if (commonInterest === 'Stock Cooperative' || commonInterest === 'StockCooperative') {
        if (listing.MaxFinancing === undefined && listing.maxFinancing === undefined) {
          suggestions.push('[NYC] Co-op: Consider adding MaxFinancing (max financing percentage)');
        }
        if (listing.FlipTaxYN === undefined && listing.flipTax === undefined) {
          warnings.push('[NYC] Co-op: FlipTaxYN should be specified');
        }
        if (listing.SubletAllowed === undefined && listing.sublettingAllowed === undefined) {
          suggestions.push('[NYC] Co-op: Consider specifying SubletAllowed policy');
        }
      }

      // Condo specific validations
      if (commonInterest === 'Condominium') {
        if (listing.RealEstateTax === undefined && listing.realEstateTaxes === undefined) {
          warnings.push('[NYC] Condo: RealEstateTax should be specified');
        }
        if (listing.TaxAbatementYN === undefined && listing.taxAbatement === undefined) {
          suggestions.push('[NYC] Condo: Consider specifying TaxAbatementYN');
        }
      }

      // New construction validations
      if (listing.NewConstructionYN === true || listing.NewDevelopmentYN === true) {
        if (listing.SponsorUnitYN === undefined) {
          warnings.push('[NYC] New construction: SponsorUnitYN should be specified');
        }
      }
    }
  }

  // Validate YearBuilt range
  const yearBuilt = Number(listing.YearBuilt || listing.yearBuilt);
  if (yearBuilt) {
    const currentYear = new Date().getFullYear();
    if (yearBuilt < 1700) {
      errors.push(`[NYC] YearBuilt ${yearBuilt} is before 1700 - invalid`);
    }
    if (yearBuilt > currentYear + 10) {
      errors.push(`[NYC] YearBuilt ${yearBuilt} is more than 10 years in the future - invalid`);
    }
  }

  return { valid: errors.length === 0, errors, warnings, suggestions };
}

/**
 * RESO format validation
 */
function validateRESOFormat(listing: ListingData): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for RESO-compliant field naming (PascalCase)
  const nonResoFields = Object.keys(listing).filter((key) => {
    // RESO fields should be PascalCase
    return key !== key.charAt(0).toUpperCase() + key.slice(1) && !key.startsWith('_');
  });

  if (nonResoFields.length > 0) {
    errors.push(
      `[RESO] Non-standard field naming detected. RESO uses PascalCase. ` +
        `Consider renaming: ${nonResoFields.slice(0, 5).join(', ')}${nonResoFields.length > 5 ? '...' : ''}`
    );
  }

  // Validate date formats are ISO 8601
  const dateFields = ['ListingContractDate', 'OnMarketDate', 'ExpirationDate', 'CloseDate'];
  for (const field of dateFields) {
    const value = listing[field];
    if (value && typeof value === 'string') {
      if (!isValidDate(value)) {
        errors.push(`[RESO] ${field}: Should be ISO 8601 date format (YYYY-MM-DD)`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate suggested enhancements for the listing
 */
function generateEnhancements(listing: ListingData): Record<string, unknown> {
  const enhancements: Record<string, unknown> = {};

  // Calculate BathroomsTotal if not present
  if (!listing.BathroomsTotal) {
    const full = Number(listing.BathroomsFull) || 0;
    const half = Number(listing.BathroomsHalf) || 0;
    const threeQuarter = Number(listing.BathroomsThreeQuarter) || 0;
    if (full > 0 || half > 0 || threeQuarter > 0) {
      enhancements.BathroomsTotal = full + threeQuarter * 0.75 + half * 0.5;
    }
  }

  // Generate UnparsedAddress if not present
  if (!listing.UnparsedAddress) {
    const parts = [
      listing.StreetNumber,
      listing.StreetDirPrefix,
      listing.StreetName,
      listing.StreetSuffix,
      listing.StreetDirSuffix,
    ].filter(Boolean);

    if (parts.length > 0) {
      enhancements.UnparsedAddress = parts.join(' ');
    }
  }

  return enhancements;
}

// Utility functions
function isValidDate(value: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

function isValidDateTime(value: string): boolean {
  const date = new Date(value);
  return !isNaN(date.getTime());
}

function isValidEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

function isValidPhone(value: string): boolean {
  // Accept formats: ###-###-####, (###) ###-####, ##########, +1##########
  const phoneRegex = /^(\+1)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;
  return phoneRegex.test(value.replace(/\s/g, ''));
}

function isValidZipCode(value: string): boolean {
  // NYC ZIP codes: 10001-10499 (Manhattan), 11201-11256 (Brooklyn), 11001-11697 (Queens),
  // 10451-10475 (Bronx), 10301-10314 (Staten Island)
  const nycZipRanges = [
    [10001, 10499], // Manhattan
    [11201, 11256], // Brooklyn
    [11001, 11697], // Queens
    [10451, 10475], // Bronx
    [10301, 10314], // Staten Island
  ];

  const zip = parseInt(value.substring(0, 5), 10);
  if (isNaN(zip)) return false;

  return nycZipRanges.some(([min, max]) => zip >= min && zip <= max);
}

function isValidNYCTaxLot(value: string): boolean {
  // Format: "Block-Lot" or "Borough-Block-Lot" or "B-BBBBB-LLLL"
  const patterns = [
    /^\d{1,5}-\d{1,4}$/, // Block-Lot
    /^\d-\d{1,5}-\d{1,4}$/, // Borough-Block-Lot
    /^[1-5]-\d{5}-\d{4}$/, // Full format
  ];

  return patterns.some((pattern) => pattern.test(value));
}

/**
 * Quick validation for a single field
 */
export function validateField(
  fieldName: string,
  value: unknown,
  listing?: ListingData
): { valid: boolean; error?: string } {
  const rule = rules.find((r) => r.field === fieldName);
  if (!rule) {
    return { valid: true }; // Unknown fields pass
  }

  const result = validateFieldValue(rule, value, listing || { [fieldName]: value });
  return {
    valid: result.valid,
    error: result.errors[0],
  };
}

/**
 * Get all required fields for a property type
 */
export function getRequiredFields(propertyType: string, commonInterest?: string): string[] {
  const required: string[] = [];

  for (const rule of rules) {
    if (rule.required) {
      required.push(rule.field);
    }

    // Check conditionals that apply to this property type
    if (rule.conditional) {
      const condition = rule.conditional.if;
      if (
        condition.includes(`PropertyType=${propertyType}`) ||
        (commonInterest && condition.includes(commonInterest))
      ) {
        required.push(rule.field);
      }
    }
  }

  return [...new Set(required)];
}

/**
 * Generate a compliant public remarks template
 */
export function generatePublicRemarks(listing: ListingData): string {
  const parts: string[] = [];

  // Property type and size - handle both RESO and internal format
  const propertyInfo = listing.propertyInfo as Record<string, unknown> | undefined;
  const beds = listing.BedroomsTotal || propertyInfo?.bedroomsTotal;
  const baths = listing.BathroomsTotal || propertyInfo?.bathroomsFull;
  const sqft = listing.LivingArea || propertyInfo?.aboveGradeFinishedArea;
  const propertyType = listing.PropertySubType || propertyInfo?.propertyType;

  if (beds !== undefined && baths !== undefined) {
    parts.push(
      `${propertyType || 'Property'} featuring ${beds} bedroom${beds !== 1 ? 's' : ''} and ${baths} bathroom${baths !== 1 ? 's' : ''}`
    );
  }

  if (sqft) {
    parts.push(`approximately ${Number(sqft).toLocaleString()} square feet of living space`);
  }

  // Building features
  const buildingName = listing.BuildingName;
  if (buildingName) {
    parts.push(`located in ${buildingName}`);
  }

  // Amenities (neutral language)
  const amenities: string[] = [];
  if (listing.BuildingLaundryFeatures) {
    const laundry = Array.isArray(listing.BuildingLaundryFeatures)
      ? listing.BuildingLaundryFeatures
      : [listing.BuildingLaundryFeatures];
    if (laundry.includes('In Unit')) {
      amenities.push('in-unit washer/dryer');
    }
  }

  if (listing.AttendanceType) {
    const attendance = Array.isArray(listing.AttendanceType)
      ? listing.AttendanceType
      : [listing.AttendanceType];
    if (attendance.some((a) => a.includes('Doorman'))) {
      amenities.push('doorman');
    }
  }

  if (amenities.length > 0) {
    parts.push(`Building amenities include ${amenities.join(', ')}`);
  }

  // Views (neutral)
  const views = listing.View;
  if (views && Array.isArray(views) && views.length > 0) {
    parts.push(`Views include ${views.join(' and ').toLowerCase()}`);
  }

  return parts.join('. ') + '.';
}

// Named export object for convenience
export const rebnyValidator = {
  validateListing,
  validateField,
  getRequiredFields,
  generatePublicRemarks,
};
