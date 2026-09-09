/**
 * CANONICAL LIFECYCLE — the ONE interpretation of the REBNY IDX Plus feed's transaction state.
 *
 * Declared by Maya 2026-09-08 on the whole-corpus census (591,599 rows, no sampling;
 * docs/operations/evidence-2026-09-08/transaction-state/transaction-state-census.md):
 *
 *   StandardStatus delivered   = {Active, Pending, ComingSoon, Closed} — the other seven published members
 *                                (ActiveUnderContract, Canceled, Delete, Expired, Hold, Incomplete, Withdrawn)
 *                                never arrive. MlsStatus / PreviousStandardStatus are provider-suppressed (null).
 *   In Contract                = StandardStatus Pending. PurchaseContractDate is on 100 % of Pending sale rows
 *                                (98 % rental); MajorChangeType is Pending (5,084) or ActiveUnderContract (35).
 *                                ContractStatusChangeDate is on 100 % of rows in EVERY status — it is the day of
 *                                the last contractual status change (the Coming Soon clock's start), not a
 *                                contract date. PendingTimestamp is the status-change timestamp (equals
 *                                PurchaseContractDate on 61 % of Pending sales), never a contract date.
 *   DOM                        = TWO clocks (Maya 2026-09-08), computed in lib/compliance/dom-tracker.ts from the
 *                                `contractEvents` this module preserves verbatim (the raw provider dates are never
 *                                merged with a Mallan clock). The provider's DaysOnMarket is null on every sampled
 *                                row of this feed and is not an input.
 *   Closed                     = a sale that sold (Residential) or a rental that leased (ResidentialLease).
 *                                CloseDate on 100 %; OffMarketDate always equals CloseDate.
 *   Back on Market             = StandardStatus Active with MajorChangeType BackOnMarket (+ BackOnMarketDate).
 *   Accepted offer (signal)    = StandardStatus Active with a PurchaseContractDate (172 sale / 7 rental rows).
 *   Left the feed              = no provider fact at all. Withdrawn / Canceled / Expired / Hold are NEVER
 *                                delivered; the listing disappears and only key reconciliation sees it. Mallan
 *                                keeps the LAST VERIFIED provider status in `listings.status`, records the presence
 *                                fact in `listings.sync_status` (OFF_FEED_SYNC_STATUS) and shows the broker-facing
 *                                Mallan state "Off Market" (Maya 2026-09-08). Never a manufactured Withdrawn /
 *                                Canceled / Expired / Hold, and never a new canonical status: the raw provider fact
 *                                and the Mallan display state stay separate. A verified provider state that arrives
 *                                later replaces the presence fact (the reconciler and the incremental sync both do).
 *
 * Labels are broker language (Maya): Active · Coming Soon · In Contract · Sold · Rented · Off Market (the Mallan
 * presence state, broker-facing) · Temporarily Off Market (the provider's Hold, if it ever arrives). No
 * PROVIDER-status label is the bare "Off Market"; UCBA Art. I §5(D) governs advertising copy, and an Off Market
 * row is never publicly displayable. In Contract listings are publicly displayable — the IDX Plus feed delivers
 * them under Permission IDX (5,590 live rows).
 *
 * This module is INSIDE the Cotality interpretation boundary (data/cotality-contract/boundary.json). Every
 * other reader consumes its output; none re-derives a status from a date, a MajorChangeType or a name.
 */
import type { CotalityRow } from '@/lib/cotality/contract';
import { isCotalityStandardStatus } from '@/lib/cotality/live-contract';
import { contractSignedDate } from '@/lib/compliance/dom-tracker';

/**
 * Mallan presence fact in `listings.sync_status`: the listing is no longer present on the current Cotality feed and
 * the provider delivered no verified reason. The provider status column is NOT rewritten.
 */
export const OFF_FEED_SYNC_STATUS = 'off_feed' as const;
/** Broker-facing Mallan display state for an off-feed listing (Maya's terminology). Not a status, not a provider value. */
export const OFF_MARKET_LABEL = 'Off Market' as const;
/** Is the row on the current feed? `unknown` when the stored row carries no usable sync_status (e.g. a Mallan-authored draft). */
export type FeedPresence = 'on_feed' | 'off_feed' | 'unknown';

export type TransactionType = 'sale' | 'rental';

