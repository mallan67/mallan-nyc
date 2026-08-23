/**
 * REBNY RLS Compliance Module
 *
 * This module provides validation and compliance checking for NYC real estate listings
 * against REBNY RLS Data Rules, RESO standards, and Fair Housing regulations.
 *
 * @module lib/compliance
 */

export {
  validateListing,
  validateField,
  getRequiredFields,
  generatePublicRemarks,
  type ValidationResult,
  type RLSRule,
  type ListingData,
} from './rebny-validator';


export {
  getCurrentRLSRules,
  getRulesVersion,
  getRequiredFields as getRequiredRLSFields,
  getConditionalFields,
  getRelevantRulesForListing,
  getFairHousingProhibitedTerms,
  getNYCBoroughs,
  isFieldRequired,
  evaluateCondition,
  getMissingRequiredFields,
  getConditionalViolations,
  type RLSField,
  type RLSRulesData,
} from './data-loader';

export {
  buildValidationPrompt,
  buildFieldValidationPrompt,
  buildFairHousingPrompt,
  buildPublicRemarksPrompt,
  parseValidationResponse,
} from './prompts';

export {
  isDisplayableInIDX,
  canDisplayAddress,
  getComingSoonDate,
  formatComingSoonBadge,
  sanitizeForPublicDisplay,
  shouldRemoveClosedListing,
} from './idx-display-gate';

// Re-export rules for reference
import rlsRules from './rls-rules.json';
export { rlsRules };
