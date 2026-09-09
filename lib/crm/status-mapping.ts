import { lifecycleFromStoredRow } from '@/lib/listings/canonical-lifecycle';
import { MALLAN_TERMINAL_STATUSES, normalizeStoredStatus } from '@/lib/listings/mallan-status';

/**
 * Two-layer CRM status model — ONE MAPPING PER TRANSACTION, resolved to live Cotality StandardStatus tokens.
 *
 * Owner rulings (Maya, 2026-09-08):
 *   - "rental and sale has to have each their own mapping": a sale listing is resolved only through the sale
 *     mapping and a rental only through the rental mapping. No shared vocabulary, no type guard over one.
 *   - Every status consumer works against live Cotality Property.StandardStatus. The canonical (stored) status
 *     is one of the live members — Active, ActiveUnderContract, Canceled (one L), Closed, ComingSoon, Expired,
 *     Hold, Incomplete, Pending, Withdrawn — never a Mallan word. Broker language (Closed → "Sold" on a sale,
 *     "Rented" on a rental; Pending → "In Contract" on a sale) is a LABEL applied per transaction.
 *   - A workflow word resolves to its provider status PLUS the associated Cotality date fact:
 *       Sale Contract Signed → Pending + PurchaseContractDate · Sale Sold → Closed + CloseDate
 *       Rental Rented / Leased → Closed + CloseDate · Expired → Expired + ExpirationDate
 *       Withdrawn → Withdrawn + WithdrawnDate · Canceled → Canceled + CancellationDate · Hold → Hold
 *       Back on Market → Active + BackOnMarketDate
 *     Offer Out / Application Out / Lease Out do NOT map to Pending (an offer or application out leaves the
 *     listing Active). The rental's "Lease Signed Date" is a Mallan internal workflow fact
 *     (`_mallanLeaseSignedDate`) — no exact Cotality rental field exists (contract 2026-09-08); PurchaseContractDate
 *     is never collected on the rental UI.
 *   - UCBA is the compliance source only; every field and token here is a live Cotality contract fact.
 *
 * Layer 1 — the canonical status (the stored `listings.status`): a live StandardStatus token. Controls DB status,
 *   public display, idx_display_yn, the Internet display gates, Featured / Exclusives eligibility, the REBNY
 *   listing URL, syndication / public surfaces.
 * Layer 2 — the transaction's CRM workflow status (what the broker / agent sees on the sale or rental form,
 *   pipeline tracking, deal progress, internal reporting). Stored under `raw_data._crmWorkflowStatus`, never
 *   under a provider-named key and never called MlsStatus.
 *
 * The provider's raw StandardStatus / MlsStatus on a synced row are Cotality facts and are never translated here;
 * the forms show the last provider status read-only ("Last Cotality Status").
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

/** Every canonical status a form can produce (the union of the two transactions' sets) — live StandardStatus tokens. */
export const CANONICAL_STATUSES = [
  'Incomplete',
  'ComingSoon',
  'Active',
  'ActiveUnderContract',
  'Pending',
  'Closed',
  'Withdrawn',
  'Expired',
  'Hold',
  'Canceled',
] as const;

export type CanonicalStatus = typeof CANONICAL_STATUSES[number];

/** The rental's lease-signed date — a Mallan internal workflow fact (no exact Cotality rental field is proven). */
export const MALLAN_LEASE_SIGNED_DATE_KEY = '_mallanLeaseSignedDate' as const;

/** Every date / price fact a status transition may carry (Cotality Property fields + the one Mallan fact). */
export const STATUS_FACT_FIELDS: readonly string[] = Object.freeze([
  'PurchaseContractDate', 'CloseDate', 'ClosePrice', 'ExpirationDate', 'WithdrawnDate', 'CancellationDate',
  'BackOnMarketDate', 'OffMarketDate', 'ActivationDate', MALLAN_LEASE_SIGNED_DATE_KEY,
]);

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// SALE
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The sale listing's canonical statuses. ComingSoon is a sales-only state (UCBA 2026 Art. I §16, compliance). */
export const SALE_CANONICAL_STATUSES = [
  'Incomplete', 'ComingSoon', 'Active', 'ActiveUnderContract', 'Pending', 'Closed', 'Withdrawn', 'Expired', 'Hold', 'Canceled',
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
  Draft: 'Incomplete',
  Future: 'Incomplete',
  ComingSoon: 'ComingSoon',
  Active: 'Active',
  BackOnMarket: 'Active',              // + BackOnMarketDate
  OfferOut: 'Active',                  // an offer out does not change the provider status (never Pending)
  OfferThruUs: 'Active',
  OfferAccepted: 'ActiveUnderContract', // an accepted offer, still on the market (live member)
  OAThruUs: 'ActiveUnderContract',
  ContractOut: 'ActiveUnderContract',   // the contract is out, not signed
  COThruUs: 'ActiveUnderContract',
  ContractSigned: 'Pending',           // + PurchaseContractDate
  ContractSignedThruUs: 'Pending',
  BoardApproved: 'Pending',
  Sold: 'Closed',                      // + CloseDate
  SoldThruUs: 'Closed',
  TempOffMarket: 'Hold',
  PermOffMarket: 'Withdrawn',          // + WithdrawnDate
  Withdrawn: 'Withdrawn',
  Expired: 'Expired',                  // + ExpirationDate
  Hold: 'Hold',
  Cancelled: 'Canceled',               // + CancellationDate (the provider's one-L spelling)
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
  Cancelled: 'Canceled',
};

