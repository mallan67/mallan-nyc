/**
 * REBNY RLS Validator — Core Types
 *
 * FIELD AUTHORITY ORDER (ENFORCED):
 *   1. UCBA governs everything
 *   2. REBNY RLS rules + fields — RLS TRUMPS ALL
 *   3. RLS overrides RESO/IDX
 *   4. RESO/IDX fills gaps only
 *   5. INTERNAL-ONLY otherwise
 *   6. Fail closed = NON-DISPLAY
 */

// ─── Severity & Result Types ──────────────────────────────────────────

export type Severity = 'BLOCKER' | 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationIssue {
  code: string;           // e.g. "MF-001" (mandatory field), "DG-003" (distribution gate)
  severity: Severity;
  category: ValidationCategory;
  field?: string;         // RLS field name if applicable
  message: string;
  ucbaRef?: string;       // e.g. "Art. I, Sec. 5(C)"
  ruleId?: string;        // e.g. "C7", "D1", "M1"
  actual?: unknown;
  expected?: unknown;
}

export type ValidationCategory =
  | 'MANDATORY_FIELD'
  | 'CONDITIONAL_FIELD'
  | 'PICKLIST'
  | 'CROSS_FIELD'
  | 'DISTRIBUTION_GATE'
  | 'DISPLAY_CASCADE'
  | 'CONTENT_FAIR_HOUSING'
  | 'CONTENT_AGENT_INFO'
  | 'CONTENT_OFF_MARKET'
  | 'CONTENT_COMPENSATION'
  | 'CONTENT_FREE_SERVICES'
  | 'STATUS_TRANSITION'
  | 'COMING_SOON'
  | 'TIMING_SLA'
  | 'ADDRESS_SUPPRESSION'
  | 'FARE_ACT'
  | 'RESO_RENAME'
  | 'REMOVED_FIELD'
  | 'ATTRIBUTION'
  | 'NY_DOS_ADVERTISING'
  | 'PENALTY';

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  summary: ValidationSummary;
  timestamp: string;
  listingKey?: string;
}

export interface ValidationSummary {
  total: number;
  blockers: number;
  errors: number;
  warnings: number;
  info: number;
  byCategory: Record<ValidationCategory, number>;
}

// ─── RLS Field Types ──────────────────────────────────────────────────

export type FieldRequirement = 'mandatory' | 'conditional' | 'optional';

export interface RlsField {
  name: string;
  description: string;
  lmpAddEdit: boolean;
  lmpSearch: boolean;
  requirement: FieldRequirement;
  conditionalRule?: string;  // Raw condition text from CSV
}

export interface RlsLookup {
  fieldName: string;
  values: string[];
}

// ─── Listing Payload ──────────────────────────────────────────────────

/** The listing payload submitted for validation */
export type ListingPayload = Record<string, unknown>;

/** Property type enum — from RLS */
export type RlsPropertyType = 'Residential' | 'ResidentialLease';

/** MLS Status — the 9 UCBA status types (Section J) */
export type MlsStatus =
  | 'Active'
  | 'ComingSoon'
  | 'Closed'
  | 'Cancelled'
  | 'Withdrawn'
  | 'Pending'
  | 'TemporarilyOffMarket'
  | 'ParticipantOnly'
  | 'OwnerOptOut';

/** Permissions field values */
export type PermissionsValue =
  | 'Public'
  | 'Private (Participant Only)'
  | 'Owner Opt-Out';

// ─── Status Machine Types ─────────────────────────────────────────────

export interface StatusTransition {
  from: MlsStatus;
  to: MlsStatus;
  allowed: boolean;
  requiredFields?: string[];
  blockedForRentals?: boolean;
  blockedForNewDev?: boolean;
}

// ─── Distribution Gate Types ──────────────────────────────────────────

export type GateId =
  | 'OWNER_OPT_OUT'
  | 'PARTICIPANT_ONLY'
  | 'IDX_DISPLAY'
  | 'SYNDICATION'
  | 'COMING_SOON'
  | 'CLOSED_STATUS';

export interface GateResult {
  gate: GateId;
  passed: boolean;
  blocked: boolean;
  reason?: string;
  ucbaRef: string;
}

// ─── Content Scanner Types ────────────────────────────────────────────

export interface ContentScanResult {
  scanner: string;
  field: string;
  violations: ContentViolation[];
}

export interface ContentViolation {
  pattern: string;
  matchedText: string;
  position: number;
  severity: 'HARD_BLOCK' | 'SOFT_WARNING';
  protectedClass?: string;      // For fair housing
  law?: string;                 // e.g. "NYC HRL Title 8"
}

// ─── Coming Soon Types ────────────────────────────────────────────────

export interface ComingSoonValidation {
  eligible: boolean;
  issues: ValidationIssue[];
  daysRemaining?: number;
  activationDate?: string;
}

// ─── Penalty Types ────────────────────────────────────────────────────

export type PenaltyCategory =
  | 'FAIR_HOUSING'
  | 'DATA_QUALITY'
  | 'INCURABLE'
  | 'GENERAL_UCBA'
  | 'QUARTERLY_REJECTION';

export interface PenaltyAssessment {
  category: PenaltyCategory;
  offense: number;       // 1st, 2nd, 3rd, 4th
  fine: number;
  cureperiodDays: number;
  terminationRisk: boolean;
  ucbaRef: string;
}

// ─── RESO Rename Types ────────────────────────────────────────────────

export interface ResoRename {
  resoName: string;
  rlsName: string;
  notes: string;
}

// ─── Validator Options ────────────────────────────────────────────────

export interface ValidatorOptions {
  /** Which validation suites to run */
  suites?: ValidationCategory[];
  /** Property type context (affects conditional rules) */
  propertyType?: RlsPropertyType;
  /** Current MLS status (affects status-conditional fields) */
  currentStatus?: MlsStatus;
  /** Previous MLS status (for transition validation) */
  previousStatus?: MlsStatus;
  /** Feed type context */
  feedType?: 'RLS' | 'IDX' | 'VOW' | 'SYNDICATION';
  /** Portal context for RBAC checks */
  portalType?: 'BROKER_ADMIN' | 'AGENT' | 'BUYER' | 'SELLER' | 'TENANT' | 'LANDLORD';
  /** Whether this is a rental listing */
  isRental?: boolean;
  /** Whether this is a new development */
  isNewDevelopment?: boolean;
  /** Strict mode — treat warnings as errors */
  strict?: boolean;
}

// ─── Borough↔County Mapping ──────────────────────────────────────────

/** Borough → County mapping. Supports both human-readable and RLS picklist formats. */
export const BOROUGH_COUNTY_MAP: Record<string, string[]> = {
  'Manhattan':      ['New York', 'NewYork'],
  'Brooklyn':       ['Kings'],
  'Queens':         ['Queens'],
  'Bronx':          ['Bronx'],
  'Staten Island':  ['Richmond'],
  'StatenIsland':   ['Richmond'],
};

/** County → Borough mapping. Supports both formats. */
export const COUNTY_BOROUGH_MAP: Record<string, string[]> = {
  'New York':  ['Manhattan'],
  'NewYork':   ['Manhattan'],
  'Kings':     ['Brooklyn'],
  'Queens':    ['Queens'],
  'Bronx':     ['Bronx'],
  'Richmond':  ['Staten Island', 'StatenIsland'],
};

// ─── Removed Fields (Aug 2025 — NAR Settlement) ──────────────────────

export const REMOVED_FIELDS = [
  'BuyerAgencyCompensation',
  'BuyerAgencyCompensationType',
  'SubAgencyCompensation',
  'SubAgencyCompensationType',
] as const;
