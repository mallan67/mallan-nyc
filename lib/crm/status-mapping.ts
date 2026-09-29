/**
 * Two-layer CRM status model.
 *
 * Layer 1 — Canonical server/public status (RESO-safe):
 *   Controls DB status, public display, idx_display_yn, Internet display
 *   gates, Featured/Exclusives eligibility, public-URL eligibility,
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
  // The live Cotality spelling. `Cancelled` (two Ls) is NOT a Cotality
  // StandardStatus value — Mallan invented it — so it is no longer what the
  // CRM emits. Rows that already carry it keep gating correctly because
  // every terminal set accepts both; see
  // tests/runtime/status-vocabulary-cotality-binding.test.ts.
  'Canceled',
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
  // The workflow status keeps Mallan's own label spelling; what it MAPS TO
  // is the provider value.
  Cancelled: 'Canceled',
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
};

const CANONICAL_SET = new Set<string>(CANONICAL_STATUSES);
const WORKFLOW_SET = new Set<string>(CRM_WORKFLOW_STATUSES);

const PUBLIC_DISPLAY_STATUSES: Set<CanonicalStatus> = new Set([
  'Active',
  'ComingSoon',
  'ActiveUnderContract',
]);

// Typed as string, not CanonicalStatus, on purpose: `Cancelled` is no longer a
// CanonicalStatus (it is not a Cotality value) but it is still what a large
// number of existing rows carry, and no backfill is in scope. A terminal check
// that only knows the new spelling would report a legacy canceled listing as
// non-terminal — the exact silent-miss class this whole correction is about.
const TERMINAL_STATUSES: ReadonlySet<string> = new Set<string>([
  'Sold',
  'Withdrawn',
  'Expired',
  'Canceled',
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
  return TERMINAL_STATUSES.has(status);
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
  Active: ['OfferOut', 'OfferThruUs', 'BackOnMarket', 'ContractOut', 'COThruUs', 'TempOffMarket', 'Withdrawn', 'Expired'],
  BackOnMarket: ['OfferOut', 'OfferThruUs', 'ContractOut', 'COThruUs', 'TempOffMarket', 'Withdrawn', 'Expired'],
  OfferOut: ['Active', 'OfferAccepted', 'OAThruUs', 'BackOnMarket'],
  OfferThruUs: ['Active', 'OfferAccepted', 'OAThruUs', 'BackOnMarket'],
  OfferAccepted: ['ContractOut', 'COThruUs', 'Active', 'BackOnMarket'],
  OAThruUs: ['ContractOut', 'COThruUs', 'Active', 'BackOnMarket'],
  ContractOut: ['ContractSigned', 'ContractSignedThruUs', 'Active', 'BackOnMarket'],
  COThruUs: ['ContractSigned', 'ContractSignedThruUs', 'Active', 'BackOnMarket'],
  ContractSigned: ['BoardApproved', 'Sold', 'SoldThruUs', 'Active', 'BackOnMarket'],
  ContractSignedThruUs: ['BoardApproved', 'Sold', 'SoldThruUs', 'Active', 'BackOnMarket'],
  BoardApproved: ['Sold', 'SoldThruUs', 'Active', 'BackOnMarket'],
  Sold: [],
  SoldThruUs: [],
  TempOffMarket: ['Active', 'BackOnMarket'],
  PermOffMarket: [],
  Withdrawn: ['Active', 'Draft'],
  Expired: ['Active', 'Draft'],
  Hold: ['Active', 'Draft'],
  Cancelled: [],
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