/** Broker language for a sale's canonical (provider) state. */
const SALE_CANONICAL_LABELS: Readonly<Record<SaleCanonicalStatus, string>> = {
  Incomplete: 'Incomplete',
  ComingSoon: 'Coming Soon',
  Active: 'Active',
  ActiveUnderContract: 'Active Under Contract',
  Pending: 'In Contract',
  Closed: 'Sold',
  Withdrawn: 'Withdrawn',
  Expired: 'Expired',
  Hold: 'Hold',
  Canceled: 'Canceled',
};

/** The Cotality facts a sale status carries (the associated date; the close also carries its price). */
const SALE_STATUS_FACTS: Readonly<Record<SaleCanonicalStatus, readonly string[]>> = {
  Incomplete: [],
  ComingSoon: ['ActivationDate'],
  Active: [],
  ActiveUnderContract: [],
  Pending: ['PurchaseContractDate'],
  Closed: ['CloseDate', 'ClosePrice'],
  Withdrawn: ['WithdrawnDate'],
  Expired: ['ExpirationDate'],
  Hold: [],
  Canceled: ['CancellationDate'],
};

/** Sale workflow transitions (the sale pipeline: offer → contract → board → closing). */
const SALE_TRANSITIONS: Readonly<Record<SaleWorkflowStatus, readonly SaleWorkflowStatus[]>> = {
  Draft: ['Future', 'Active', 'ComingSoon'],
  Future: ['Active', 'ComingSoon', 'Draft'],
  ComingSoon: ['Active', 'Withdrawn'],
  Active: ['OfferOut', 'OfferThruUs', 'BackOnMarket', 'ContractOut', 'COThruUs', 'TempOffMarket', 'Withdrawn', 'Expired', 'Cancelled'],
  BackOnMarket: ['OfferOut', 'OfferThruUs', 'ContractOut', 'COThruUs', 'TempOffMarket', 'Withdrawn', 'Expired', 'Cancelled'],
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
  Incomplete: ['Active', 'ComingSoon'],
  ComingSoon: ['Active', 'Withdrawn', 'Canceled'],
  Active: ['ActiveUnderContract', 'Pending', 'Hold', 'Withdrawn', 'Expired', 'Canceled'],
  ActiveUnderContract: ['Active', 'Pending', 'Hold', 'Withdrawn', 'Canceled'],
  Pending: ['Closed', 'Active', 'Withdrawn', 'Canceled'],
  Hold: ['Active', 'Incomplete'],
  Closed: [], // terminal
  Withdrawn: ['Active', 'Incomplete'],
  Expired: ['Active', 'Incomplete'],
  Canceled: [], // terminal
};

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// RENTAL
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The rental listing's canonical statuses. No ComingSoon (sales only); the close is Closed, labelled Rented. */
export const RENTAL_CANONICAL_STATUSES = [
  'Incomplete', 'Active', 'ActiveUnderContract', 'Pending', 'Closed', 'Withdrawn', 'Expired', 'Hold', 'Canceled',
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
  Draft: 'Incomplete',
  Future: 'Incomplete',
  Active: 'Active',
  BackOnMarket: 'Active',                // + BackOnMarketDate
  AppOut: 'Active',                      // an application out does not change the provider status (never Pending)
  AppThruUs: 'Active',
  AppAccepted: 'ActiveUnderContract',    // an accepted application, still on the market
  AppAcceptedThruUs: 'ActiveUnderContract',
  LeaseOut: 'ActiveUnderContract',       // the lease is out, not signed (never Pending)
  LeaseOutThruUs: 'ActiveUnderContract',
  LeaseSigned: 'Pending',                // + the Mallan lease-signed date
  LeaseSignedThruUs: 'Pending',
  BoardApproved: 'Pending',
  Rented: 'Closed',                      // + CloseDate
  RentedThruUs: 'Closed',
  Leased: 'Closed',
  LeasedThruUs: 'Closed',
  TempOffMarket: 'Hold',
  PermOffMarket: 'Withdrawn',            // + WithdrawnDate
  Withdrawn: 'Withdrawn',
  Expired: 'Expired',                    // + ExpirationDate
  Hold: 'Hold',
  Cancelled: 'Canceled',                 // + CancellationDate
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
  Cancelled: 'Canceled',
};

