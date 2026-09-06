/**
 * Two-layer CRM status model.
 *
 * Layer 1 — Canonical server/public status (RESO-safe):
 *   Controls DB status, public display, idx_display_yn, Internet display
 *   gates, Featured/Exclusives eligibility, REBNY listing URL eligibility,
 *   syndication/public surfaces.
 *
 * Layer 2 — Internal CRM workflow status:
 *   Controls what the broker/agent sees in the form/dashboard, pipeline
 *   tracking, deal progress, internal reporting, non-public workflow labels.
 *
 * @module lib/crm/status-mapping
 */

/** Canonical RESO-safe statuses the server accepts */
export const CANONICAL_STATUSES = [
  'Draft',
  'ComingSoon',
  'Active',
  'ActiveUnderContract',
  'Pending',
  'Sold',
  'Withdrawn',
  'Expired',
  'Hold',
  'Cancelled',
  // Rental close (already a stored Mallan status: the status route and the agent page treat
  // 'Rented' as the rental terminal state). Packet 2 closure made the server own the rental
  // workflow → canonical conversion the browser used to do.
  'Rented',
] as const;

export type CanonicalStatus = typeof CANONICAL_STATUSES[number];

/** Rich CRM workflow statuses visible to agents/brokers */
export const CRM_WORKFLOW_STATUSES = [
  'Draft',
  'Future',
  'ComingSoon',
  'Active',
  'BackOnMarket',
  'OfferOut',
  'OfferThruUs',
  'OfferAccepted',
  'OAThruUs',
  'ContractOut',
  'COThruUs',
  'ContractSigned',
  'ContractSignedThruUs',
  'BoardApproved',
  'Sold',
  'SoldThruUs',
  'TempOffMarket',
  'PermOffMarket',
  'Withdrawn',
  'Expired',
  'Hold',
  'Cancelled',
  // Rental workflow (the rental form's own pipeline)
  'AppOut',
  'AppThruUs',
  'AppAccepted',
  'AppAcceptedThruUs',
  'LeaseOut',
  'LeaseOutThruUs',
  'LeaseSigned',
  'LeaseSignedThruUs',
  'Rented',
  'RentedThruUs',
  'Leased',
  'LeasedThruUs',
] as const;

export type CrmWorkflowStatus = typeof CRM_WORKFLOW_STATUSES[number];

/**
 * CRM workflow status → canonical RESO server status.
 *
 * Every workflow status MUST have a mapping. If a status is not here,
 * it cannot be sent to the server.
 */
const WORKFLOW_TO_CANONICAL: Record<CrmWorkflowStatus, CanonicalStatus> = {
  Draft: 'Draft',
  Future: 'Draft',
  ComingSoon: 'ComingSoon',
  Active: 'Active',
  BackOnMarket: 'Active',
  OfferOut: 'ActiveUnderContract',
  OfferThruUs: 'ActiveUnderContract',
  OfferAccepted: 'ActiveUnderContract',
  OAThruUs: 'ActiveUnderContract',
  ContractOut: 'ActiveUnderContract',
  COThruUs: 'ActiveUnderContract',
  ContractSigned: 'Pending',
  ContractSignedThruUs: 'Pending',
  BoardApproved: 'Pending',
  Sold: 'Sold',
  SoldThruUs: 'Sold',
  TempOffMarket: 'Hold',
  PermOffMarket: 'Withdrawn',
  Withdrawn: 'Withdrawn',
  Expired: 'Expired',
  Hold: 'Hold',
  Cancelled: 'Cancelled',
  // Rental workflow → canonical (mirrors the sale pipeline: an application or lease in progress
  // is Pending; a signed-and-closed lease is the rental terminal state Rented).
  AppOut: 'Pending',
  AppThruUs: 'Pending',
  AppAccepted: 'Pending',
  AppAcceptedThruUs: 'Pending',
  LeaseOut: 'Pending',
  LeaseOutThruUs: 'Pending',
  LeaseSigned: 'Pending',
  LeaseSignedThruUs: 'Pending',
  Rented: 'Rented',
  RentedThruUs: 'Rented',
  Leased: 'Rented',
  LeasedThruUs: 'Rented',
};

