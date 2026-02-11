/**
 * RLS Validation Prompt Builder
 *
 * Builds prompts for Claude to validate listings against REBNY RLS rules.
 * Uses the data-loader to get relevant rules for each listing.
 *
 * @module lib/compliance/prompts
 */

import {
  getRelevantRulesForListing,
  getRulesVersion,
  getFairHousingProhibitedTerms,
  type ListingData,
  type RLSField,
} from './data-loader';

/**
 * Base system prompt for REBNY RLS compliance validation
 */
const BASE_SYSTEM_PROMPT = `You are a REBNY RLS compliance validator. Your job is to check real estate listings against the official REBNY RLS Data Rules and RESO Data Dictionary 2.0 standards.

VALIDATION RULES:
1. Check all required fields are present and non-empty
2. Evaluate conditional requirements based on listing context
3. Validate data formats match RESO specifications
4. Flag Fair Housing Act violations in descriptions
5. Verify NYC-specific fields (BuildingTaxLot, borough, etc.)

FAIR HOUSING ACT:
Never allow descriptions containing discriminatory language related to:
- Race, color, national origin
- Religion
- Sex, gender identity, sexual orientation
- Familial status (children, pregnancy)
- Disability
- Age (in housing context)

OUTPUT FORMAT:
You MUST return ONLY valid JSON in this exact structure:
{
  "valid": boolean,
  "errors": [
    {
      "field": "FieldName",
      "code": "MISSING_REQUIRED" | "INVALID_FORMAT" | "CONDITIONAL_REQUIRED" | "FAIR_HOUSING_VIOLATION",
      "message": "Human-readable error message",
      "severity": "error" | "warning"
    }
  ],
  "warnings": [
    {
      "field": "FieldName",
      "code": "BEST_PRACTICE" | "DATA_QUALITY",
      "message": "Human-readable warning message",
      "severity": "warning"
    }
  ],
  "summary": "Brief summary of validation results"
}

IMPORTANT:
- Return ONLY the JSON object, no markdown, no explanation
- "valid" is true only if there are zero errors (warnings are OK)
- Be strict about required fields
- Be helpful with warning messages`;

/**
 * Build a validation prompt for a specific listing
 *
 * @param listing - The listing data to validate
 * @returns Object with system prompt and user message for Claude
 */
export function buildValidationPrompt(listing: ListingData): {
  systemPrompt: string;
  userMessage: string;
} {
  const version = getRulesVersion();
  const relevantRules = getRelevantRulesForListing(listing);
  const prohibitedTerms = getFairHousingProhibitedTerms();

  // Build system prompt with version info
  const systemPrompt = `${BASE_SYSTEM_PROMPT}

RULES VERSION: ${version.version}
LAST UPDATED: ${version.lastUpdated}
NOTE: ${version.note}

FAIR HOUSING PROHIBITED TERMS:
${JSON.stringify(prohibitedTerms, null, 2)}`;

  // Build user message with rules and listing
  const userMessage = `Validate this listing against REBNY RLS rules.

APPLICABLE RULES (${relevantRules.length} rules):
${JSON.stringify(formatRulesForPrompt(relevantRules), null, 2)}

LISTING DATA:
${JSON.stringify(listing, null, 2)}

Return ONLY the validation JSON object.`;

  return { systemPrompt, userMessage };
}

/**
 * Format rules for prompt (simplified view)
 */
function formatRulesForPrompt(
  rules: RLSField[]
): { field: string; requirements: string; description: string }[] {
  return rules.map((rule) => ({
    field: rule.field,
    requirements: rule.requirements,
    description: rule.description,
  }));
}

/**
 * Build a quick validation prompt for a single field
 *
 * @param fieldName - The field to validate
 * @param value - The field value
 * @param listing - Full listing context for conditional evaluation
 */