/** Broker language for a rental's canonical (provider) state. */
const RENTAL_CANONICAL_LABELS: Readonly<Record<RentalCanonicalStatus, string>> = {
  Incomplete: 'Incomplete',
  Active: 'Active',
  ActiveUnderContract: 'Active Under Contract',
  Pending: 'Pending',
  Closed: 'Rented',
  Withdrawn: 'Withdrawn',
  Expired: 'Expired',
  Hold: 'Hold',
  Canceled: 'Canceled',
};

/** The facts a rental status carries. Pending carries the Mallan lease-signed date, never PurchaseContractDate. */
const RENTAL_STATUS_FACTS: Readonly<Record<RentalCanonicalStatus, readonly string[]>> = {
  Incomplete: [],
  Active: [],
  ActiveUnderContract: [],
  Pending: [MALLAN_LEASE_SIGNED_DATE_KEY],
  Closed: ['CloseDate', 'ClosePrice'],
  Withdrawn: ['WithdrawnDate'],
  Expired: ['ExpirationDate'],
  Hold: [],
  Canceled: ['CancellationDate'],
};

/** Rental workflow transitions (the rental pipeline: application → lease → board → rented). */
const RENTAL_TRANSITIONS: Readonly<Record<RentalWorkflowStatus, readonly RentalWorkflowStatus[]>> = {
  Draft: ['Future', 'Active'],
  Future: ['Active', 'Draft'],
  Active: ['AppOut', 'AppThruUs', 'BackOnMarket', 'TempOffMarket', 'Withdrawn', 'Expired', 'Cancelled'],
  BackOnMarket: ['AppOut', 'AppThruUs', 'TempOffMarket', 'Withdrawn', 'Expired', 'Cancelled'],
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
  Incomplete: ['Active'],
  Active: ['ActiveUnderContract', 'Pending', 'Hold', 'Withdrawn', 'Expired', 'Canceled'],
  ActiveUnderContract: ['Active', 'Pending', 'Hold', 'Withdrawn', 'Canceled'],
  Pending: ['Closed', 'Active', 'Withdrawn', 'Canceled'],
  Hold: ['Active', 'Incomplete'],
  Closed: [], // terminal
  Withdrawn: ['Active', 'Incomplete'],
  Expired: ['Active', 'Incomplete'],
  Canceled: [], // terminal
};

/** A workflow word that carries a fact of its own beyond its canonical status (both transactions). */
const WORKFLOW_FACTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  BackOnMarket: ['BackOnMarketDate'],
});

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
  /** The Cotality (or Mallan-internal) facts each canonical status carries. */
  readonly statusFacts: Readonly<Record<string, readonly string[]>>;
  readonly transitions: Readonly<Record<string, readonly CrmWorkflowStatus[]>>;
  readonly canonicalTransitions: Readonly<Record<string, readonly CanonicalStatus[]>>;
  /** This transaction's close: always the provider's Closed; its label is the transaction word. */
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
  statusFacts: SALE_STATUS_FACTS,
  transitions: SALE_TRANSITIONS,
  canonicalTransitions: SALE_CANONICAL_TRANSITIONS,
  closedStatus: 'Closed',
} as const);