/** Agent-facing display labels */
const DISPLAY_LABELS: Record<CrmWorkflowStatus, string> = {
  Draft: 'Draft',
  Future: 'Future',
  ComingSoon: 'Coming Soon',
  Active: 'Active',
  BackOnMarket: 'Back On Market',
  OfferOut: 'Offer Out',
  OfferThruUs: 'Offer Thru Us',
  OfferAccepted: 'Offer Accepted',
  OAThruUs: 'OA Thru Us',
  ContractOut: 'Contract Out',
  COThruUs: 'CO Thru Us',
  ContractSigned: 'Contract Signed',
  ContractSignedThruUs: 'Contract Signed Thru Us',
  BoardApproved: 'Board Approved',
  Sold: 'Sold',
  SoldThruUs: 'Sold Thru Us',
  TempOffMarket: 'Temp Off Market',
  PermOffMarket: 'Perm Off Market',
  Withdrawn: 'Withdrawn',
  Expired: 'Expired',
  Hold: 'Hold',
  Cancelled: 'Cancelled',
  AppOut: 'Application Out',
  AppThruUs: 'Application Thru Us',
  AppAccepted: 'Application Accepted',
  AppAcceptedThruUs: 'Application Accepted Thru Us',
  LeaseOut: 'Lease Out',
  LeaseOutThruUs: 'Lease Out Thru Us',
  LeaseSigned: 'Lease Signed',
  LeaseSignedThruUs: 'Lease Signed Thru Us',
  Rented: 'Rented',
  RentedThruUs: 'Rented Thru Us',
  Leased: 'Leased',
  LeasedThruUs: 'Leased Thru Us',
};

const CANONICAL_SET = new Set<string>(CANONICAL_STATUSES);
const WORKFLOW_SET = new Set<string>(CRM_WORKFLOW_STATUSES);

const PUBLIC_DISPLAY_STATUSES: Set<CanonicalStatus> = new Set([
  'Active',
  'ComingSoon',
  'ActiveUnderContract',
]);

const TERMINAL_STATUSES: Set<CanonicalStatus> = new Set([
  'Sold',
  'Rented',
  'Withdrawn',
  'Expired',
  'Cancelled',
]);

/**
 * Normalize any CRM workflow status input to a known value.
 * Returns null if the input is not a recognized status.
 */
export function normalizeCrmWorkflowStatus(input: string | null | undefined): CrmWorkflowStatus | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (WORKFLOW_SET.has(trimmed)) return trimmed as CrmWorkflowStatus;
  const lower = trimmed.toLowerCase();
  for (const s of CRM_WORKFLOW_STATUSES) {
    if (s.toLowerCase() === lower) return s;
  }
  return null;
}

/**
 * Map a CRM workflow status to its canonical RESO server status.
 * Returns null if the input is not a recognized workflow status.
 */
export function mapCrmStatusToCanonicalStatus(input: string | null | undefined): CanonicalStatus | null {
  const normalized = normalizeCrmWorkflowStatus(input);
  if (!normalized) return null;
  return WORKFLOW_TO_CANONICAL[normalized];
}

/**
 * Whether a canonical status should be publicly displayed.
 * Only Active, ComingSoon, and ActiveUnderContract are public.
 */
export function isPublicDisplayStatus(status: string): boolean {
  return PUBLIC_DISPLAY_STATUSES.has(status as CanonicalStatus);
}

/**
 * Whether a canonical status is terminal (no further transitions expected).
 */
export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status as CanonicalStatus);
}

/**
 * Get the agent-facing display label for a CRM workflow status.
 * Falls back to the input string if not recognized.
 */
export function getStatusDisplayLabel(status: string): string {
  const normalized = normalizeCrmWorkflowStatus(status);
  if (normalized) return DISPLAY_LABELS[normalized];
  if (CANONICAL_SET.has(status)) return status;
  return status;
}