/**
 * The provider's contract-event dates, preserved verbatim (YYYY-MM-DD) and separately from any Mallan clock.
 * Every field is null when the provider did not deliver it — never derived from another date.
 */
export interface ContractEvents {
  /** OnMarketDate — RESO "the date the listing was placed on market"; on this feed the listing's entry / contract day. */
  onMarketDate: string | null;
  /** ActivationDate — REBNY's First Showing Date (Trestle 2026-03-19); the day a Coming Soon listing goes live. */
  activationDate: string | null;
  listingContractDate: string | null;
  /** The OriginalEntryTimestamp day. */
  originalEntryDate: string | null;
  /** ContractStatusChangeDate — the day of the last contractual status change (100 % populated). */
  contractStatusChangeDate: string | null;
  purchaseContractDate: string | null;
  /** The PendingTimestamp day — when the provider marked the row Pending (a status change, not a contract). */
  pendingDate: string | null;
  backOnMarketDate: string | null;
  closeDate: string | null;
  offMarketDate: string | null;
}
export type LifecycleStage =
  | 'active'
  | 'coming_soon'
  | 'in_contract'
  | 'closed'
  | 'temp_off_market'
  | 'withdrawn'
  | 'cancelled'
  | 'expired'
  | 'off_market'
  | 'draft'
  | 'unknown';

export interface ListingLifecycle {
  /** The `listings.status` value (Mallan storage vocabulary) — the last verified provider status, never rewritten by presence. */
  storageStatus: string;
  /** Stage of the last verified provider status (the raw fact), independent of feed presence. */
  providerStage: LifecycleStage;
  /** Feed presence (the Mallan fact from `listings.sync_status`); a provider row is always on the feed. */
  presence: FeedPresence;
  /** Day the row was recorded off the feed (`terminal_since`); null unless off the feed. */
  offFeedSince: string | null;
  /** Mallan display stage: the provider stage, or `off_market` when an on-market row is off the feed. */
  stage: LifecycleStage;
  transactionType: TransactionType | null;
  /** Broker-language label; '' for unknown (fail-closed, never fabricated). */
  label: string;
  publiclyDisplayable: boolean;
  inContract: boolean;
  /** The contract-signed date per the ONE DOM rule (lib/compliance/dom-tracker.ts contractSignedDate); null when the provider delivered none — never PendingTimestamp. */
  inContractSince: string | null;
  backOnMarket: boolean;
  backOnMarketDate: string | null;
  closedDate: string | null;
  /**
   * The provider's ClosePrice (REBNY's Sold / Leased price) on a closed row, when it is a positive number; null
   * otherwise. Read here, inside the Cotality boundary, so a valuation consumer never touches the raw key.
   */
  closePrice: number | null;
  /**
   * The provider's StandardStatus retained verbatim in raw_data (the "Last Cotality Status" a form shows read-only);
   * null when the row carries none — a Mallan-authored listing has no provider status.
   */
  providerStatus: string | null;
  /** Active with a PurchaseContractDate — an accepted offer not yet marked Pending by the provider. */
  acceptedOfferSignal: boolean;
  /** PriceChangeTimestamp verbatim (the provider dates the last price change; 361,678 rows carry it); null when none. */
  priceChangeTimestamp: string | null;
  /** The provider's contract-event dates, preserved verbatim and separately from every Mallan clock. */
  contractEvents: ContractEvents;
}

/** Stages a public consumer may see (Maya 2026-09-08: In Contract stays public). */
export const PUBLIC_DISPLAY_STAGES: ReadonlySet<LifecycleStage> = new Set<LifecycleStage>(['active', 'coming_soon', 'in_contract']);

const STAGE_LABEL: Readonly<Record<LifecycleStage, string>> = Object.freeze({
  active: 'Active',
  coming_soon: 'Coming Soon',
  in_contract: 'In Contract',
  closed: 'Closed', // refined by transaction type below
  temp_off_market: 'Temporarily Off Market',
  withdrawn: 'Withdrawn',
  cancelled: 'Cancelled',
  expired: 'Expired',
  off_market: OFF_MARKET_LABEL,
  draft: 'Draft',
  unknown: '',
});