export function buildFieldValidationPrompt(
  fieldName: string,
  value: unknown,
  listing: ListingData
): { systemPrompt: string; userMessage: string } {
  const version = getRulesVersion();

  const systemPrompt = `You are a REBNY RLS field validator. Check if this field value is valid.

RULES VERSION: ${version.version}

OUTPUT FORMAT (JSON only):
{
  "valid": boolean,
  "error": "Error message if invalid" | null
}`;

  const userMessage = `Validate field "${fieldName}" with value: ${JSON.stringify(value)}

Listing context:
- PropertyType: ${listing.PropertyType || listing.propertyType || 'unknown'}
- CommonInterest: ${listing.CommonInterest || listing.coopCondo || 'unknown'}
- MLSStatus: ${listing.MLSStatus || listing.mlsStatus || 'unknown'}

Return ONLY the validation JSON.`;

  return { systemPrompt, userMessage };
}

/**
 * Build a Fair Housing compliance check prompt
 *
 * @param description - The listing description to check
 */
export function buildFairHousingPrompt(description: string): {
  systemPrompt: string;
  userMessage: string;
} {
  const prohibitedTerms = getFairHousingProhibitedTerms();

  const systemPrompt = `You are a Fair Housing Act compliance checker. Review listing descriptions for discriminatory language.

PROHIBITED CONTENT:
- References to race, color, national origin
- Religious preferences or restrictions
- Gender, sex, sexual orientation preferences
- Familial status discrimination (no children, adults only, etc.)
- Disability discrimination
- Age discrimination in housing context

KNOWN PROHIBITED TERMS:
${JSON.stringify(prohibitedTerms, null, 2)}

OUTPUT FORMAT (JSON only):
{
  "compliant": boolean,
  "violations": [
    {
      "text": "The problematic text found",
      "reason": "Why this violates Fair Housing Act",
      "suggestion": "How to rewrite it compliantly"
    }
  ]
}`;

  const userMessage = `Check this listing description for Fair Housing Act compliance:

"${description}"

Return ONLY the compliance JSON.`;

  return { systemPrompt, userMessage };
}

/**
 * Parse Claude's validation response
 *
 * @param response - Raw response string from Claude
 * @returns Parsed validation result or error
 */
export function parseValidationResponse(response: string): {
  success: boolean;
  result?: {
    valid: boolean;
    errors: Array<{
      field: string;
      code: string;
      message: string;
      severity: 'error' | 'warning';
    }>;
    warnings: Array<{
      field: string;
      code: string;
      message: string;
      severity: 'warning';
    }>;
    summary: string;
  };
  error?: string;
} {
  try {
    // Try to extract JSON from response (in case there's extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, error: 'No JSON found in response' };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (typeof parsed.valid !== 'boolean') {
      return { success: false, error: 'Missing "valid" boolean in response' };
    }

    return {
      success: true,
      result: {
        valid: parsed.valid,
        errors: parsed.errors || [],
        warnings: parsed.warnings || [],
        summary: parsed.summary || '',
      },
    };
  } catch (e) {
    return {
      success: false,
      error: `Failed to parse response: ${e instanceof Error ? e.message : 'Unknown error'}`,
    };
  }
}

/**
 * Build a prompt for generating REBNY-compliant public remarks
 *
 * @param listing - The listing data
 * @param agentNotes - Optional agent notes to incorporate
 */
export function buildPublicRemarksPrompt(
  listing: ListingData,
  agentNotes?: string
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = `You are a real estate copywriter specializing in NYC listings. Write compelling, REBNY RLS-compliant property descriptions.

REQUIREMENTS:
1. Must be factual and accurate to listing data
2. Must comply with Fair Housing Act (no discriminatory language)
3. Highlight key features: location, size, amenities, building features
4. Use professional real estate terminology
5. Keep under 1000 characters for MLS compatibility
6. Do not include:
   - Agent contact information
   - Pricing information (already in listing)
   - Discriminatory language
   - Unverifiable claims

OUTPUT FORMAT (JSON only):
{
  "publicRemarks": "The generated description",
  "characterCount": number
}`;

  const userMessage = `Generate a REBNY-compliant public description for this listing:

${JSON.stringify(listing, null, 2)}

${agentNotes ? `Agent notes to incorporate: "${agentNotes}"` : ''}

Return ONLY the JSON with publicRemarks.`;

  return { systemPrompt, userMessage };
}

const prompts = {
  buildValidationPrompt,
  buildFieldValidationPrompt,
  buildFairHousingPrompt,
  buildPublicRemarksPrompt,
  parseValidationResponse,
};

export default prompts;
