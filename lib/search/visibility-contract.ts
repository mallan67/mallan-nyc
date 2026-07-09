/**
 * visibility-contract — Backend-Search-0.
 *
 * The single audience-aware status/source visibility rule for the search /
 * report system. This is an AGENT INTELLIGENCE BACKEND: the full listing
 * lifecycle is retained; only *what each audience sees and how it is labeled*
 * varies. Public restrictions never limit agent/internal/report access.
 *
 * Provider field data is pulled from the Cotality API; ACRIS is the separate
 * public-record source for closed-sale history; Mallan exclusive/internal is
 * company data.
 *
 * Rules encoded here:
 *  - Public: active-family displayable; **closed_sold ONLY when source = ACRIS**
 *    (MLS/Cotality closed prices blocked publicly); **closed_rented never shown
 *    as public sale history**; off-market / withdrawn / canceled / expired not
 *    public. Sold and rented are never collapsed.
 *  - Agent / internal_report: **full lifecycle, all sources** (active, pending,
 *    temp off-market, withdrawn, canceled, expired, closed_sold, closed_rented)
 *    — comps / prospecting / report intelligence preserved. Closed rows carry
 *    source / status / transaction labels.
 *  - Client (portal / agent-curated report): allowed with labels.
 *
 * Pure and side-effect-free — no prisma, no network, no fs — so every branch is
 * unit-testable.
 */

export type Audience = 'public' | 'client' | 'agent' | 'internal_report';
export type LifecycleStatus =
  | 'active'
  | 'pending'
  | 'temp_off_market'
  | 'withdrawn'
  | 'canceled'
  | 'expired'
  | 'closed_sold'
  | 'closed_rented';
export type TransactionType = 'sale' | 'rental';
/** mls = Cotality API (provider MLS feed) · acris = NYC public record · mallan_exclusive/internal = company data */
export type Source = 'acris' | 'mls' | 'mallan_exclusive' | 'internal';
export type Usage = 'search' | 'comp' | 'prospecting' | 'report' | 'alert';

export interface VisibilityInput {
  audience: Audience;
  status: LifecycleStatus;
  transactionType: TransactionType;
  source: Source;
  usage: Usage;
}

export interface VisibilityDecision {
  allowed: boolean;
  requiresSourceLabel: boolean;
  requiresStatusLabel: boolean;
  /** sold vs rented must always be labeled on closed rows — never collapsed. */
  requiresTransactionLabel: boolean;
  /** "Listing Courtesy of {office}" for Cotality-API/MLS-sourced rows. */
  requiresAttribution: boolean;
  reason: string;
}

export function isClosed(status: LifecycleStatus): boolean {
  return status === 'closed_sold' || status === 'closed_rented';
}

function decide(allowed: boolean, input: VisibilityInput, reason: string): VisibilityDecision {
  const closed = isClosed(input.status);
  return {
    allowed,
    requiresSourceLabel: allowed && closed,
    requiresStatusLabel: allowed && closed,
    requiresTransactionLabel: allowed && closed,
    requiresAttribution: allowed && input.source === 'mls',
    reason,
  };
}

/**
 * The one decision function every search/report surface calls. Fail-closed for
 * the public audience; full access for agent/internal_report.
 */
export function resolveVisibility(input: VisibilityInput): VisibilityDecision {
  const { audience, status, source } = input;

  // Agent + internal report = full lifecycle intelligence, all sources.
  if (audience === 'agent' || audience === 'internal_report') {
    return decide(true, input, `${audience}: full lifecycle access`);
  }

  // Client (portal / agent-curated report) = allowed, labeled.
  if (audience === 'client') {
    return decide(true, input, 'client: agent-curated, labeled');
  }

  // Public website — the most restricted audience.
  switch (status) {
    case 'active':
    case 'pending':
      return decide(true, input, 'public: active-family displayable');
    case 'closed_sold':
      return source === 'acris'
        ? decide(true, input, 'public: ACRIS public-record closed sale')
        : decide(false, input, 'public: MLS/Cotality closed sale price blocked (requires verified display rights)');
    case 'closed_rented':
      return decide(false, input, 'public: closed rentals are not public sale history');
    default:
      // temp_off_market | withdrawn | canceled | expired
      return decide(false, input, `public: ${status} not publicly displayed`);
  }
}

/**
 * Normalize a Cotality API `StandardStatus` (+ transaction type) into a canonical
 * lifecycle bucket. `transactionType` is what keeps closed_sold ≠ closed_rented.
 * Unknown/blank status defaults to 'active' (matching the provider mapper's
 * `StandardStatus || 'Active'` convention); the public branch of resolveVisibility
 * is what enforces safety, not this normalization.
 */
export function toLifecycleStatus(standardStatus: string, transactionType: TransactionType): LifecycleStatus {
  const s = (standardStatus || '').trim().toLowerCase().replace(/\s+/g, ' ');
  switch (s) {
    case 'active':
    case 'coming soon':
    case 'comingsoon':
      return 'active';
    case 'active under contract':
    case 'activeundercontract':
    case 'under contract':
    case 'pending':
      return 'pending';
    case 'hold':
    case 'temp off market':
    case 'temporarily off market':
    case 'temp off-market':
      return 'temp_off_market';
    case 'withdrawn':
      return 'withdrawn';
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    case 'expired':
      return 'expired';
    case 'closed':
    case 'sold':
    case 'leased':
    case 'rented':
      return transactionType === 'rental' ? 'closed_rented' : 'closed_sold';
    default:
      return 'active';
  }
}
