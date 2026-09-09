import { lifecycleFromStoredRow } from '@/lib/listings/canonical-lifecycle';

/**
 * Two-layer CRM status model — ONE MAPPING PER TRANSACTION.
 *
 * Owner ruling (Maya, 2026-09-08): "rental and sale has to have each their own mapping". A sale listing is
 * resolved only through the sale mapping and a rental listing only through the rental mapping. There is no
 * shared vocabulary and no type guard over one: a rental-only word ("AppAccepted", "Leased", "Rented") does
 * not exist for a sale, and a sale-only word ("OfferOut", "ContractSigned", "Sold") does not exist for a rental.
 *
 * Layer 1 — the Mallan canonical status (the stored `listings.status` of a Mallan-authored row): controls DB
 *   status, public display, idx_display_yn, the Internet display gates, Featured / Exclusives eligibility, the
 *   REBNY listing URL, syndication / public surfaces.
 * Layer 2 — the transaction's CRM workflow status (what the broker / agent sees on the sale or rental form,
 *   pipeline tracking, deal progress, internal reporting). Stored under `raw_data._crmWorkflowStatus`.
 *
 * The provider's StandardStatus / MlsStatus are Cotality facts and are never translated here: a synced row keeps
 * its raw provider status in raw_data and the form shows it read-only ("Last Cotality Status"). The only
 * provider-shaped word each mapping accepts is the form's own hidden saved-state option "Closed", which the
 * transaction resolves to its Mallan close (sale → Sold, rental → Rented). Nothing here defines what a provider
 * status means.
 *
 * @module lib/crm/status-mapping
 */

export type TransactionType = 'sale' | 'rent';

/** The listing's transaction: `listing_type` is stored as 'sale' | 'rent'; the forms also say 'rental'. */
export function transactionTypeOf(listingType: unknown): TransactionType | null {
  if (listingType === 'sale') return 'sale';
  if (listingType === 'rent' || listingType === 'rental') return 'rent';
  return null;
}

/** Every Mallan canonical status a form can produce (the union of the two transactions' sets). */
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
  'Rented',
] as const;

export type CanonicalStatus = typeof CANONICAL_STATUSES[number];

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// SALE
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The sale listing's canonical statuses. ComingSoon is a sales-only state (UCBA 2026 Art. I §16). */
export const SALE_CANONICAL_STATUSES = [
  'Draft', 'ComingSoon', 'Active', 'ActiveUnderContract', 'Pending', 'Sold', 'Withdrawn', 'Expired', 'Hold', 'Cancelled',
] as const;
export type SaleCanonicalStatus = typeof SALE_CANONICAL_STATUSES[number];