export const RENTAL_STATUS_MAPPING: TransactionStatusMapping = Object.freeze({
  transaction: 'rent',
  formKey: 'rentalStatus',
  workflowStatuses: RENTAL_WORKFLOW_STATUSES,
  canonicalStatuses: RENTAL_CANONICAL_STATUSES,
  workflowToCanonical: RENTAL_WORKFLOW_TO_CANONICAL,
  displayLabels: RENTAL_DISPLAY_LABELS,
  canonicalLabels: RENTAL_CANONICAL_LABELS,
  statusFacts: RENTAL_STATUS_FACTS,
  transitions: RENTAL_TRANSITIONS,
  canonicalTransitions: RENTAL_CANONICAL_TRANSITIONS,
  closedStatus: 'Closed',
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

function findWorkflow(mapping: TransactionStatusMapping, trimmed: string): CrmWorkflowStatus | null {
  if (Object.prototype.hasOwnProperty.call(mapping.workflowToCanonical, trimmed)) return trimmed as CrmWorkflowStatus;
  const lower = trimmed.toLowerCase();
  for (const s of mapping.workflowStatuses) if (s.toLowerCase() === lower) return s;
  return null;
}

/**
 * The legacy stored spellings (rows written before the token correction) each transaction may carry: a sale was
 * closed as 'Sold', a rental as 'Rented' / 'Leased'; both drafted as 'Draft' and canceled as 'Cancelled'. A rental
 * spelling on a sale (or a sale spelling on a rental) is not this transaction's and is refused.
 */
const LEGACY_SPELLINGS: Readonly<Record<TransactionType, Readonly<Record<string, CanonicalStatus>>>> = Object.freeze({
  sale: Object.freeze({ Sold: 'Closed', Cancelled: 'Canceled', Draft: 'Incomplete' }),
  rent: Object.freeze({ Rented: 'Closed', Leased: 'Closed', Cancelled: 'Canceled', Draft: 'Incomplete' }),
});

/** A canonical token of this transaction: exact, or this transaction's legacy stored spelling of one. */
function findCanonical(mapping: TransactionStatusMapping, trimmed: string): CanonicalStatus | null {
  if ((mapping.canonicalStatuses as readonly string[]).includes(trimmed)) return trimmed as CanonicalStatus;
  const legacy = LEGACY_SPELLINGS[mapping.transaction];
  if (Object.prototype.hasOwnProperty.call(legacy, trimmed)) return legacy[trimmed];
  const token = normalizeStoredStatus(trimmed);
  if (token && token !== trimmed && (mapping.canonicalStatuses as readonly string[]).includes(token)) {
    // a case variant of a live token (never a legacy spelling of the other transaction)
    const isLegacyWord = Object.prototype.hasOwnProperty.call(LEGACY_SPELLINGS.sale, trimmed) || Object.prototype.hasOwnProperty.call(LEGACY_SPELLINGS.rent, trimmed);
    if (!isLegacyWord && (mapping.canonicalStatuses as readonly string[]).some((c) => c.toLowerCase() === trimmed.toLowerCase())) return token as CanonicalStatus;
  }
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

/** Workflow status → the transaction's canonical (provider) status. Null when the word is not this transaction's. */
export function mapCrmStatusToCanonicalStatus(input: string | null | undefined, listingType: unknown): CanonicalStatus | null {
  const mapping = statusMappingFor(listingType);
  if (!mapping) return null;
  const workflow = normalizeCrmWorkflowStatus(input, listingType);
  return workflow ? mapping.workflowToCanonical[workflow] : null;
}

/**
 * Resolve a requested status for a specific listing through its transaction mapping only: a workflow word of that
 * transaction, an already-canonical token of that transaction, or a legacy stored spelling of one (a row written
 * before the token correction). Everything else — including the other transaction's words — is null (refuse;
 * never default). A workflow word wins over a stored spelling of the same name (sale "Sold" → Closed).
 */
export function resolveCanonicalStatusForListing(requested: unknown, listingType: unknown): CanonicalStatus | null {
  if (typeof requested !== 'string') return null;
  const mapping = statusMappingFor(listingType);
  if (!mapping) return null;
  const trimmed = requested.trim();
  if (!trimmed) return null;
  const workflow = findWorkflow(mapping, trimmed);
  if (workflow) return mapping.workflowToCanonical[workflow];
  return findCanonical(mapping, trimmed);
}

/**
 * The facts a status change must carry for this listing: the canonical status's associated Cotality date (+ price
 * on a close) and the workflow word's own fact (Back on Market → BackOnMarketDate). Empty when none is required;
 * null when the word is not this transaction's.
 */
export function requiredFactsFor(requested: unknown, listingType: unknown): readonly string[] | null {
  if (typeof requested !== 'string') return null;
  const mapping = statusMappingFor(listingType);
  if (!mapping) return null;
  const trimmed = requested.trim();
  const canonical = resolveCanonicalStatusForListing(trimmed, listingType);
  if (!canonical) return null;
  const facts = new Set<string>(mapping.statusFacts[canonical] ?? []);
  const workflow = findWorkflow(mapping, trimmed);
  if (workflow) for (const f of WORKFLOW_FACTS[workflow] ?? []) facts.add(f);
  return [...facts];
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
  const canonical = typeof row.status === 'string' ? findCanonical(mapping, row.status.trim()) : null;
  if (!canonical) return { value: '', label: 'Status unavailable', providerStatus };
  const candidate = raw._crmWorkflowStatus ?? raw[mapping.formKey];
  const word = typeof candidate === 'string' ? candidate.trim() : '';
  const workflow = word ? findWorkflow(mapping, word) : null;
  if (workflow && mapping.workflowToCanonical[workflow] === canonical) {
    return { value: workflow, label: mapping.displayLabels[workflow], providerStatus };
  }
  return { value: canonical, label: mapping.canonicalLabels[canonical] ?? canonical, providerStatus };
}

/**
 * The display projection every status consumer renders (manage listings, portals, dashboards, CMA): the exact
 * provider token the row stores (legacy spellings resolved), its transaction label (Closed → Sold / Rented,
 * Pending → In Contract on a sale), the agent's workflow word when it agrees, and the raw provider status.
 * Off Market (a presence fact) and an unknown state are never invented into a status.
 */
export function statusPresentation(row: {
  status: unknown; listing_type?: unknown; raw_data?: unknown; sync_status?: unknown; terminal_since?: unknown;
}): { status: CanonicalStatus | null; label: string; transaction: TransactionType | null; workflow: string | null; workflowLabel: string | null; providerStatus: string | null; offMarket: boolean } {
  const lifecycle = lifecycleFromStoredRow(row);
  const providerStatus = lifecycle.providerStatus;
  const mapping = statusMappingFor(row.listing_type);
  const transaction = mapping?.transaction ?? null;
  const canonical = mapping && typeof row.status === 'string' ? findCanonical(mapping, row.status.trim()) : null;
  const raw = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data as Record<string, unknown> : {};
  const word = typeof raw._crmWorkflowStatus === 'string' ? raw._crmWorkflowStatus.trim() : '';
  const workflow = mapping && word ? findWorkflow(mapping, word) : null;
  const agrees = !!(workflow && canonical && mapping && mapping.workflowToCanonical[workflow] === canonical);
  if (lifecycle.stage === 'off_market') {
    return { status: canonical, label: lifecycle.label, transaction, workflow: agrees ? workflow : null, workflowLabel: agrees && mapping && workflow ? mapping.displayLabels[workflow] : null, providerStatus, offMarket: true };
  }
  if (!mapping || !canonical) return { status: null, label: 'Status unavailable', transaction, workflow: null, workflowLabel: null, providerStatus, offMarket: false };
  return {
    status: canonical,
    label: mapping.canonicalLabels[canonical] ?? canonical,
    transaction,
    workflow: agrees ? workflow : null,
    workflowLabel: agrees && workflow ? mapping.displayLabels[workflow] : null,
    providerStatus,
    offMarket: false,
  };
}

/** Whether a canonical status is publicly displayed (Active, ComingSoon, ActiveUnderContract). */
export function isPublicDisplayStatus(status: string): boolean {
  return PUBLIC_DISPLAY_STATUSES.has(status);
}

/** Whether a stored status is terminal (no further transitions expected) — provider tokens and legacy spellings. */
export function isTerminalStatus(status: string): boolean {
  const token = normalizeStoredStatus(status);
  return token !== null && MALLAN_TERMINAL_STATUSES.has(token);
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
  const canonical = findCanonical(mapping, status.trim());
  return canonical ? (mapping.canonicalLabels[canonical] ?? canonical) : status;
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
 * the canonical (provider) status to store, the workflow status to persist in raw_data, its display label and
 * the facts the transition must carry.
 */
export function buildStatusPayload(workflowStatus: string, listingType: unknown): {
  canonicalStatus: CanonicalStatus;
  workflowStatus: CrmWorkflowStatus;
  displayLabel: string;
  requiredFacts: readonly string[];
} | { error: string } {
  const mapping = statusMappingFor(listingType);
  if (!mapping) return { error: `Unknown transaction type: ${String(listingType)}` };
  const normalized = findWorkflow(mapping, workflowStatus.trim());
  if (!normalized) return { error: `Unrecognized ${mapping.transaction === 'sale' ? 'sale' : 'rental'} status: ${workflowStatus}` };
  return {
    canonicalStatus: mapping.workflowToCanonical[normalized],
    workflowStatus: normalized,
    displayLabel: mapping.displayLabels[normalized],
    requiredFacts: requiredFactsFor(normalized, listingType) ?? [],
  };
}
