/**
 * REBNY RLS Compliance Module
 *
 * Validation and compliance checking for Mallan listings.
 *   COTALITY LIVE CONTRACT → provider facts · REBNY / UCBA → compliance rules · MALLAN → form / workflow / storage · RESO = vocabulary only.
 *
 * @module lib/compliance
 */

// Reporting wrapper over the canonical contracts (no rule catalogue of its own — see the file header).
export {
  validateListing,
  validateField,
  getRequiredFields,
  generatePublicRemarks,
  NYC_BOROUGHS,
  type ValidationResult,
  type ListingData,
} from './rebny-validator';

export {
  isDisplayableInIDX,
  canDisplayAddress,
  getComingSoonDate,
  formatComingSoonBadge,
  sanitizeForPublicDisplay,
  shouldRemoveClosedListing,
} from './idx-display-gate';

// The former rls-rules.json catalogue is deleted (Packet 2 closure): provider facts are the live
// Cotality contract (lib/cotality/live-contract.ts); REBNY / UCBA rules are REBNY_UCBA_RULES.
export { REBNY_UCBA_RULES } from './rebny-ucba-rules';