/** Live StandardStatus member → stage + Mallan storage spelling ('Canceled' is stored as 'Cancelled'). */
const PROVIDER_STATUS: Readonly<Record<string, { stage: LifecycleStage; storage: string }>> = Object.freeze({
  Active: { stage: 'active', storage: 'Active' },
  ComingSoon: { stage: 'coming_soon', storage: 'ComingSoon' },
  Pending: { stage: 'in_contract', storage: 'Pending' },
  ActiveUnderContract: { stage: 'in_contract', storage: 'ActiveUnderContract' },
  Closed: { stage: 'closed', storage: 'Closed' },
  Hold: { stage: 'temp_off_market', storage: 'Hold' },
  Withdrawn: { stage: 'withdrawn', storage: 'Withdrawn' },
  Canceled: { stage: 'cancelled', storage: 'Cancelled' },
  Expired: { stage: 'expired', storage: 'Expired' },
  Incomplete: { stage: 'draft', storage: 'Incomplete' },
  Delete: { stage: 'unknown', storage: 'Delete' },
});

/** Mallan storage status → stage. */
const STORED_STATUS: Readonly<Record<string, LifecycleStage>> = Object.freeze({
  Active: 'active',
  ComingSoon: 'coming_soon',
  Pending: 'in_contract',
  ActiveUnderContract: 'in_contract',
  Closed: 'closed',
  Sold: 'closed',
  Rented: 'closed',
  Leased: 'closed',
  Hold: 'temp_off_market',
  Withdrawn: 'withdrawn',
  Cancelled: 'cancelled',
  Canceled: 'cancelled',
  Expired: 'expired',
  Draft: 'draft',
  Incomplete: 'draft',
});

const day = (v: unknown): string | null => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);
const dayOf = (v: unknown): string | null => (v instanceof Date ? v.toISOString().slice(0, 10) : day(v));
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** PropertyType is the sale/rental fact on this feed: Residential = sale, *Lease = rental. Exact members only. */
export function transactionTypeFromProvider(propertyType: unknown): TransactionType | null {
  if (typeof propertyType !== 'string') return null;
  if (propertyType === 'Residential' || propertyType === 'CommercialSale' || propertyType === 'ResidentialIncome' || propertyType === 'Land' || propertyType === 'BusinessOpportunity') return 'sale';
  if (/^[A-Za-z]+Lease$/.test(propertyType)) return 'rental';
  return null;
}

export function transactionTypeFromListingType(listingType: unknown): TransactionType | null {
  if (listingType === 'sale') return 'sale';
  if (listingType === 'rent' || listingType === 'rental') return 'rental';
  return null;
}

function labelFor(stage: LifecycleStage, transactionType: TransactionType | null, storageStatus: string): string {
  if (stage !== 'closed') return STAGE_LABEL[stage];
  if (storageStatus === 'Sold') return 'Sold';
  if (storageStatus === 'Rented' || storageStatus === 'Leased') return 'Rented';
  if (transactionType === 'sale') return 'Sold';
  if (transactionType === 'rental') return 'Rented';
  return STAGE_LABEL.closed;
}

type LifecycleEvidence = Pick<CotalityRow<'Property'>, 'MajorChangeType' | 'PurchaseContractDate' | 'PendingTimestamp' | 'BackOnMarketDate' | 'CloseDate' | 'PriceChangeTimestamp'
  | 'OnMarketDate' | 'ActivationDate' | 'ListingContractDate' | 'OriginalEntryTimestamp' | 'ContractStatusChangeDate' | 'OffMarketDate' | 'ClosePrice' | 'StandardStatus'>;

