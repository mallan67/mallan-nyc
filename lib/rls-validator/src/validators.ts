/**
 * REBNY RLS Validator — Validation Engines
 *
 * All validators strictly follow RLS TRUMPS ALL authority.
 * Every check is sourced from UCBA 2026 rules, RLS field CSV, or NYC/NYS law.
 * Fail closed: missing data = NON-DISPLAY, missing permission = BLOCKED.
 */

import type {
  ValidationIssue, ListingPayload, MlsStatus, ValidatorOptions,
  GateResult, GateId, StatusTransition, PenaltyAssessment, PenaltyCategory,
  Severity,
} from './types';
import {
  MANDATORY_FIELDS, DISPLAY_CONTROL_FIELDS, RESO_TO_RLS_RENAMES,
  loadFieldRegistry, loadLookupRegistry, getConditionalFields,
} from './registry';
import { BOROUGH_COUNTY_MAP, COUNTY_BOROUGH_MAP, REMOVED_FIELDS } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────

function hasValue(payload: ListingPayload, field: string): boolean {
  const val = payload[field];
  if (val === undefined || val === null) return false;
  if (typeof val === 'string' && val.trim() === '') return false;
  return true;
}

function getString(payload: ListingPayload, field: string): string {
  const val = payload[field];
  if (typeof val === 'string') return val.trim();
  if (val !== undefined && val !== null) return String(val).trim();
  return '';
}

function getBool(payload: ListingPayload, field: string): boolean | null {
  const val = payload[field];
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === 'True' || val === 'TRUE' || val === true) return true;
  if (val === 'false' || val === 'False' || val === 'FALSE' || val === false) return false;
  return null;
}

function getNumber(payload: ListingPayload, field: string): number | null {
  const val = payload[field];
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }
  return null;
}

