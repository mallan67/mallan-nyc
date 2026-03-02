/**
 * REBNY RLS Validator — Main Entry Point
 *
 * Single-library validator for ALL REBNY RLS feed rules.
 * Strictly follows FIELD AUTHORITY ORDER:
 *   1. UCBA governs everything
 *   2. REBNY RLS rules + fields — RLS TRUMPS ALL
 *   3. RLS overrides RESO/IDX
 *   4. RESO/IDX fills gaps only
 *   5. INTERNAL-ONLY otherwise
 *   6. Fail closed = NON-DISPLAY
 *
 * Usage:
 *   import { validateListing, validatePayload } from '@/lib/rls-validator';
 *   const result = validateListing(payload, { isRental: false });
 */

import type {
  ValidationResult, ValidationIssue, ValidationSummary,
  ListingPayload, ValidatorOptions, ValidationCategory,
} from './types';
import {
  validateMandatoryFields,
  validateConditionalFields,
  validatePicklists,
  validateDistributionGates,
  validateDisplayCascade,
  validateStatusTransition,
  validateComingSoon,
  validateTimingSLA,
  validateAddressSuppression,
  validateFareAct,
  validateResoRenames,
  validateRemovedFields,
  validateCrossFields,
} from './validators';
import { runAllContentScanners } from './content-scanners';

// ─── Re-exports ───────────────────────────────────────────────────────

export * from './types';
export * from './registry';
export * from './validators';
export * from './content-scanners';

// ─── Main Validation Orchestrator ─────────────────────────────────────

/**
 * Validate a listing payload against ALL REBNY RLS rules.
 *
 * Runs all validation suites unless opts.suites is specified.
 * Returns a structured result with issues, summary, and pass/fail.
 */
export function validateListing(
  payload: ListingPayload,
  opts?: ValidatorOptions,
): ValidationResult {
  const allIssues: ValidationIssue[] = [];
  const suites = opts?.suites;

  // Helper: should we run this suite?
  const shouldRun = (cat: ValidationCategory) => !suites || suites.includes(cat);

  // 1. Mandatory Fields (52)
  if (shouldRun('MANDATORY_FIELD')) {
    allIssues.push(...validateMandatoryFields(payload, opts));
  }

  // 2. Conditional Fields (86)
  if (shouldRun('CONDITIONAL_FIELD')) {
    allIssues.push(...validateConditionalFields(payload, opts));
  }

  // 3. Picklist Validation (117 fields, ~2,066 values)
  if (shouldRun('PICKLIST')) {
    allIssues.push(...validatePicklists(payload));
  }

  // 4. Cross-Field Validation
  if (shouldRun('CROSS_FIELD')) {
    allIssues.push(...validateCrossFields(payload, opts));
  }

  // 5. Distribution Gates (6)
  if (shouldRun('DISTRIBUTION_GATE')) {
    const { issues } = validateDistributionGates(payload, opts);
    allIssues.push(...issues);
  }

  // 6. Display Cascade
  if (shouldRun('DISPLAY_CASCADE')) {
    allIssues.push(...validateDisplayCascade(payload));
  }

  // 7. Content Scanners (5 suites)
  if (shouldRun('CONTENT_FAIR_HOUSING') || shouldRun('CONTENT_AGENT_INFO') ||
      shouldRun('CONTENT_OFF_MARKET') || shouldRun('CONTENT_COMPENSATION') ||
      shouldRun('CONTENT_FREE_SERVICES')) {
    allIssues.push(...runAllContentScanners(payload));
  }

  // 8. Status Transitions
  if (shouldRun('STATUS_TRANSITION')) {
    allIssues.push(...validateStatusTransition(payload, opts));
  }

  // 9. Coming Soon Rules (D1-D12)
  if (shouldRun('COMING_SOON')) {
    allIssues.push(...validateComingSoon(payload, opts));
  }

  // 10. Timing / SLA
  if (shouldRun('TIMING_SLA')) {
    allIssues.push(...validateTimingSLA(payload, opts));
  }

  // 11. Address Suppression
  if (shouldRun('ADDRESS_SUPPRESSION')) {
    allIssues.push(...validateAddressSuppression(payload, opts?.feedType));
  }

  // 12. FARE Act (Rentals)
  if (shouldRun('FARE_ACT')) {
    allIssues.push(...validateFareAct(payload, opts));
  }

  // 13. RESO → RLS Renames
  if (shouldRun('RESO_RENAME')) {
    allIssues.push(...validateResoRenames(payload));
  }

  // 14. Removed Fields
  if (shouldRun('REMOVED_FIELD')) {
    allIssues.push(...validateRemovedFields(payload));
  }

  // Build summary
  const summary = buildSummary(allIssues);

  // Strict mode: treat warnings as errors
  const effectiveBlockers = opts?.strict
    ? summary.blockers + summary.errors + summary.warnings
    : summary.blockers;

  return {
    valid: effectiveBlockers === 0,
    issues: allIssues,
    summary,
    timestamp: new Date().toISOString(),
    listingKey: payload.SourceSystemKey as string | undefined,
  };
}

/**
 * Quick validation for a specific suite only.
 */
export function validateSuite(
  payload: ListingPayload,
  suite: ValidationCategory,
  opts?: ValidatorOptions,
): ValidationResult {
  return validateListing(payload, { ...opts, suites: [suite] });
}

/**
 * Validate multiple listings in batch.
 */
export function validateBatch(
  payloads: ListingPayload[],
  opts?: ValidatorOptions,
): { results: ValidationResult[]; batchSummary: ValidationSummary } {
  const results = payloads.map(p => validateListing(p, opts));
  const allIssues = results.flatMap(r => r.issues);
  return {
    results,
    batchSummary: buildSummary(allIssues),
  };
}

// ─── Summary Builder ──────────────────────────────────────────────────

function buildSummary(issues: ValidationIssue[]): ValidationSummary {
  const byCategory: Record<string, number> = {};
  let blockers = 0;
  let errors = 0;
  let warnings = 0;
  let info = 0;

  for (const issue of issues) {
    switch (issue.severity) {
      case 'BLOCKER': blockers++; break;
      case 'ERROR': errors++; break;
      case 'WARNING': warnings++; break;
      case 'INFO': info++; break;
    }
    byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
  }

  return {
    total: issues.length,
    blockers,
    errors,
    warnings,
    info,
    byCategory: byCategory as Record<ValidationCategory, number>,
  };
}