/** Valid CRM workflow transitions */
const CRM_TRANSITIONS: Record<CrmWorkflowStatus, CrmWorkflowStatus[]> = {
  Draft: ['Future', 'Active', 'ComingSoon'],
  Future: ['Active', 'ComingSoon', 'Draft'],
  ComingSoon: ['Active', 'Withdrawn'],
  Active: ['OfferOut', 'OfferThruUs', 'BackOnMarket', 'ContractOut', 'COThruUs', 'TempOffMarket', 'Withdrawn', 'Expired', 'AppOut', 'AppThruUs'],
  BackOnMarket: ['OfferOut', 'OfferThruUs', 'ContractOut', 'COThruUs', 'TempOffMarket', 'Withdrawn', 'Expired', 'AppOut', 'AppThruUs'],
  OfferOut: ['Active', 'OfferAccepted', 'OAThruUs', 'BackOnMarket'],
  OfferThruUs: ['Active', 'OfferAccepted', 'OAThruUs', 'BackOnMarket'],
  OfferAccepted: ['ContractOut', 'COThruUs', 'Active', 'BackOnMarket'],
  OAThruUs: ['ContractOut', 'COThruUs', 'Active', 'BackOnMarket'],
  ContractOut: ['ContractSigned', 'ContractSignedThruUs', 'Active', 'BackOnMarket'],
  COThruUs: ['ContractSigned', 'ContractSignedThruUs', 'Active', 'BackOnMarket'],
  ContractSigned: ['BoardApproved', 'Sold', 'SoldThruUs', 'Active', 'BackOnMarket'],
  ContractSignedThruUs: ['BoardApproved', 'Sold', 'SoldThruUs', 'Active', 'BackOnMarket'],
  BoardApproved: ['Sold', 'SoldThruUs', 'Rented', 'RentedThruUs', 'Active', 'BackOnMarket'],
  Sold: [],
  SoldThruUs: [],
  TempOffMarket: ['Active', 'BackOnMarket'],
  PermOffMarket: [],
  Withdrawn: ['Active', 'Draft'],
  Expired: ['Active', 'Draft'],
  Hold: ['Active', 'Draft'],
  Cancelled: [],
  AppOut: ['Active', 'AppAccepted', 'AppAcceptedThruUs', 'BackOnMarket'],
  AppThruUs: ['Active', 'AppAccepted', 'AppAcceptedThruUs', 'BackOnMarket'],
  AppAccepted: ['LeaseOut', 'LeaseOutThruUs', 'LeaseSigned', 'LeaseSignedThruUs', 'Active', 'BackOnMarket'],
  AppAcceptedThruUs: ['LeaseOut', 'LeaseOutThruUs', 'LeaseSigned', 'LeaseSignedThruUs', 'Active', 'BackOnMarket'],
  LeaseOut: ['LeaseSigned', 'LeaseSignedThruUs', 'Active', 'BackOnMarket'],
  LeaseOutThruUs: ['LeaseSigned', 'LeaseSignedThruUs', 'Active', 'BackOnMarket'],
  LeaseSigned: ['BoardApproved', 'Rented', 'RentedThruUs', 'Active', 'BackOnMarket'],
  LeaseSignedThruUs: ['BoardApproved', 'Rented', 'RentedThruUs', 'Active', 'BackOnMarket'],
  Rented: [],
  RentedThruUs: [],
  Leased: [],
  LeasedThruUs: [],
};

/**
 * Check whether a CRM workflow transition is valid and return
 * either null (valid) or an error message (invalid).
 */
export function getStatusTransitionError(
  from: string,
  to: string,
  _context?: { listingType?: string },
): string | null {
  const fromNorm = normalizeCrmWorkflowStatus(from);
  const toNorm = normalizeCrmWorkflowStatus(to);
  if (!fromNorm) return `Unknown current status: ${from}`;
  if (!toNorm) return `Unknown target status: ${to}`;
  const allowed = CRM_TRANSITIONS[fromNorm];
  if (!allowed || !allowed.includes(toNorm)) {
    return `Invalid transition: ${getStatusDisplayLabel(from)} → ${getStatusDisplayLabel(to)}. Allowed: ${(allowed || []).map(getStatusDisplayLabel).join(', ') || 'none (terminal)'}`;
  }
  return null;
}

/**
 * Build the full status payload for API submission.
 * Returns the canonical status to send to the server, plus the
 * workflow status to persist in raw_data for CRM display.
 */
export function buildStatusPayload(workflowStatus: string): {
  canonicalStatus: CanonicalStatus;
  workflowStatus: CrmWorkflowStatus;
  displayLabel: string;
} | { error: string } {
  const normalized = normalizeCrmWorkflowStatus(workflowStatus);
  if (!normalized) {
    return { error: `Unrecognized status: ${workflowStatus}` };
  }
  const canonical = WORKFLOW_TO_CANONICAL[normalized];
  return {
    canonicalStatus: canonical,
    workflowStatus: normalized,
    displayLabel: DISPLAY_LABELS[normalized],
  };
}
