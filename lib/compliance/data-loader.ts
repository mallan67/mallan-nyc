/**
 * RLS Rules Data Loader
 *
 * Loads and filters REBNY RLS rules from rls-rules.json.
 * This is the single source of truth for compliance rules.
 *
 * @module lib/compliance/data-loader
 */

import rlsRulesData from './rls-rules.json';

// Types
export interface RLSField {
  field: string;
  matrixFieldName: string;
  description: string;
  lmpAddEdit: 'Yes' | 'No' | 'Conditional';
  lmpSearch: 'Yes' | 'No' | 'Source Specific';
  requirements: string;
}

export interface RLSRulesData {
  version: string;
  lastUpdated: string;
  source: string;
  note: string;
  fields: RLSField[];
  fairHousingProhibitedTerms: string[];
  nycBoroughs: Record<string, { county: string; fips: string }>;
}

export interface ListingData {
  [key: string]: unknown;
}

// Typed rules data
const rulesData = rlsRulesData as RLSRulesData;

/**
 * Get current RLS rules metadata and all fields
 */
export function getCurrentRLSRules(): RLSRulesData {
  return rulesData;
}

/**
 * Get just the version info for logging/display
 */
export function getRulesVersion(): { version: string; lastUpdated: string; note: string } {
  return {
    version: rulesData.version,
    lastUpdated: rulesData.lastUpdated,
    note: rulesData.note,
  };
}

/**
 * Get all required fields (requirements === "Yes")
 */
export function getRequiredFields(): RLSField[] {
  return rulesData.fields.filter((f) => f.requirements === 'Yes');
}

/**
 * Get all conditional fields (requirements starts with "Conditional")
 */
export function getConditionalFields(): RLSField[] {
  return rulesData.fields.filter((f) => f.requirements.startsWith('Conditional'));
}

/**
 * Get rules relevant to a specific listing for validation.
 * Returns rules that are:
 * 1. Present in the listing object (field exists)
 * 2. Marked lmpAddEdit: "Yes" (editable fields)
 * 3. Required ("Yes") or Conditional
 *
 * @param listing - The listing object to validate
 */
export function getRelevantRulesForListing(listing: ListingData): RLSField[] {
  const listingFields = new Set(Object.keys(listing));

  return rulesData.fields.filter((rule) => {
    // Include if field is present in listing
    const isPresent = listingFields.has(rule.field);

    // Include if field is editable
    const isEditable = rule.lmpAddEdit === 'Yes';

    // Include if required or conditional
    const isRequired = rule.requirements === 'Yes';
    const isConditional = rule.requirements.startsWith('Conditional');

    // Include rules that are:
    // - Present in listing AND editable, OR
    // - Required (even if not present - to catch missing required fields), OR
    // - Conditional (to evaluate the condition)
    return (isPresent && isEditable) || isRequired || isConditional;
  });
}

/**
 * Get Fair Housing prohibited terms
 */
export function getFairHousingProhibitedTerms(): string[] {
  return rulesData.fairHousingProhibitedTerms;
}

/**
 * Get NYC borough data
 */
export function getNYCBoroughs(): Record<string, { county: string; fips: string }> {
  return rulesData.nycBoroughs;
}

/**
 * Check if a field is required for a given listing context
 *
 * @param fieldName - The field to check
 * @param listing - The listing context for conditional evaluation
 */
export function isFieldRequired(fieldName: string, listing: ListingData): boolean {
  const rule = rulesData.fields.find((f) => f.field === fieldName);
  if (!rule) return false;

  if (rule.requirements === 'Yes') return true;

  if (rule.requirements.startsWith('Conditional')) {
    return evaluateCondition(rule.requirements, listing);
  }

  return false;
}

/**
 * Evaluate a conditional requirement string against a listing
 *
 * Examples:
 * - "Conditional: Required if PropertyType = Residential"
 * - "Conditional: Required if CommonInterest IN (StockCooperative, Condop)"
 * - "Conditional: Required if MLSStatus = ComingSoon"
 */
export function evaluateCondition(requirement: string, listing: ListingData): boolean {
  // Extract the condition part after "Conditional:"
  const match = requirement.match(/Conditional:\s*(?:Required\s+)?if\s+(.+)/i);
  if (!match) return false;

  const condition = match[1].trim();

  // Handle "Field = Value"
  const equalMatch = condition.match(/^(\w+)\s*=\s*(.+)$/);
  if (equalMatch) {
    const [, field, value] = equalMatch;
    return String(listing[field]) === value.trim();
  }

  // Handle "Field IN (Value1, Value2, ...)"
  const inMatch = condition.match(/^(\w+)\s+IN\s+\(([^)]+)\)/i);
  if (inMatch) {
    const [, field, valuesStr] = inMatch;
    const values = valuesStr.split(',').map((v) => v.trim());
    return values.includes(String(listing[field]));
  }

  // Handle "Field > 0"
  const gtMatch = condition.match(/^(\w+)\s*>\s*(\d+)$/);
  if (gtMatch) {
    const [, field, threshold] = gtMatch;
    const value = Number(listing[field]);
    return !isNaN(value) && value > Number(threshold);
  }

  // Handle "Field1 = Value1 AND Field2 = Value2"
  if (condition.includes(' AND ')) {
    const parts = condition.split(/\s+AND\s+/i);
    return parts.every((part) => evaluateCondition(`Conditional: if ${part}`, listing));
  }

  // Handle "Field1 = Value1 OR Field2 = Value2"
  if (condition.includes(' OR ')) {
    const parts = condition.split(/\s+OR\s+/i);
    return parts.some((part) => evaluateCondition(`Conditional: if ${part}`, listing));
  }

  // Handle "FieldName is entered" / "FieldName is present"
  if (condition.match(/(\w+)\s+is\s+entered/i)) {
    const field = condition.match(/(\w+)\s+is\s+entered/i)?.[1];
    if (field) {
      const value = listing[field];
      return value !== undefined && value !== null && value !== '';
    }
  }

  return false;
}

/**
 * Get missing required fields for a listing
 */
export function getMissingRequiredFields(listing: ListingData): string[] {
  const missing: string[] = [];

  for (const rule of rulesData.fields) {
    if (isFieldRequired(rule.field, listing)) {
      const value = listing[rule.field];
      if (value === undefined || value === null || value === '') {
        missing.push(rule.field);
      }
    }
  }

  return missing;
}

/**
 * Get conditional violations for a listing
 */
export function getConditionalViolations(listing: ListingData): { field: string; requirement: string }[] {
  const violations: { field: string; requirement: string }[] = [];

  for (const rule of rulesData.fields) {
    if (rule.requirements.startsWith('Conditional')) {
      const shouldBePresent = evaluateCondition(rule.requirements, listing);
      const value = listing[rule.field];
      const isPresent = value !== undefined && value !== null && value !== '';

      if (shouldBePresent && !isPresent) {
        violations.push({
          field: rule.field,
          requirement: rule.requirements,
        });
      }
    }
  }

  return violations;
}

// Log rules version on module load (for debugging)
if (typeof window === 'undefined') {
  // Server-side only
  console.log(
    `[RLS Rules] Loaded version ${rulesData.version} (updated: ${rulesData.lastUpdated})`
  );
}

const dataLoader = {
  getCurrentRLSRules,
  getRulesVersion,
  getRequiredFields,
  getConditionalFields,
  getRelevantRulesForListing,
  getFairHousingProhibitedTerms,
  getNYCBoroughs,
  isFieldRequired,
  evaluateCondition,
  getMissingRequiredFields,
  getConditionalViolations,
};

export default dataLoader;