function issue(
  code: string,
  severity: Severity,
  category: ValidationIssue['category'],
  message: string,
  extra?: Partial<ValidationIssue>,
): ValidationIssue {
  return { code, severity, category, message, ...extra };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. MANDATORY FIELD VALIDATION (52 fields)
//    Source: FIELD-AUTHORITY.md + rebny-rls-property-fields.csv
//    Missing any = RLS rejection
// ═══════════════════════════════════════════════════════════════════════

export function validateMandatoryFields(
  payload: ListingPayload,
  _opts?: ValidatorOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const field of MANDATORY_FIELDS) {
    // OriginalEntryTimestamp and SourceSystemKey are system-set — skip on submission
    if (field === 'OriginalEntryTimestamp' || field === 'SourceSystemKey' || field === 'StandardStatus') {
      continue;
    }

    if (!hasValue(payload, field)) {
      issues.push(issue(
        `MF-${field}`,
        'BLOCKER',
        'MANDATORY_FIELD',
        `Missing mandatory RLS field: ${field}`,
        { field, ucbaRef: 'Exhibit A', ruleId: 'F12' },
      ));
    }
  }

  // ListPrice must be > 0
  if (hasValue(payload, 'ListPrice')) {
    const price = getNumber(payload, 'ListPrice');
    if (price !== null && price <= 0) {
      issues.push(issue(
        'MF-ListPrice-ZERO',
        'BLOCKER',
        'MANDATORY_FIELD',
        'ListPrice must be greater than 0',
        { field: 'ListPrice', actual: price, expected: '> 0' },
      ));
    }
  }

  // StateOrProvince must be "NY"
  if (hasValue(payload, 'StateOrProvince') && getString(payload, 'StateOrProvince') !== 'NY') {
    issues.push(issue(
      'MF-StateOrProvince-NY',
      'BLOCKER',
      'MANDATORY_FIELD',
      'StateOrProvince must be "NY" for REBNY RLS',
      { field: 'StateOrProvince', actual: getString(payload, 'StateOrProvince'), expected: 'NY' },
    ));
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════
// 2. CONDITIONAL FIELD VALIDATION (86 fields)
//    Source: rebny-rls-property-fields.csv "Conditional:" rules
// ═══════════════════════════════════════════════════════════════════════

export function validateConditionalFields(
  payload: ListingPayload,
  opts?: ValidatorOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const status = getString(payload, 'MlsStatus') as MlsStatus;
  const propType = getString(payload, 'PropertyType');
  const isRental = opts?.isRental ?? propType === 'ResidentialLease';

  // ActivationDate — Required if MlsStatus = ComingSoon (D2)
  if (status === 'ComingSoon' && !hasValue(payload, 'ActivationDate')) {
    issues.push(issue(
      'CF-ActivationDate',
      'BLOCKER',
      'CONDITIONAL_FIELD',
      'ActivationDate is required when MlsStatus = ComingSoon',
      { field: 'ActivationDate', ucbaRef: 'Art. I, Sec. 16', ruleId: 'D2' },
    ));
  }

  // AvailabilityDate — Required if PropertyType = ResidentialLease
  if (isRental && !hasValue(payload, 'AvailabilityDate')) {
    issues.push(issue(
      'CF-AvailabilityDate',
      'BLOCKER',
      'CONDITIONAL_FIELD',
      'AvailabilityDate is required for rental listings',
      { field: 'AvailabilityDate' },
    ));
  }

  // CloseDate + ClosePrice — Required when Closed
  if (status === 'Closed') {
    if (!hasValue(payload, 'CloseDate')) {
      issues.push(issue(
        'CF-CloseDate',
        'BLOCKER',
        'CONDITIONAL_FIELD',
        'CloseDate is required when MlsStatus = Closed',
        { field: 'CloseDate', ucbaRef: 'Art. I, Sec. 7', ruleId: 'C12' },
      ));
    }
    if (!hasValue(payload, 'ClosePrice')) {
      issues.push(issue(
        'CF-ClosePrice',
        'BLOCKER',
        'CONDITIONAL_FIELD',
        'ClosePrice is required when MlsStatus = Closed (within 24hrs)',
        { field: 'ClosePrice', ucbaRef: 'Art. I, Sec. 7', ruleId: 'C12' },
      ));
    }
  }

  // CancellationDate — Required when Cancelled
  if (status === 'Cancelled' && !hasValue(payload, 'CancellationDate')) {
    issues.push(issue(
      'CF-CancellationDate',
      'ERROR',
      'CONDITIONAL_FIELD',
      'CancellationDate is required when MlsStatus = Cancelled',
      { field: 'CancellationDate' },
    ));
  }

  // WithdrawnDate — Required when Withdrawn
  if (status === 'Withdrawn' && !hasValue(payload, 'WithdrawnDate')) {
    issues.push(issue(
      'CF-WithdrawnDate',
      'ERROR',
      'CONDITIONAL_FIELD',
      'WithdrawnDate is required when MlsStatus = Withdrawn',
      { field: 'WithdrawnDate' },
    ));
  }

  // OffMarketDate — Required when TemporarilyOffMarket
  if (status === 'TemporarilyOffMarket' && !hasValue(payload, 'OffMarketDate')) {
    issues.push(issue(
      'CF-OffMarketDate',
      'ERROR',
      'CONDITIONAL_FIELD',
      'OffMarketDate is required when MlsStatus = TemporarilyOffMarket',
      { field: 'OffMarketDate' },
    ));
  }

  // PurchaseContractDate — Required when Pending
  if (status === 'Pending' && !hasValue(payload, 'PurchaseContractDate')) {
    issues.push(issue(
      'CF-PurchaseContractDate',
      'ERROR',
      'CONDITIONAL_FIELD',
      'PurchaseContractDate is required when MlsStatus = Pending',
      { field: 'PurchaseContractDate' },
    ));
  }

  // AssociationFee — Required for Condo/Co-op/Condop
  const commonInterest = getString(payload, 'CommonInterest');
  if (['Condominium', 'StockCooperative', 'Condop'].includes(commonInterest)) {
    if (!hasValue(payload, 'AssociationFee')) {
      issues.push(issue(
        'CF-AssociationFee',
        'ERROR',
        'CONDITIONAL_FIELD',
        `AssociationFee is required when CommonInterest = ${commonInterest}`,
        { field: 'AssociationFee' },
      ));
    }
  }

  // Borough↔County match (CityRegion must match CountyOrParish)
  if (hasValue(payload, 'CityRegion') && hasValue(payload, 'CountyOrParish')) {
    const borough = getString(payload, 'CityRegion');
    const county = getString(payload, 'CountyOrParish');
    const validCounties = BOROUGH_COUNTY_MAP[borough];
    const validBoroughs = COUNTY_BOROUGH_MAP[county];

    if (validCounties && !validCounties.includes(county)) {
      issues.push(issue(
        'CF-BoroughCounty',
        'BLOCKER',
        'CROSS_FIELD',
        `CityRegion "${borough}" must match CountyOrParish (expected one of: ${validCounties.join(', ')}, got "${county}")`,
        { field: 'CountyOrParish', actual: county, expected: validCounties[0] },
      ));
    } else if (validBoroughs && !validBoroughs.includes(borough)) {
      issues.push(issue(
        'CF-CountyBorough',
        'BLOCKER',
        'CROSS_FIELD',
        `CountyOrParish "${county}" must match CityRegion (expected one of: ${validBoroughs.join(', ')}, got "${borough}")`,
        { field: 'CityRegion', actual: borough, expected: validBoroughs[0] },
      ));
    }
  }

  // AboveGradeFinishedAreaUnits — Required if AboveGradeFinishedArea is entered
  if (hasValue(payload, 'AboveGradeFinishedArea') && !hasValue(payload, 'AboveGradeFinishedAreaUnits')) {
    issues.push(issue(
      'CF-AboveGradeAreaUnits',
      'ERROR',
      'CONDITIONAL_FIELD',
      'AboveGradeFinishedAreaUnits is required when AboveGradeFinishedArea is entered',
      { field: 'AboveGradeFinishedAreaUnits' },
    ));
  }

  // LivingAreaUnits — Required if LivingArea is entered
  if (hasValue(payload, 'LivingArea') && !hasValue(payload, 'LivingAreaUnits')) {
    issues.push(issue(
      'CF-LivingAreaUnits',
      'ERROR',
      'CONDITIONAL_FIELD',
      'LivingAreaUnits is required when LivingArea is entered',
      { field: 'LivingAreaUnits' },
    ));
  }

  // LotSizeUnits — Required if LotSizeArea is entered
  if (hasValue(payload, 'LotSizeArea') && !hasValue(payload, 'LotSizeUnits')) {
    issues.push(issue(
      'CF-LotSizeUnits',
      'ERROR',
      'CONDITIONAL_FIELD',
      'LotSizeUnits is required when LotSizeArea is entered',
      { field: 'LotSizeUnits' },
    ));
  }

  // AlternateStreet fields — all required if any is present
  const altStreetFields = ['AlternateStreetDirPrefix', 'AlternateStreetDirSuffix', 'AlternateStreetName',
    'AlternateStreetNumber', 'AlternateStreetNumberNumeric', 'AlternateStreetSuffix', 'AlternateUnitNumber'];
  const hasAnyAlt = altStreetFields.some(f => hasValue(payload, f));
  if (hasAnyAlt && !hasValue(payload, 'AlternateStreetName')) {
    issues.push(issue(
      'CF-AltStreetName',
      'ERROR',
      'CONDITIONAL_FIELD',
      'AlternateStreetName is required if any AlternateStreet attributes are submitted',
      { field: 'AlternateStreetName' },
    ));
  }

  // FurnishedListPrice — Required if Furnished != None/Unfurnished
  const furnished = getString(payload, 'Furnished');
  if (furnished && furnished !== 'None' && furnished !== 'Unfurnished') {
    if (!hasValue(payload, 'FurnishedListPrice')) {
      issues.push(issue(
        'CF-FurnishedListPrice',
        'WARNING',
        'CONDITIONAL_FIELD',
        'FurnishedListPrice should be provided when Furnished is set',
        { field: 'FurnishedListPrice' },
      ));
    }
  }

  // FireplacesTotal + FireplaceFeatures — Required if FireplaceYN = true
  if (getBool(payload, 'FireplaceYN') === true) {
    if (!hasValue(payload, 'FireplacesTotal')) {
      issues.push(issue(
        'CF-FireplacesTotal',
        'WARNING',
        'CONDITIONAL_FIELD',
        'FireplacesTotal should be provided when FireplaceYN = true',
        { field: 'FireplacesTotal' },
      ));
    }
  }

  // BathroomsTotal = BathroomsFull + (BathroomsHalf * 0.5)
  if (hasValue(payload, 'BathroomsFull') && hasValue(payload, 'BathroomsHalf') && hasValue(payload, 'BathroomsTotal')) {
    const full = getNumber(payload, 'BathroomsFull') || 0;
    const half = getNumber(payload, 'BathroomsHalf') || 0;
    const total = getNumber(payload, 'BathroomsTotal') || 0;
    const expected = full + (half * 0.5);
    if (Math.abs(total - expected) > 0.01) {
      issues.push(issue(
        'CF-BathroomsTotal-Calc',
        'ERROR',
        'CROSS_FIELD',
        `BathroomsTotal (${total}) should equal BathroomsFull (${full}) + BathroomsHalf * 0.5 (${half * 0.5}) = ${expected}`,
        { field: 'BathroomsTotal', actual: total, expected },
      ));
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════
// 3. PICKLIST VALIDATION (117 fields, ~2,066 values)
//    Source: rebny-rls-property-lookup.csv
// ═══════════════════════════════════════════════════════════════════════

export function validatePicklists(
  payload: ListingPayload,
  dataDir?: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lookups = loadLookupRegistry(dataDir);

  for (const [fieldName, lookup] of lookups) {
    if (!hasValue(payload, fieldName)) continue;

    const rawValue = getString(payload, fieldName);
    // Some fields accept multiple values (comma-separated)
    const values = rawValue.includes(',') ? rawValue.split(',').map(v => v.trim()) : [rawValue];

    for (const val of values) {
      if (!val) continue;
      if (!lookup.values.includes(val)) {
        issues.push(issue(
          `PL-${fieldName}`,
          'ERROR',
          'PICKLIST',
          `Invalid picklist value for ${fieldName}: "${val}". Must be one of ${lookup.values.length} valid values.`,
          { field: fieldName, actual: val },
        ));
      }
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════
// 4. DISTRIBUTION GATES (6 gates — UCBA Section H + Distribution Gates)
//    All 6 gates must pass before public display.
//    Fail closed: missing/null = BLOCKED.
// ═══════════════════════════════════════════════════════════════════════

export function validateDistributionGates(
  payload: ListingPayload,
  opts?: ValidatorOptions,
): { gates: GateResult[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const gates: GateResult[] = [];
  const permissions = getString(payload, 'Permissions');
  const status = getString(payload, 'MlsStatus') as MlsStatus;

  // Gate 1: Owner Opt-Out — Art. I, Sec. 5(A)
  const isOptOut = permissions === 'Owner Opt-Out';
  gates.push({
    gate: 'OWNER_OPT_OUT',
    passed: !isOptOut,
    blocked: isOptOut,
    reason: isOptOut ? 'Owner Opt-Out: ALL fields blocked from ALL channels' : undefined,
    ucbaRef: 'Art. I, Sec. 5(A)',
  });
  if (isOptOut) {
    // Verify no public display flags are True
    for (const flag of DISPLAY_CONTROL_FIELDS) {
      if (getBool(payload, flag) === true) {
        issues.push(issue(
          'DG-OptOut-DisplayFlag',
          'BLOCKER',
          'DISTRIBUTION_GATE',
          `${flag} must be False for Owner Opt-Out listings`,
          { field: flag, ucbaRef: 'Art. I, Sec. 5(A)', ruleId: 'C3' },
        ));
      }
    }
  }

  // Gate 2: Participant Only — Definition (W)
  const isParticipantOnly = permissions === 'Private (Participant Only)' || status === 'ParticipantOnly';
  gates.push({
    gate: 'PARTICIPANT_ONLY',
    passed: !isParticipantOnly,
    blocked: isParticipantOnly,
    reason: isParticipantOnly ? 'Participant Only: RLS only, no public display' : undefined,
    ucbaRef: 'Definition (W)',
  });
  if (isParticipantOnly && isOptOut) {
    issues.push(issue(
      'DG-MutualExclusive',
      'BLOCKER',
      'DISTRIBUTION_GATE',
      'Cannot combine Owner Opt-Out with Participant Only',
      { ucbaRef: 'Definition (W)' },
    ));
  }

  // Gate 3: IDX Display — Art. III, Sec. 2(C)
  const idxDisplay = getBool(payload, 'IDXEntireListingDisplayYN');
  // FAIL CLOSED: null/missing = blocked
  const idxPassed = idxDisplay === true;
  gates.push({
    gate: 'IDX_DISPLAY',
    passed: idxPassed,
    blocked: !idxPassed,
    reason: !idxPassed ? 'IDXEntireListingDisplayYN is not True — excluded from IDX' : undefined,
    ucbaRef: 'Art. III, Sec. 2(C)',
  });

  // Gate 4: Syndication — UCBA General
  const syndicateYN = getBool(payload, 'SyndicateYN');
  const syndicatePassed = syndicateYN === true;
  gates.push({
    gate: 'SYNDICATION',
    passed: syndicatePassed,
    blocked: !syndicatePassed,
    reason: !syndicatePassed ? 'SyndicateYN is not True — excluded from syndication' : undefined,
    ucbaRef: 'UCBA General',
  });

  // Gate 5: Coming Soon — Art. I, Sec. 16
  const isComingSoon = status === 'ComingSoon';
  gates.push({
    gate: 'COMING_SOON',
    passed: true, // Coming Soon listings CAN display, with restrictions
    blocked: false,
    reason: isComingSoon ? 'Coming Soon: display with badge, no showings/open houses' : undefined,
    ucbaRef: 'Art. I, Sec. 16',
  });

  // Gate 6: Closed Status — Art. I, Sec. 6-7
  const isClosed = status === 'Closed';
  gates.push({
    gate: 'CLOSED_STATUS',
    passed: true,
    blocked: false,
    reason: isClosed ? 'Closed: must update within 24hrs, show closing price' : undefined,
    ucbaRef: 'Art. I, Sec. 6-7',
  });

  // Master gate: InternetEntireListingDisplayYN — MUST be checked
  const masterGate = getBool(payload, 'InternetEntireListingDisplayYN');
  if (masterGate === null || masterGate === undefined) {
    issues.push(issue(
      'DG-MasterGate-Missing',
      'BLOCKER',
      'DISTRIBUTION_GATE',
      'InternetEntireListingDisplayYN is missing — fail closed, no public display',
      { field: 'InternetEntireListingDisplayYN' },
    ));
  }

  return { gates, issues };
}

// ═══════════════════════════════════════════════════════════════════════
// 5. DISPLAY CASCADE — InternetEntireListingDisplayYN
//    Source: IDX-VOW-DISPLAY-RULES.md
//    When False → IDX=False, Address=False, AVM=False, Comments=False
// ═══════════════════════════════════════════════════════════════════════

export function validateDisplayCascade(
  payload: ListingPayload,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const masterGate = getBool(payload, 'InternetEntireListingDisplayYN');

  if (masterGate === false) {
    // These must ALL be False when master gate is False
    const cascadeFields = [
      'IDXEntireListingDisplayYN',
      'InternetAddressDisplayYN',
      'InternetAutomatedValuationDisplayYN',
      'InternetConsumerCommentYN',
    ];

    for (const field of cascadeFields) {
      if (getBool(payload, field) === true) {
        issues.push(issue(
          `DC-${field}`,
          'BLOCKER',
          'DISPLAY_CASCADE',
          `${field} must be False when InternetEntireListingDisplayYN = False`,
          { field, actual: true, expected: false },
        ));
      }
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════
// 6. STATUS STATE MACHINE (9 statuses — UCBA Section J)
//    Validates transitions and ensures rental/new dev restrictions
// ═══════════════════════════════════════════════════════════════════════

/** Valid status transitions per UCBA Section J */
const STATUS_TRANSITIONS: StatusTransition[] = [
  // From Active
  { from: 'Active', to: 'Pending', allowed: true },
  { from: 'Active', to: 'Closed', allowed: true },
  { from: 'Active', to: 'Withdrawn', allowed: true },
  { from: 'Active', to: 'Cancelled', allowed: true },
  { from: 'Active', to: 'TemporarilyOffMarket', allowed: true },

  // From ComingSoon
  { from: 'ComingSoon', to: 'Active', allowed: true },
  { from: 'ComingSoon', to: 'Withdrawn', allowed: true },
  { from: 'ComingSoon', to: 'Cancelled', allowed: true },
  { from: 'ComingSoon', to: 'TemporarilyOffMarket', allowed: true },

  // From Pending
  { from: 'Pending', to: 'Active', allowed: true },
  { from: 'Pending', to: 'Closed', allowed: true },
  { from: 'Pending', to: 'Withdrawn', allowed: true },
  { from: 'Pending', to: 'Cancelled', allowed: true },

  // From TemporarilyOffMarket
  { from: 'TemporarilyOffMarket', to: 'Active', allowed: true },
  { from: 'TemporarilyOffMarket', to: 'Cancelled', allowed: true },
  { from: 'TemporarilyOffMarket', to: 'Withdrawn', allowed: true },

  // From Withdrawn
  { from: 'Withdrawn', to: 'Active', allowed: true },
  { from: 'Withdrawn', to: 'Cancelled', allowed: true },

  // From Cancelled
  { from: 'Cancelled', to: 'Active', allowed: true },

  // From ParticipantOnly
  { from: 'ParticipantOnly', to: 'Active', allowed: true },
  { from: 'ParticipantOnly', to: 'Pending', allowed: true },
  { from: 'ParticipantOnly', to: 'Withdrawn', allowed: true },
  { from: 'ParticipantOnly', to: 'Cancelled', allowed: true },

  // Closed is terminal — no transitions out
];

export function validateStatusTransition(
  payload: ListingPayload,
  opts?: ValidatorOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const currentStatus = getString(payload, 'MlsStatus') as MlsStatus;
  const prevStatus = opts?.previousStatus;

  if (!prevStatus || !currentStatus) return issues;
  if (prevStatus === currentStatus) return issues;

  // ── Pre-transition checks (always run, regardless of transition validity) ──

  // Closed is terminal — no transitions out (Section J)
  if (prevStatus === 'Closed') {
    issues.push(issue(
      'ST-ClosedTerminal',
      'BLOCKER',
      'STATUS_TRANSITION',
      'Closed status is terminal — cannot transition to another status',
      { ucbaRef: 'Section J' },
    ));
  }

  // Rental restrictions: ComingSoon NOT allowed for rentals (D1)
  const isRental = opts?.isRental ?? getString(payload, 'PropertyType') === 'ResidentialLease';
  if (currentStatus === 'ComingSoon' && isRental) {
    issues.push(issue(
      'ST-ComingSoon-Rental',
      'BLOCKER',
      'STATUS_TRANSITION',
      'ComingSoon status is NOT allowed for rental listings (UCBA D1: Sales Only)',
      { ruleId: 'D1', ucbaRef: 'Art. I, Sec. 16' },
    ));
  }

  // New Development restrictions: ComingSoon NOT allowed for new dev (D1)
  const isNewDev = opts?.isNewDevelopment ?? getBool(payload, 'NewDevelopmentYN') === true;
  if (currentStatus === 'ComingSoon' && isNewDev) {
    issues.push(issue(
      'ST-ComingSoon-NewDev',
      'BLOCKER',
      'STATUS_TRANSITION',
      'ComingSoon status is NOT allowed for new development listings (UCBA D1)',
      { ruleId: 'D1', ucbaRef: 'Art. I, Sec. 16' },
    ));
  }

  // ── Transition validity check ──

  const transition = STATUS_TRANSITIONS.find(
    t => t.from === prevStatus && t.to === currentStatus
  );

  if (!transition) {
    issues.push(issue(
      'ST-InvalidTransition',
      'BLOCKER',
      'STATUS_TRANSITION',
      `Invalid status transition: ${prevStatus} → ${currentStatus}`,
      { actual: `${prevStatus} → ${currentStatus}`, ucbaRef: 'Section J' },
    ));
  }

  // ── Post-transition info ──

  // DOM reset check: Withdrawn/Cancelled for 30+ consecutive days = DOM resets (A1)
  if ((prevStatus === 'Withdrawn' || prevStatus === 'Cancelled') && currentStatus === 'Active') {
    issues.push(issue(
      'ST-DOMReset',
      'INFO',
      'STATUS_TRANSITION',
      `Reactivating from ${prevStatus} — DOM resets to 0 if off-market 30+ consecutive days (UCBA A1)`,
      { ruleId: 'A1', ucbaRef: 'Art. I, Sec. 11' },
    ));
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════
// 7. COMING SOON RULES (D1-D12)
//    Source: UCBA Section D — ALL incurable violations
//    Sales only, max 14 days, no showings, no open houses, badge required
// ═══════════════════════════════════════════════════════════════════════

export function validateComingSoon(
  payload: ListingPayload,
  opts?: ValidatorOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const status = getString(payload, 'MlsStatus') as MlsStatus;

  if (status !== 'ComingSoon') return issues;

  // D1: Sales only — NOT rentals, NOT new developments
  const isRental = opts?.isRental ?? getString(payload, 'PropertyType') === 'ResidentialLease';
  if (isRental) {
    issues.push(issue(
      'CS-D1-Rental',
      'BLOCKER',
      'COMING_SOON',
      'Coming Soon is sales-only. NOT allowed for rentals.',
      { ruleId: 'D1', ucbaRef: 'Art. I, Sec. 16' },
    ));
  }

  const isNewDev = getBool(payload, 'NewDevelopmentYN') === true;
  if (isNewDev) {
    issues.push(issue(
      'CS-D1-NewDev',
      'BLOCKER',
      'COMING_SOON',
      'Coming Soon is NOT allowed for new developments.',
      { ruleId: 'D1', ucbaRef: 'Art. I, Sec. 16' },
    ));
  }

  // D2: Maximum 14 calendar days
  if (hasValue(payload, 'ActivationDate') && hasValue(payload, 'OnMarketDate')) {
    const activation = new Date(getString(payload, 'ActivationDate'));
    const onMarket = new Date(getString(payload, 'OnMarketDate'));
    const diffMs = activation.getTime() - onMarket.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 14) {
      issues.push(issue(
        'CS-D2-MaxDays',
        'BLOCKER',
        'COMING_SOON',
        `Coming Soon exceeds maximum 14 calendar days (${diffDays} days)`,
        { ruleId: 'D2', ucbaRef: 'Art. I, Sec. 16', actual: diffDays, expected: '<= 14' },
      ));
    }
  }

  // D3: No showings
  // D4: No open houses
  if (hasValue(payload, 'ActiveOpenHouseCount')) {
    const ohCount = getNumber(payload, 'ActiveOpenHouseCount');
    if (ohCount !== null && ohCount > 0) {
      issues.push(issue(
        'CS-D4-OpenHouse',
        'BLOCKER',
        'COMING_SOON',
        'No open houses allowed during Coming Soon status',
        { ruleId: 'D4', ucbaRef: 'Art. I, Sec. 16' },
      ));
    }
  }

  // D7: Badge required — "Coming Soon. No Showings or Open House until [Start Showing Date]"
  // This is a display rule — just verify ActivationDate is present for the badge
  if (!hasValue(payload, 'ActivationDate')) {
    issues.push(issue(
      'CS-D7-Badge',
      'BLOCKER',
      'COMING_SOON',
      'ActivationDate is required for Coming Soon badge display',
      { ruleId: 'D7', ucbaRef: 'Art. I, Sec. 16(C)' },
    ));
  }

  // D10: Owner authorization required (Exhibit G)
  // Can't validate the form itself, but flag the requirement
  issues.push(issue(
    'CS-D10-ExhibitG',
    'INFO',
    'COMING_SOON',
    'Coming Soon requires signed Owner Authorization (Exhibit G)',
    { ruleId: 'D10', ucbaRef: 'Art. I, Sec. 16' },
  ));

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════
// 8. TIMING / SLA ENFORCEMENT
//    C11: Status changes within 24hrs
//    C12: Closing price within 24hrs
//    C13: Closed listings removed in 24hrs
//    A1: DOM reset after 30 days Withdrawn/Cancelled
// ═══════════════════════════════════════════════════════════════════════

export function validateTimingSLA(
  payload: ListingPayload,
  opts?: ValidatorOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const status = getString(payload, 'MlsStatus') as MlsStatus;
  const now = new Date();

  // C12: ClosePrice within 24hrs of CloseDate
  if (status === 'Closed' && hasValue(payload, 'CloseDate')) {
    const closeDate = new Date(getString(payload, 'CloseDate'));
    const hoursSinceClose = (now.getTime() - closeDate.getTime()) / (1000 * 60 * 60);

    if (hoursSinceClose > 24 && !hasValue(payload, 'ClosePrice')) {
      issues.push(issue(
        'TM-C12-ClosePrice',
        'BLOCKER',
        'TIMING_SLA',
        'ClosePrice must be provided within 24 hours of closing',
        { ruleId: 'C12', ucbaRef: 'Art. I, Sec. 7' },
      ));
    }
  }

  // C11: StatusChangeTimestamp should be within 24hrs of actual change
  if (hasValue(payload, 'StatusChangeTimestamp')) {
    const statusChange = new Date(getString(payload, 'StatusChangeTimestamp'));
    const hoursSinceChange = (now.getTime() - statusChange.getTime()) / (1000 * 60 * 60);

    if (hoursSinceChange > 24) {
      issues.push(issue(
        'TM-C11-StatusDelay',
        'WARNING',
        'TIMING_SLA',
        `Status change was ${Math.round(hoursSinceChange)} hours ago — must be within 24hrs (excl. weekends/holidays)`,
        { ruleId: 'C11', ucbaRef: 'Art. I, Sec. 6' },
      ));
    }
  }

  // ExpirationDate must be in the future for active listings
  if (['Active', 'ComingSoon', 'Pending'].includes(status) && hasValue(payload, 'ExpirationDate')) {
    const expDate = new Date(getString(payload, 'ExpirationDate'));
    if (expDate < now) {
      issues.push(issue(
        'TM-ExpiredListing',
        'BLOCKER',
        'TIMING_SLA',
        'ExpirationDate is in the past for an active listing',
        { field: 'ExpirationDate', actual: getString(payload, 'ExpirationDate') },
      ));
    }
  }

  // Coming Soon: max 14 days from OnMarketDate
  if (status === 'ComingSoon' && hasValue(payload, 'OnMarketDate')) {
    const onMarket = new Date(getString(payload, 'OnMarketDate'));
    const daysSinceOnMarket = (now.getTime() - onMarket.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceOnMarket > 14) {
      issues.push(issue(
        'TM-CS-Expired',
        'BLOCKER',
        'TIMING_SLA',
        `Coming Soon has exceeded 14-day maximum (${Math.round(daysSinceOnMarket)} days)`,
        { ruleId: 'D2', ucbaRef: 'Art. I, Sec. 16' },
      ));
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════
// 9. ADDRESS SUPPRESSION
//    When InternetAddressDisplayYN = False:
//    Hide: street number, street name, unit number, full address
//    Show: neighborhood, borough, zip (general location)
// ═══════════════════════════════════════════════════════════════════════

export function validateAddressSuppression(
  payload: ListingPayload,
  feedType?: 'RLS' | 'IDX' | 'VOW' | 'SYNDICATION',
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const addressDisplay = getBool(payload, 'InternetAddressDisplayYN');

  if (addressDisplay === false && feedType && feedType !== 'RLS') {
    // These fields must NOT appear in IDX/VOW/Syndication output
    const suppressedFields = ['StreetNumber', 'StreetName', 'UnitNumber', 'UnParsedAddress'];

    for (const field of suppressedFields) {
      if (hasValue(payload, field)) {
        issues.push(issue(
          `AS-${field}`,
          'BLOCKER',
          'ADDRESS_SUPPRESSION',
          `${field} must be suppressed when InternetAddressDisplayYN = False (current feed: ${feedType})`,
          { field, ucbaRef: 'Art. VIII, Sec. 2', ruleId: 'H10' },
        ));
      }
    }
  }

  // Fail closed: if InternetAddressDisplayYN is missing/null on public feeds
  if (addressDisplay === null && feedType && feedType !== 'RLS') {
    issues.push(issue(
      'AS-MissingFlag',
      'BLOCKER',
      'ADDRESS_SUPPRESSION',
      'InternetAddressDisplayYN is missing — fail closed: address must be suppressed',
      { field: 'InternetAddressDisplayYN' },
    ));
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════
// 10. FARE ACT (NYC LL 119/2024) — Rental only
//     If landlord does NOT pay broker fee →
//       InternetEntireListingDisplayYN = False → cascade
// ═══════════════════════════════════════════════════════════════════════

export function validateFareAct(
  payload: ListingPayload,
  opts?: ValidatorOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isRental = opts?.isRental ?? getString(payload, 'PropertyType') === 'ResidentialLease';

  if (!isRental) return issues;

  // Check OwnerPays field — if broker fee NOT paid by landlord
  const ownerPays = getString(payload, 'OwnerPays');
  const masterGate = getBool(payload, 'InternetEntireListingDisplayYN');

  // FARE Act: if OwnerPays doesn't include broker fee and listing is public
  if (ownerPays && !ownerPays.toLowerCase().includes('broker') && masterGate === true) {
    issues.push(issue(
      'FARE-MasterGate',
      'WARNING',
      'FARE_ACT',
      'FARE Act: If landlord does not pay broker fee, InternetEntireListingDisplayYN should be False',
      { field: 'InternetEntireListingDisplayYN', ucbaRef: 'NYC LL 119/2024' },
    ));
  }

  // FARE Act fee disclosure requirement
  issues.push(issue(
    'FARE-FeeDisclosure',
    'INFO',
    'FARE_ACT',
    'FARE Act: All fees must be disclosed before showing. Use MoveInCosts, OngoingFees, TenantPays, and AdditionalFee fields.',
    { ucbaRef: 'NYC LL 119/2024' },
  ));

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════
// 11. RESO → RLS FIELD RENAME CHECKER
//     23 renames — ensure RLS names are used, not RESO names
// ═══════════════════════════════════════════════════════════════════════

export function validateResoRenames(
  payload: ListingPayload,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const rename of RESO_TO_RLS_RENAMES) {
    if (hasValue(payload, rename.resoName) && !hasValue(payload, rename.rlsName)) {
      issues.push(issue(
        `RN-${rename.resoName}`,
        'ERROR',
        'RESO_RENAME',
        `Using RESO name "${rename.resoName}" — must use RLS name "${rename.rlsName}" (RLS TRUMPS)`,
        { field: rename.resoName, actual: rename.resoName, expected: rename.rlsName },
      ));
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════
// 12. REMOVED FIELD CHECKER (Aug 2025 — NAR Settlement)
// ═══════════════════════════════════════════════════════════════════════

export function validateRemovedFields(
  payload: ListingPayload,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const field of REMOVED_FIELDS) {
    if (hasValue(payload, field)) {
      issues.push(issue(
        `RM-${field}`,
        'BLOCKER',
        'REMOVED_FIELD',
        `Field "${field}" was permanently removed from RLS (Aug 2025, NAR Settlement) — must NOT be submitted`,
        { field },
      ));
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════
// 13. CROSS-FIELD VALIDATION
// ═══════════════════════════════════════════════════════════════════════

export function validateCrossFields(
  payload: ListingPayload,
  opts?: ValidatorOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // PropertyType must be Residential (sale) or ResidentialLease (rental)
  const propType = getString(payload, 'PropertyType');
  if (propType && propType !== 'Residential' && propType !== 'ResidentialLease') {
    issues.push(issue(
      'XF-PropertyType',
      'BLOCKER',
      'CROSS_FIELD',
      `PropertyType must be "Residential" or "ResidentialLease" (got "${propType}")`,
      { field: 'PropertyType', actual: propType },
    ));
  }

  // ListingAgreement must be exclusive (C1: RLS only accepts Exclusive Listings)
  const agreement = getString(payload, 'ListingAgreement');
  if (agreement) {
    const exclusiveTypes = ['ExclusiveRightToSell', 'ExclusiveRightToLease', 'ExclusiveAgency'];
    if (!exclusiveTypes.includes(agreement)) {
      issues.push(issue(
        'XF-ExclusiveOnly',
        'BLOCKER',
        'CROSS_FIELD',
        `RLS only accepts Exclusive Listings (got "${agreement}"). No Open, FSBO, or Ours Alone.`,
        { field: 'ListingAgreement', actual: agreement, ruleId: 'C1', ucbaRef: 'Art. I, Sec. 4' },
      ));
    }
  }

  // Permissions and IDX/Syndicate consistency
  const permissions = getString(payload, 'Permissions');
  if (permissions === 'Owner Opt-Out' || permissions === 'Private (Participant Only)') {
    if (getBool(payload, 'IDXEntireListingDisplayYN') === true) {
      issues.push(issue(
        'XF-Permissions-IDX',
        'BLOCKER',
        'CROSS_FIELD',
        `IDXEntireListingDisplayYN must be False when Permissions = "${permissions}"`,
        { field: 'IDXEntireListingDisplayYN' },
      ));
    }
    if (getBool(payload, 'SyndicateYN') === true) {
      issues.push(issue(
        'XF-Permissions-Syndicate',
        'BLOCKER',
        'CROSS_FIELD',
        `SyndicateYN must be False when Permissions = "${permissions}"`,
        { field: 'SyndicateYN' },
      ));
    }
  }

  // OnMarketDate should not be in the future for Active listings
  const status = getString(payload, 'MlsStatus') as MlsStatus;
  if (status === 'Active' && hasValue(payload, 'OnMarketDate')) {
    const onMarket = new Date(getString(payload, 'OnMarketDate'));
    if (onMarket > new Date()) {
      issues.push(issue(
        'XF-OnMarketDate-Future',
        'WARNING',
        'CROSS_FIELD',
        'OnMarketDate is in the future for an Active listing',
        { field: 'OnMarketDate' },
      ));
    }
  }

  // New Development listings require RUNDBA (K1)
  if (getBool(payload, 'NewDevelopmentYN') === true) {
    const coBroke = getString(payload, 'CoBrokeAgreement');
    if (coBroke && coBroke !== 'RUNDBA') {
      issues.push(issue(
        'XF-NewDev-RUNDBA',
        'WARNING',
        'CROSS_FIELD',
        'New Development listings should use RUNDBA CoBrokeAgreement',
        { field: 'CoBrokeAgreement', ruleId: 'K1', ucbaRef: 'Exhibit D' },
      ));
    }
  }

  // C14: Cannot withdraw if listing remains displayed publicly
  if (status === 'Withdrawn') {
    if (getBool(payload, 'IDXEntireListingDisplayYN') === true ||
        getBool(payload, 'SyndicateYN') === true) {
      issues.push(issue(
        'XF-Withdraw-Public',
        'WARNING',
        'CROSS_FIELD',
        'Withdrawn listing should not have IDX or Syndication enabled (C14: cannot withdraw if displayed publicly)',
        { ruleId: 'C14', ucbaRef: 'Art. I, Sec. 9' },
      ));
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════
// 14. PENALTY ASSESSMENT (Section M)
// ═══════════════════════════════════════════════════════════════════════

export function assessPenalty(
  category: PenaltyCategory,
  offense: number,
): PenaltyAssessment {
  switch (category) {
    case 'FAIR_HOUSING':
      if (offense === 1) return { category, offense, fine: 250, cureperiodDays: 2, terminationRisk: false, ucbaRef: 'M1' };
      return { category, offense, fine: 500, cureperiodDays: 0, terminationRisk: true, ucbaRef: 'M2' };

    case 'DATA_QUALITY':
      if (offense === 1) return { category, offense, fine: 0, cureperiodDays: 3, terminationRisk: false, ucbaRef: 'M3' };
      if (offense === 2) return { category, offense, fine: 250, cureperiodDays: 2, terminationRisk: false, ucbaRef: 'M4' };
      if (offense === 3) return { category, offense, fine: 250, cureperiodDays: 1, terminationRisk: false, ucbaRef: 'M5' };
      return { category, offense, fine: 0, cureperiodDays: 0, terminationRisk: true, ucbaRef: 'M6' };

    case 'INCURABLE':
      if (offense === 1) return { category, offense, fine: 250, cureperiodDays: 0, terminationRisk: false, ucbaRef: 'M7' };
      return { category, offense, fine: 500, cureperiodDays: 0, terminationRisk: false, ucbaRef: 'M8' };

    case 'GENERAL_UCBA':
      if (offense === 1) return { category, offense, fine: 500, cureperiodDays: 0, terminationRisk: false, ucbaRef: 'M9' };
      if (offense === 2) return { category, offense, fine: 2000, cureperiodDays: 0, terminationRisk: false, ucbaRef: 'M10' };
      if (offense === 3) return { category, offense, fine: 10000, cureperiodDays: 0, terminationRisk: false, ucbaRef: 'M11' };
      return { category, offense, fine: 0, cureperiodDays: 0, terminationRisk: true, ucbaRef: 'M12' };

    case 'QUARTERLY_REJECTION':
      return { category, offense, fine: 10000, cureperiodDays: 3, terminationRisk: offense >= 3, ucbaRef: offense >= 3 ? 'M14' : 'M13' };
  }
}