/** The sale form's workflow vocabulary (public/crm/SALE-FORM-REDESIGN.html #saleStatus). */
export const SALE_WORKFLOW_STATUSES = [
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
export type SaleWorkflowStatus = typeof SALE_WORKFLOW_STATUSES[number];

const SALE_WORKFLOW_TO_CANONICAL: Readonly<Record<SaleWorkflowStatus, SaleCanonicalStatus>> = {
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
};

const SALE_DISPLAY_LABELS: Readonly<Record<SaleWorkflowStatus, string>> = {
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

/** Broker language for a sale's canonical state (the form's "Saved Listing State" labels). */
const SALE_CANONICAL_LABELS: Readonly<Record<SaleCanonicalStatus, string>> = {
  Draft: 'Draft',
  ComingSoon: 'Coming Soon',
  Active: 'Active',
  ActiveUnderContract: 'Active Under Contract',
  Pending: 'In Contract',
  Sold: 'Sold',
  Withdrawn: 'Withdrawn',
  Expired: 'Expired',
  Hold: 'Hold',
  Cancelled: 'Cancelled',
};

/** Sale workflow transitions (the sale pipeline: offer → contract → board → closing). */
const SALE_TRANSITIONS: Readonly<Record<SaleWorkflowStatus, readonly SaleWorkflowStatus[]>> = {
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

/** Sale canonical transitions — the state machine the status API enforces on a sale listing. */
const SALE_CANONICAL_TRANSITIONS: Readonly<Record<SaleCanonicalStatus, readonly SaleCanonicalStatus[]>> = {
  Draft: ['Active', 'ComingSoon'],
  ComingSoon: ['Active', 'Withdrawn'],
  Active: ['ActiveUnderContract', 'Pending', 'Hold', 'Withdrawn', 'Expired'],
  ActiveUnderContract: ['Active', 'Pending', 'Hold', 'Withdrawn'],
  Pending: ['Sold', 'Active', 'Withdrawn'],
  Hold: ['Active', 'Draft'],
  Sold: [], // terminal
  Withdrawn: ['Active', 'Draft'],
  Expired: ['Active', 'Draft'],
  Cancelled: [], // terminal
};

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// RENTAL
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The rental listing's canonical statuses. No ComingSoon (sales only, UCBA 2026 Art. I §16); the close is Rented. */
export const RENTAL_CANONICAL_STATUSES = [
  'Draft', 'Active', 'ActiveUnderContract', 'Pending', 'Rented', 'Withdrawn', 'Expired', 'Hold', 'Cancelled',
] as const;
export type RentalCanonicalStatus = typeof RENTAL_CANONICAL_STATUSES[number];

/** The rental form's workflow vocabulary (public/crm/RENTAL-FORM-REDESIGN.html #rentalStatus). */
export const RENTAL_WORKFLOW_STATUSES = [
  'Draft',
  'Future',
  'Active',
  'BackOnMarket',
  'AppOut',
  'AppThruUs',
  'AppAccepted',
  'AppAcceptedThruUs',
  'LeaseOut',
  'LeaseOutThruUs',
  'LeaseSigned',
  'LeaseSignedThruUs',
  'BoardApproved',
  'Rented',
  'RentedThruUs',
  'Leased',
  'LeasedThruUs',
  'TempOffMarket',
  'PermOffMarket',
  'Withdrawn',
  'Expired',
  'Hold',
  'Cancelled',
] as const;
export type RentalWorkflowStatus = typeof RENTAL_WORKFLOW_STATUSES[number];

const RENTAL_WORKFLOW_TO_CANONICAL: Readonly<Record<RentalWorkflowStatus, RentalCanonicalStatus>> = {
  Draft: 'Draft',
  Future: 'Draft',
  Active: 'Active',
  BackOnMarket: 'Active',
  // An application or lease in progress is Pending; a signed-and-closed lease is the rental close, Rented.
  AppOut: 'Pending',
  AppThruUs: 'Pending',
  AppAccepted: 'Pending',
  AppAcceptedThruUs: 'Pending',
  LeaseOut: 'Pending',
  LeaseOutThruUs: 'Pending',
  LeaseSigned: 'Pending',
  LeaseSignedThruUs: 'Pending',
  BoardApproved: 'Pending',
  Rented: 'Rented',
  RentedThruUs: 'Rented',
  Leased: 'Rented',
  LeasedThruUs: 'Rented',
  TempOffMarket: 'Hold',
  PermOffMarket: 'Withdrawn',
  Withdrawn: 'Withdrawn',
  Expired: 'Expired',
  Hold: 'Hold',
  Cancelled: 'Cancelled',
};

const RENTAL_DISPLAY_LABELS: Readonly<Record<RentalWorkflowStatus, string>> = {
  Draft: 'Draft',
  Future: 'Future',
  Active: 'Active',
  BackOnMarket: 'Back On Market',
  AppOut: 'Application Out',
  AppThruUs: 'Application Thru Us',
  AppAccepted: 'Application Accepted',
  AppAcceptedThruUs: 'Application Accepted Thru Us',
  LeaseOut: 'Lease Out',
  LeaseOutThruUs: 'Lease Out Thru Us',
  LeaseSigned: 'Lease Signed',
  LeaseSignedThruUs: 'Lease Signed Thru Us',
  BoardApproved: 'Board Approved',
  Rented: 'Rented',
  RentedThruUs: 'Rented Thru Us',
  Leased: 'Leased',
  LeasedThruUs: 'Leased Thru Us',
  TempOffMarket: 'Temp Off Market',
  PermOffMarket: 'Perm Off Market',
  Withdrawn: 'Withdrawn',
  Expired: 'Expired',
  Hold: 'Hold',
  Cancelled: 'Cancelled',
};

/** Broker language for a rental's canonical state (the form's "Saved Listing State" labels). */
const RENTAL_CANONICAL_LABELS: Readonly<Record<RentalCanonicalStatus, string>> = {
  Draft: 'Draft',
  Active: 'Active',
  ActiveUnderContract: 'Active Under Contract',
  Pending: 'Pending',
  Rented: 'Rented',
  Withdrawn: 'Withdrawn',
  Expired: 'Expired',
  Hold: 'Hold',
  Cancelled: 'Cancelled',
};

/** Rental workflow transitions (the rental pipeline: application → lease → board → rented). */
const RENTAL_TRANSITIONS: Readonly<Record<RentalWorkflowStatus, readonly RentalWorkflowStatus[]>> = {
  Draft: ['Future', 'Active'],
  Future: ['Active', 'Draft'],
  Active: ['AppOut', 'AppThruUs', 'BackOnMarket', 'TempOffMarket', 'Withdrawn', 'Expired'],
  BackOnMarket: ['AppOut', 'AppThruUs', 'TempOffMarket', 'Withdrawn', 'Expired'],
  AppOut: ['Active', 'AppAccepted', 'AppAcceptedThruUs', 'BackOnMarket'],
  AppThruUs: ['Active', 'AppAccepted', 'AppAcceptedThruUs', 'BackOnMarket'],
  AppAccepted: ['LeaseOut', 'LeaseOutThruUs', 'LeaseSigned', 'LeaseSignedThruUs', 'Active', 'BackOnMarket'],
  AppAcceptedThruUs: ['LeaseOut', 'LeaseOutThruUs', 'LeaseSigned', 'LeaseSignedThruUs', 'Active', 'BackOnMarket'],
  LeaseOut: ['LeaseSigned', 'LeaseSignedThruUs', 'Active', 'BackOnMarket'],
  LeaseOutThruUs: ['LeaseSigned', 'LeaseSignedThruUs', 'Active', 'BackOnMarket'],
  LeaseSigned: ['BoardApproved', 'Rented', 'RentedThruUs', 'Active', 'BackOnMarket'],
  LeaseSignedThruUs: ['BoardApproved', 'Rented', 'RentedThruUs', 'Active', 'BackOnMarket'],
  BoardApproved: ['Rented', 'RentedThruUs', 'Active', 'BackOnMarket'],
  Rented: [],
  RentedThruUs: [],
  Leased: [],
  LeasedThruUs: [],
  TempOffMarket: ['Active', 'BackOnMarket'],
  PermOffMarket: [],
  Withdrawn: ['Active', 'Draft'],
  Expired: ['Active', 'Draft'],
  Hold: ['Active', 'Draft'],
  Cancelled: [],
};

/** Rental canonical transitions — the state machine the status API enforces on a rental listing. */
const RENTAL_CANONICAL_TRANSITIONS: Readonly<Record<RentalCanonicalStatus, readonly RentalCanonicalStatus[]>> = {
  Draft: ['Active'],
  Active: ['ActiveUnderContract', 'Pending', 'Hold', 'Withdrawn', 'Expired'],
  ActiveUnderContract: ['Active', 'Pending', 'Hold', 'Withdrawn'],
  Pending: ['Rented', 'Active', 'Withdrawn'],
  Hold: ['Active', 'Draft'],
  Rented: [], // terminal
  Withdrawn: ['Active', 'Draft'],
  Expired: ['Active', 'Draft'],
  Cancelled: [], // terminal
};

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// The two mappings
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type CrmWorkflowStatus = SaleWorkflowStatus | RentalWorkflowStatus;

export interface TransactionStatusMapping {
  readonly transaction: TransactionType;
  /** The Mallan form key that carries the workflow status (saleStatus / rentalStatus). */
  readonly formKey: 'saleStatus' | 'rentalStatus';
  readonly workflowStatuses: readonly CrmWorkflowStatus[];
  readonly canonicalStatuses: readonly CanonicalStatus[];
  readonly workflowToCanonical: Readonly<Record<string, CanonicalStatus>>;
  readonly displayLabels: Readonly<Record<string, string>>;
  readonly canonicalLabels: Readonly<Record<string, string>>;
  readonly transitions: Readonly<Record<string, readonly CrmWorkflowStatus[]>>;
  readonly canonicalTransitions: Readonly<Record<string, readonly CanonicalStatus[]>>;
  /**
   * The form's saved-state spellings that are not workflow words: the hidden "Closed" option (this
   * transaction's close), the legacy "Canceled" spelling and the legacy draft marker "Incomplete".
   */
  readonly savedStateAliases: Readonly<Record<string, CanonicalStatus>>;
  /** How the form labels each saved-state spelling (its own option text). */
  readonly savedStateLabels: Readonly<Record<string, string>>;
  /** This transaction's close: Sold (sale) / Rented (rental). */
  readonly closedStatus: CanonicalStatus;
}

export const SALE_STATUS_MAPPING: TransactionStatusMapping = Object.freeze({
  transaction: 'sale',
  formKey: 'saleStatus',
  workflowStatuses: SALE_WORKFLOW_STATUSES,
  canonicalStatuses: SALE_CANONICAL_STATUSES,
  workflowToCanonical: SALE_WORKFLOW_TO_CANONICAL,
  displayLabels: SALE_DISPLAY_LABELS,
  canonicalLabels: SALE_CANONICAL_LABELS,
  transitions: SALE_TRANSITIONS,
  canonicalTransitions: SALE_CANONICAL_TRANSITIONS,
  savedStateAliases: { Closed: 'Sold', Canceled: 'Cancelled', Incomplete: 'Draft' },
  savedStateLabels: { Closed: 'Sold', Canceled: 'Canceled', Incomplete: 'Incomplete' },
  closedStatus: 'Sold',
} as const);

export const RENTAL_STATUS_MAPPING: TransactionStatusMapping = Object.freeze({
  transaction: 'rent',
  formKey: 'rentalStatus',
  workflowStatuses: RENTAL_WORKFLOW_STATUSES,
  canonicalStatuses: RENTAL_CANONICAL_STATUSES,
  workflowToCanonical: RENTAL_WORKFLOW_TO_CANONICAL,
  displayLabels: RENTAL_DISPLAY_LABELS,
  canonicalLabels: RENTAL_CANONICAL_LABELS,
  transitions: RENTAL_TRANSITIONS,
  canonicalTransitions: RENTAL_CANONICAL_TRANSITIONS,
  savedStateAliases: { Closed: 'Rented', Canceled: 'Cancelled', Incomplete: 'Draft' },
  savedStateLabels: { Closed: 'Rented', Canceled: 'Canceled', Incomplete: 'Incomplete' },
  closedStatus: 'Rented',
} as const);

/** The one mapping for a listing's transaction; null when the transaction is unknown (nothing is resolved). */
export function statusMappingFor(listingType: unknown): TransactionStatusMapping | null {
  const t = transactionTypeOf(listingType);
  if (t === 'sale') return SALE_STATUS_MAPPING;
  if (t === 'rent') return RENTAL_STATUS_MAPPING;
  return null;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// Status functions — every one dispatches through the listing's transaction mapping
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const PUBLIC_DISPLAY_STATUSES: ReadonlySet<string> = new Set(['Active', 'ComingSoon', 'ActiveUnderContract']);

// Terminal = no further transitions expected. 'Closed' is the only terminal status the provider delivers
// (374,791 closed rentals alone); it is terminal even though it is not a CRM canonical form value. Departure from
// the feed is a presence fact (sync_status off_feed → Off Market), never a status.
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['Sold', 'Rented', 'Withdrawn', 'Expired', 'Cancelled', 'Closed']);

function findWorkflow(mapping: TransactionStatusMapping, trimmed: string): CrmWorkflowStatus | null {
  if (Object.prototype.hasOwnProperty.call(mapping.workflowToCanonical, trimmed)) return trimmed as CrmWorkflowStatus;
  const lower = trimmed.toLowerCase();
  for (const s of mapping.workflowStatuses) if (s.toLowerCase() === lower) return s;
  return null;
}

/**
 * Normalize a workflow status input against the listing's transaction vocabulary (exact, then case-insensitive).
 * Null when the word is not in THAT transaction's vocabulary — a rental word on a sale is unknown, not guarded.
 */
export function normalizeCrmWorkflowStatus(input: string | null | undefined, listingType: unknown): CrmWorkflowStatus | null {
  if (!input) return null;
  const mapping = statusMappingFor(listingType);
  if (!mapping) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return findWorkflow(mapping, trimmed);
}

/** Workflow status → the transaction's canonical status. Null when the workflow word is not this transaction's. */
export function mapCrmStatusToCanonicalStatus(input: string | null | undefined, listingType: unknown): CanonicalStatus | null {
  const mapping = statusMappingFor(listingType);
  if (!mapping) return null;
  const workflow = normalizeCrmWorkflowStatus(input, listingType);
  return workflow ? mapping.workflowToCanonical[workflow] : null;
}

/**
 * Resolve a requested status for a specific listing through its transaction mapping only: an already-canonical
 * status of that transaction, a saved-state alias of that transaction (Closed → Sold / Rented, Canceled,
 * Incomplete), or a workflow word of that transaction. Everything else — including the other transaction's
 * words — is null (refuse; never default).
 */
export function resolveCanonicalStatusForListing(requested: unknown, listingType: unknown): CanonicalStatus | null {
  if (typeof requested !== 'string') return null;
  const mapping = statusMappingFor(listingType);
  if (!mapping) return null;
  const trimmed = requested.trim();
  if (!trimmed) return null;
  if ((mapping.canonicalStatuses as readonly string[]).includes(trimmed)) return trimmed as CanonicalStatus;
  if (Object.prototype.hasOwnProperty.call(mapping.savedStateAliases, trimmed)) return mapping.savedStateAliases[trimmed];
  const workflow = findWorkflow(mapping, trimmed);
  return workflow ? mapping.workflowToCanonical[workflow] : null;
}

/**
 * The form / viewer projection of an existing listing, computed on the server from the listing's own transaction
 * mapping. Raw Cotality facts remain untouched (`providerStatus` is the raw StandardStatus, read-only on the
 * form). A saved workflow word wins only when it is this transaction's and agrees with the stored canonical state.
 */
export function formStatusForListing(row: {
  status: unknown; listing_type?: unknown; raw_data?: unknown; sync_status?: unknown; terminal_since?: unknown;
}): { value: string; label: string; providerStatus: string | null } {
  const lifecycle = lifecycleFromStoredRow(row);
  const raw = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data as Record<string, unknown> : {};
  // the provider's last verified status, read inside the Cotality boundary (canonical-lifecycle), never here
  const providerStatus = lifecycle.providerStatus;
  if (lifecycle.stage === 'off_market') return { value: '', label: lifecycle.label, providerStatus };
  const mapping = statusMappingFor(row.listing_type);
  if (!mapping) return { value: '', label: 'Status unavailable', providerStatus };
  const canonical = resolveCanonicalStatusForListing(row.status, mapping.transaction);
  if (!canonical) return { value: '', label: 'Status unavailable', providerStatus };
  const candidate = raw._crmWorkflowStatus ?? raw[mapping.formKey];
  const word = typeof candidate === 'string' ? candidate.trim() : '';
  const workflow = word ? findWorkflow(mapping, word) : null;
  if (workflow && mapping.workflowToCanonical[workflow] === canonical) {
    return { value: workflow, label: mapping.displayLabels[workflow], providerStatus };
  }
  // the form's own saved-state spelling (Closed / Canceled / Incomplete) is kept as the agent chose it
  if (word && Object.prototype.hasOwnProperty.call(mapping.savedStateAliases, word) && mapping.savedStateAliases[word] === canonical) {
    return { value: word, label: mapping.savedStateLabels[word] ?? mapping.canonicalLabels[canonical] ?? canonical, providerStatus };
  }
  return { value: canonical, label: mapping.canonicalLabels[canonical] ?? canonical, providerStatus };
}

/** Whether a canonical status is publicly displayed (Active, ComingSoon, ActiveUnderContract). */
export function isPublicDisplayStatus(status: string): boolean {
  return PUBLIC_DISPLAY_STATUSES.has(status);
}

/** Whether a stored status is terminal (no further transitions expected). */
export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * The agent-facing label for a workflow or canonical status of the listing's transaction.
 * Falls back to the input string when the word is not this transaction's.
 */
export function getStatusDisplayLabel(status: string, listingType: unknown): string {
  const mapping = statusMappingFor(listingType);
  if (!mapping) return status;
  const workflow = findWorkflow(mapping, status.trim());
  if (workflow) return mapping.displayLabels[workflow];
  return mapping.canonicalLabels[status.trim()] ?? status;
}

/**
 * Validate a CRM workflow transition on the listing's transaction pipeline.
 * Null = valid; otherwise the error message.
 */
export function getStatusTransitionError(from: string, to: string, listingType: unknown): string | null {
  const mapping = statusMappingFor(listingType);
  if (!mapping) return `Unknown transaction type: ${String(listingType)}`;
  const fromNorm = findWorkflow(mapping, from.trim());
  const toNorm = findWorkflow(mapping, to.trim());
  if (!fromNorm) return `Unknown current status: ${from}`;
  if (!toNorm) return `Unknown target status: ${to}`;
  const allowed = mapping.transitions[fromNorm] ?? [];
  if (!allowed.includes(toNorm)) {
    const label = (s: string) => getStatusDisplayLabel(s, listingType);
    return `Invalid transition: ${label(from)} → ${label(to)}. Allowed: ${allowed.map(label).join(', ') || 'none (terminal)'}`;
  }
  return null;
}

/**
 * The canonical statuses a listing may move to from its current stored status, per its transaction's state
 * machine (the status API). Null when the transaction or the current status is unknown to that transaction.
 */
export function allowedCanonicalTransitions(from: unknown, listingType: unknown): readonly CanonicalStatus[] | null {
  const mapping = statusMappingFor(listingType);
  if (!mapping) return null;
  const current = resolveCanonicalStatusForListing(from, listingType);
  if (!current) return null;
  return mapping.canonicalTransitions[current] ?? null;
}

/**
 * Build the full status payload for API submission from a workflow word of the listing's transaction:
 * the canonical status to store, the workflow status to persist in raw_data, and its display label.
 */
export function buildStatusPayload(workflowStatus: string, listingType: unknown): {
  canonicalStatus: CanonicalStatus;
  workflowStatus: CrmWorkflowStatus;
  displayLabel: string;
} | { error: string } {
  const mapping = statusMappingFor(listingType);
  if (!mapping) return { error: `Unknown transaction type: ${String(listingType)}` };
  const normalized = findWorkflow(mapping, workflowStatus.trim());
  if (!normalized) return { error: `Unrecognized ${mapping.transaction === 'sale' ? 'sale' : 'rental'} status: ${workflowStatus}` };
  return {
    canonicalStatus: mapping.workflowToCanonical[normalized],
    workflowStatus: normalized,
    displayLabel: mapping.displayLabels[normalized],
  };
}
