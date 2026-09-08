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
 *                                ContractStatusChangeDate is on 100 % of rows in EVERY status — it is not a
 *                                contract-signed date and is never used here.
 *   Closed                     = a sale that sold (Residential) or a rental that leased (ResidentialLease).
 *                                CloseDate on 100 %; OffMarketDate always equals CloseDate.
 *   Back on Market             = StandardStatus Active with MajorChangeType BackOnMarket (+ BackOnMarketDate).
 *   Accepted offer (signal)    = StandardStatus Active with a PurchaseContractDate (172 sale / 7 rental rows).
 *   Left the feed              = no provider fact at all. Withdrawn / Canceled / Expired / Hold are NEVER
 *                                delivered; the listing disappears and only key reconciliation sees it. Mallan
 *                                records that as `Delisted` — never as an invented "Withdrawn".
 *
 * Labels are broker language (Maya): Active · Coming Soon · In Contract · Sold · Rented · Delisted ·
 * Temporarily Off Market (Hold, if it ever arrives). No label is ever the UCBA Art. I §5(D)-prohibited
 * "Off-Market" wording. In Contract listings are publicly displayable — the IDX Plus feed delivers them under
 * Permission IDX (5,590 live rows).
 *
 * This module is INSIDE the Cotality interpretation boundary (data/cotality-contract/boundary.json). Every
 * other reader consumes its output; none re-derives a status from a date, a MajorChangeType or a name.
 */
import type { CotalityRow } from '@/lib/cotality/contract';
import { isCotalityStandardStatus } from '@/lib/cotality/live-contract';

/** Mallan storage status for "left the entitled feed; reason not delivered". */
export const DELISTED_STATUS = 'Delisted' as const;

export type TransactionType = 'sale' | 'rental';
export type LifecycleStage =
  | 'active'
  | 'coming_soon'
  | 'in_contract'
  | 'closed'
  | 'temp_off_market'
  | 'withdrawn'
  | 'cancelled'
  | 'expired'
  | 'delisted'
  | 'draft'
  | 'unknown';

export interface ListingLifecycle {
  /** The `listings.status` value (Mallan storage vocabulary). */
  storageStatus: string;
  stage: LifecycleStage;
  transactionType: TransactionType | null;
  /** Broker-language label; '' for unknown (fail-closed, never fabricated). */
  label: string;
  publiclyDisplayable: boolean;
  inContract: boolean;
  /** PurchaseContractDate, else the PendingTimestamp day; null when neither is delivered. */
  inContractSince: string | null;
  backOnMarket: boolean;
  backOnMarketDate: string | null;
  closedDate: string | null;
  /** Active with a PurchaseContractDate — an accepted offer not yet marked Pending by the provider. */
  acceptedOfferSignal: boolean;
  /** PriceChangeTimestamp verbatim (the provider dates the last price change; 361,678 rows carry it); null when none. */
  priceChangeTimestamp: string | null;
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
  delisted: 'Delisted',
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
  [DELISTED_STATUS]: 'delisted',
  Draft: 'draft',
  Incomplete: 'draft',
});

const day = (v: unknown): string | null => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);
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

type LifecycleEvidence = Pick<CotalityRow<'Property'>, 'MajorChangeType' | 'PurchaseContractDate' | 'PendingTimestamp' | 'BackOnMarketDate' | 'CloseDate' | 'PriceChangeTimestamp'>;

function signals(stage: LifecycleStage, raw: LifecycleEvidence): Pick<ListingLifecycle, 'inContract' | 'inContractSince' | 'backOnMarket' | 'backOnMarketDate' | 'closedDate' | 'acceptedOfferSignal' | 'priceChangeTimestamp'> {
  const purchaseContractDate = day(raw.PurchaseContractDate);
  const inContract = stage === 'in_contract';
  const backOnMarket = stage === 'active' && raw.MajorChangeType === 'BackOnMarket';
  return {
    inContract,
    inContractSince: inContract ? purchaseContractDate ?? day(raw.PendingTimestamp) : null,
    backOnMarket,
    backOnMarketDate: backOnMarket ? day(raw.BackOnMarketDate) : null,
    closedDate: stage === 'closed' ? day(raw.CloseDate) : null,
    acceptedOfferSignal: stage === 'active' && purchaseContractDate !== null,
    priceChangeTimestamp: str(raw.PriceChangeTimestamp),
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
    stage: p.stage,
    transactionType,
    label: labelFor(p.stage, transactionType, p.storage),
    publiclyDisplayable: PUBLIC_DISPLAY_STAGES.has(p.stage),
    ...signals(p.stage, raw),
  };
}

/** Interpret a stored Mallan row; the retained provider evidence in raw_data refines the signals. */
export function lifecycleFromStoredRow(row: { status: unknown; listing_type?: unknown; raw_data?: unknown }): ListingLifecycle {
  const storageStatus = str(row.status) ?? '';
  const stage: LifecycleStage = STORED_STATUS[storageStatus] ?? 'unknown';
  const transactionType = transactionTypeFromListingType(row.listing_type);
  const raw = (row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {}) as LifecycleEvidence;
  return {
    storageStatus,
    stage,
    transactionType,
    label: labelFor(stage, transactionType, storageStatus),
    publiclyDisplayable: PUBLIC_DISPLAY_STAGES.has(stage),
    ...signals(stage, raw),
  };
}