/** A positive provider price; null for null / zero / non-numeric. */
function positivePrice(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The raw contract-event dates, verbatim days; nothing derived. */
function contractEventsOf(raw: LifecycleEvidence): ContractEvents {
  return {
    onMarketDate: day(raw.OnMarketDate),
    activationDate: day(raw.ActivationDate),
    listingContractDate: day(raw.ListingContractDate),
    originalEntryDate: day(raw.OriginalEntryTimestamp),
    contractStatusChangeDate: day(raw.ContractStatusChangeDate),
    purchaseContractDate: day(raw.PurchaseContractDate),
    pendingDate: day(raw.PendingTimestamp),
    backOnMarketDate: day(raw.BackOnMarketDate),
    closeDate: day(raw.CloseDate),
    offMarketDate: day(raw.OffMarketDate),
  };
}

function signals(stage: LifecycleStage, raw: LifecycleEvidence, transactionType: TransactionType | null): Pick<ListingLifecycle, 'inContract' | 'inContractSince' | 'backOnMarket' | 'backOnMarketDate' | 'closedDate' | 'closePrice' | 'providerStatus' | 'acceptedOfferSignal' | 'priceChangeTimestamp' | 'contractEvents'> {
  const contractEvents = contractEventsOf(raw);
  const inContract = stage === 'in_contract';
  const backOnMarket = stage === 'active' && raw.MajorChangeType === 'BackOnMarket';
  return {
    inContract,
    inContractSince: inContract ? contractSignedDate({ providerStage: stage, transactionType, contractEvents }) : null,
    backOnMarket,
    backOnMarketDate: backOnMarket ? contractEvents.backOnMarketDate : null,
    closedDate: stage === 'closed' ? contractEvents.closeDate : null,
    closePrice: stage === 'closed' ? positivePrice(raw.ClosePrice) : null,
    providerStatus: str(raw.StandardStatus),
    acceptedOfferSignal: stage === 'active' && contractEvents.purchaseContractDate !== null,
    priceChangeTimestamp: str(raw.PriceChangeTimestamp),
    contractEvents,
  };
}

/**
 * Interpret a provider row. Null when StandardStatus is not a live member — the caller must refuse the row,
 * never default it to Active.
 */
export function lifecycleFromProviderRow(raw: CotalityRow<'Property'>): ListingLifecycle | null {
  if (!isCotalityStandardStatus(raw.StandardStatus)) return null;
  const p = PROVIDER_STATUS[raw.StandardStatus as string];
  if (!p) return null;
  const transactionType = transactionTypeFromProvider(raw.PropertyType);
  return {
    storageStatus: p.storage,
    providerStage: p.stage,
    presence: 'on_feed',
    offFeedSince: null,
    stage: p.stage,
    transactionType,
    label: labelFor(p.stage, transactionType, p.storage),
    publiclyDisplayable: PUBLIC_DISPLAY_STAGES.has(p.stage),
    ...signals(p.stage, raw, transactionType),
  };
}

/**
 * `listings.sync_status` → presence. Rows the feed delivered carry 'synced' (or a 'gated:*' decision); 'off_feed' is
 * the recorded absence; an 'archived' row whose provider stage is still on-market can only have been archived from
 * off the feed (the archive predicate admits terminal statuses or off_feed rows, nothing else).
 */
function presenceOf(syncStatus: unknown, providerStage: LifecycleStage): FeedPresence {
  const s = str(syncStatus);
  if (s === OFF_FEED_SYNC_STATUS) return 'off_feed';
  if (s === 'archived') return PUBLIC_DISPLAY_STAGES.has(providerStage) ? 'off_feed' : 'unknown';
  if (s === 'synced' || (s !== null && s.startsWith('gated:'))) return 'on_feed';
  return 'unknown';
}

/**
 * Interpret a stored Mallan row. `status` is the last verified provider status (never rewritten by presence),
 * `sync_status` carries the Mallan presence fact, and the retained provider evidence in raw_data refines the
 * signals. An on-market provider stage on a row that is off the feed is displayed as Off Market — hidden publicly,
 * still visible to agents with its provider facts (in-contract date, back-on-market, …) intact.
 */
export function lifecycleFromStoredRow(row: { status: unknown; listing_type?: unknown; raw_data?: unknown; sync_status?: unknown; terminal_since?: unknown }): ListingLifecycle {
  const storageStatus = str(row.status) ?? '';
  const providerStage: LifecycleStage = STORED_STATUS[storageStatus] ?? 'unknown';
  const transactionType = transactionTypeFromListingType(row.listing_type);
  const raw = (row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {}) as LifecycleEvidence;
  const presence = presenceOf(row.sync_status, providerStage);
  const offFeed = presence === 'off_feed';
  const stage: LifecycleStage = offFeed && PUBLIC_DISPLAY_STAGES.has(providerStage) ? 'off_market' : providerStage;
  return {
    storageStatus,
    providerStage,
    presence,
    offFeedSince: offFeed ? dayOf(row.terminal_since) : null,
    stage,
    transactionType,
    label: labelFor(stage, transactionType, storageStatus),
    publiclyDisplayable: PUBLIC_DISPLAY_STAGES.has(stage),
    ...signals(providerStage, raw, transactionType),
  };
}
