/**
 * CANONICAL LIFECYCLE — the ONE interpretation of the feed's transaction state, pinned to the whole-corpus
 * census of 2026-09-08 (docs/operations/evidence-2026-09-08/transaction-state/):
 *   - the entitled feed delivers StandardStatus ∈ {Active, Pending, ComingSoon, Closed} only;
 *   - "in contract" = StandardStatus Pending (PurchaseContractDate on 100% of Pending sale rows, MajorChangeType
 *     Pending 5,084 / ActiveUnderContract 35); ActiveUnderContract never arrives as a status;
 *   - Closed on a rental (ResidentialLease) is a lease, never a sale;
 *   - Back on Market = MajorChangeType BackOnMarket (+ BackOnMarketDate) while Active;
 *   - a listing that leaves the feed has NO verified provider reason — Mallan keeps its last verified provider status
 *     and records the presence fact (sync_status off_feed); the broker-facing Mallan state is Off Market (Maya). Never an
 *     invented Withdrawn / Canceled / Expired / Hold, and never a new canonical status.
 * Maya (2026-09-08): In Contract listings stay public; a departed listing is not labelled "Withdrawn".
 */
import {
  OFF_FEED_SYNC_STATUS,
  OFF_MARKET_LABEL,
  PUBLIC_DISPLAY_STAGES,
  lifecycleFromProviderRow,
  lifecycleFromStoredRow,
  transactionTypeFromProvider,
} from '../canonical-lifecycle';

describe('transactionTypeFromProvider — PropertyType is the sale/rental fact', () => {
  it('Residential → sale, ResidentialLease → rental, anything else → null', () => {
    expect(transactionTypeFromProvider('Residential')).toBe('sale');
    expect(transactionTypeFromProvider('ResidentialLease')).toBe('rental');
    expect(transactionTypeFromProvider('CommercialLease')).toBe('rental');
    expect(transactionTypeFromProvider(null)).toBeNull();
    expect(transactionTypeFromProvider('Residential Lease')).toBeNull();
  });
});

describe('lifecycleFromProviderRow — the proven combinations', () => {
  it('Pending sale with a PurchaseContractDate is In Contract, public, with the contract date', () => {
    const l = lifecycleFromProviderRow({ StandardStatus: 'Pending', PropertyType: 'Residential', MajorChangeType: 'Pending', PurchaseContractDate: '2026-09-04', PendingTimestamp: '2026-09-04T00:00:00.000-00:00' })!;
    expect(l.storageStatus).toBe('Pending');
    expect(l.stage).toBe('in_contract');
    expect(l.label).toBe('In Contract');
    expect(l.transactionType).toBe('sale');
    expect(l.inContract).toBe(true);
    expect(l.inContractSince).toBe('2026-09-04');
    expect(l.publiclyDisplayable).toBe(true);
    expect(l.backOnMarket).toBe(false);
  });
  it('Pending rental is In Contract too (rental applications arrive as Pending)', () => {
    const l = lifecycleFromProviderRow({ StandardStatus: 'Pending', PropertyType: 'ResidentialLease', PurchaseContractDate: '2026-08-05' })!;
    expect(l.stage).toBe('in_contract');
    expect(l.transactionType).toBe('rental');
    expect(l.label).toBe('In Contract');
  });
  it('Pending without a PurchaseContractDate has no contract-signed date — PendingTimestamp is the status change, exposed separately, never a contract date', () => {
    const p = lifecycleFromProviderRow({ StandardStatus: 'Pending', PropertyType: 'Residential', PendingTimestamp: '2026-07-05T00:00:00.000-00:00' })!;
    expect(p.inContractSince).toBeNull();
    expect(p.contractEvents.pendingDate).toBe('2026-07-05');
    expect(p.contractEvents.purchaseContractDate).toBeNull();
    expect(lifecycleFromProviderRow({ StandardStatus: 'Pending', PropertyType: 'Residential' })!.inContractSince).toBeNull();
  });
  it('ActiveUnderContract, if it ever arrives, is In Contract as well (a live member with 0 rows)', () => {
    const l = lifecycleFromProviderRow({ StandardStatus: 'ActiveUnderContract', PropertyType: 'Residential' })!;
    expect(l.stage).toBe('in_contract');
    expect(l.label).toBe('In Contract');
    expect(l.storageStatus).toBe('ActiveUnderContract');
  });
  it('Closed sale is Sold; Closed rental is Rented — never collapsed', () => {
    const sale = lifecycleFromProviderRow({ StandardStatus: 'Closed', PropertyType: 'Residential', CloseDate: '2026-06-01', OffMarketDate: '2026-06-01' })!;
    expect(sale.stage).toBe('closed');
    expect(sale.label).toBe('Sold');
    expect(sale.closedDate).toBe('2026-06-01');
    expect(sale.publiclyDisplayable).toBe(false);
    const rental = lifecycleFromProviderRow({ StandardStatus: 'Closed', PropertyType: 'ResidentialLease', CloseDate: '2026-06-01' })!;
    expect(rental.stage).toBe('closed');
    expect(rental.label).toBe('Rented');
  });
  it('Active + MajorChangeType BackOnMarket is Active with the Back on Market signal and its date', () => {
    const l = lifecycleFromProviderRow({ StandardStatus: 'Active', PropertyType: 'Residential', MajorChangeType: 'BackOnMarket', BackOnMarketDate: '2026-04-23' })!;
    expect(l.stage).toBe('active');
    expect(l.label).toBe('Active');
    expect(l.backOnMarket).toBe(true);
    expect(l.backOnMarketDate).toBe('2026-04-23');
    expect(l.publiclyDisplayable).toBe(true);
  });
  it('Active with a PurchaseContractDate stays Active but carries the accepted-offer signal (172 live rows)', () => {
    const l = lifecycleFromProviderRow({ StandardStatus: 'Active', PropertyType: 'Residential', PurchaseContractDate: '2026-09-01' })!;
    expect(l.stage).toBe('active');
    expect(l.acceptedOfferSignal).toBe(true);
    expect(l.inContract).toBe(false);
  });
  it('ComingSoon is Coming Soon and public', () => {
    const l = lifecycleFromProviderRow({ StandardStatus: 'ComingSoon', PropertyType: 'Residential', ActivationDate: '2026-09-04' })!;
    expect(l.stage).toBe('coming_soon');
    expect(l.label).toBe('Coming Soon');
    expect(l.publiclyDisplayable).toBe(true);
  });
  it('the never-delivered live members still map (Hold, Withdrawn, Canceled, Expired) — storage spelling Cancelled', () => {
    expect(lifecycleFromProviderRow({ StandardStatus: 'Hold', PropertyType: 'Residential' })!).toMatchObject({ stage: 'temp_off_market', label: 'Temporarily Off Market', storageStatus: 'Hold', publiclyDisplayable: false });
    expect(lifecycleFromProviderRow({ StandardStatus: 'Withdrawn', PropertyType: 'Residential' })!).toMatchObject({ stage: 'withdrawn', label: 'Withdrawn', storageStatus: 'Withdrawn' });
    expect(lifecycleFromProviderRow({ StandardStatus: 'Canceled', PropertyType: 'Residential' })!).toMatchObject({ stage: 'cancelled', label: 'Cancelled', storageStatus: 'Cancelled' });
    expect(lifecycleFromProviderRow({ StandardStatus: 'Expired', PropertyType: 'Residential' })!).toMatchObject({ stage: 'expired', label: 'Expired' });
  });
  it('refuses anything that is not a live StandardStatus member (never defaults to Active)', () => {
    expect(lifecycleFromProviderRow({ StandardStatus: 'Sold', PropertyType: 'Residential' } as never)).toBeNull();
    expect(lifecycleFromProviderRow({ StandardStatus: 'Off Market', PropertyType: 'Residential' } as never)).toBeNull();
    expect(lifecycleFromProviderRow({ PropertyType: 'Residential' })).toBeNull();
  });
});

describe('lifecycleFromStoredRow — Mallan storage vocabulary, sale/rental aware', () => {
  it('off the feed with no verified reason: the last provider status is preserved, the Mallan state is Off Market, hidden', () => {
    expect(OFF_FEED_SYNC_STATUS).toBe('off_feed');
    expect(OFF_MARKET_LABEL).toBe('Off Market');
    const l = lifecycleFromStoredRow({ status: 'Active', listing_type: 'rent', sync_status: 'off_feed', terminal_since: new Date('2026-09-01T03:30:00Z') });
    expect(l.stage).toBe('off_market');
    expect(l.label).toBe('Off Market');
    expect(l.publiclyDisplayable).toBe(false);
    expect(l.storageStatus).toBe('Active'); // the raw provider fact is never rewritten
    expect(l.providerStage).toBe('active');
    expect(l.presence).toBe('off_feed');
    expect(l.offFeedSince).toBe('2026-09-01');
    expect(l.label).not.toMatch(/withdrawn|cancel|expired|hold/i);
  });
  it('a Pending row that left the feed keeps its last verified in-contract fact under the Off Market state', () => {
    const l = lifecycleFromStoredRow({ status: 'Pending', listing_type: 'sale', sync_status: 'off_feed', raw_data: { PurchaseContractDate: '2026-08-01' } });
    expect(l).toMatchObject({ stage: 'off_market', providerStage: 'in_contract', inContract: true, inContractSince: '2026-08-01', publiclyDisplayable: false });
  });
  it('a synced row is on the feed; a terminal row is never Off Market; an archived on-market row can only have come from Off Market', () => {
    expect(lifecycleFromStoredRow({ status: 'Active', listing_type: 'sale', sync_status: 'synced' })).toMatchObject({ stage: 'active', presence: 'on_feed', offFeedSince: null });
    expect(lifecycleFromStoredRow({ status: 'Closed', listing_type: 'sale', sync_status: 'archived' })).toMatchObject({ stage: 'closed', label: 'Sold' });
    expect(lifecycleFromStoredRow({ status: 'Active', listing_type: 'sale', sync_status: 'archived' })).toMatchObject({ stage: 'off_market', presence: 'off_feed' });
    expect(lifecycleFromStoredRow({ status: 'Active', listing_type: 'sale' })).toMatchObject({ stage: 'active', presence: 'unknown' });
  });
  it('no stored status spells a manufactured departure: "Delisted" is unknown, not a stage', () => {
    expect(lifecycleFromStoredRow({ status: 'Delisted', listing_type: 'sale' })).toMatchObject({ stage: 'unknown', label: '' });
  });
  it('stored Pending is In Contract and public; stored Closed is Sold or Rented by listing_type', () => {
    expect(lifecycleFromStoredRow({ status: 'Pending', listing_type: 'sale' })).toMatchObject({ stage: 'in_contract', label: 'In Contract', publiclyDisplayable: true });
    expect(lifecycleFromStoredRow({ status: 'Closed', listing_type: 'sale' })).toMatchObject({ stage: 'closed', label: 'Sold' });
    expect(lifecycleFromStoredRow({ status: 'Closed', listing_type: 'rent' })).toMatchObject({ stage: 'closed', label: 'Rented' });
    expect(lifecycleFromStoredRow({ status: 'Sold', listing_type: 'sale' })).toMatchObject({ stage: 'closed', label: 'Sold' });
    expect(lifecycleFromStoredRow({ status: 'Rented', listing_type: 'rent' })).toMatchObject({ stage: 'closed', label: 'Rented' });
    expect(lifecycleFromStoredRow({ status: 'Leased', listing_type: 'rent' })).toMatchObject({ stage: 'closed', label: 'Rented' });
  });
  it('reads the retained provider evidence from raw_data (Back on Market, contract date)', () => {
    const l = lifecycleFromStoredRow({ status: 'Active', listing_type: 'sale', raw_data: { MajorChangeType: 'BackOnMarket', BackOnMarketDate: '2026-04-23' } });
    expect(l.backOnMarket).toBe(true);
    expect(l.backOnMarketDate).toBe('2026-04-23');
    const c = lifecycleFromStoredRow({ status: 'Pending', listing_type: 'sale', raw_data: { PurchaseContractDate: '2026-09-04' } });
    expect(c.inContractSince).toBe('2026-09-04');
  });
  it('Draft / Incomplete are drafts; an unknown value is unknown and hidden', () => {
    expect(lifecycleFromStoredRow({ status: 'Draft', listing_type: 'sale' })).toMatchObject({ stage: 'draft', publiclyDisplayable: false });
    expect(lifecycleFromStoredRow({ status: 'Incomplete', listing_type: 'sale' })).toMatchObject({ stage: 'draft' });
    expect(lifecycleFromStoredRow({ status: 'Off Market', listing_type: 'sale' })).toMatchObject({ stage: 'unknown', publiclyDisplayable: false, label: '' });
    expect(lifecycleFromStoredRow({ status: '', listing_type: 'sale' })).toMatchObject({ stage: 'unknown' });
  });
  it('the public stages are exactly active, coming_soon and in_contract', () => {
    expect([...PUBLIC_DISPLAY_STAGES].sort()).toEqual(['active', 'coming_soon', 'in_contract']);
  });
  it('no PROVIDER-status label is the bare "Off Market" — that state comes only from the Mallan presence fact (broker-facing, Maya 2026-09-08)', () => {
    for (const status of ['Active', 'ComingSoon', 'Pending', 'ActiveUnderContract', 'Closed', 'Sold', 'Rented', 'Leased', 'Hold', 'Withdrawn', 'Cancelled', 'Expired', 'Draft']) {
      for (const lt of ['sale', 'rent'] as const) expect(lifecycleFromStoredRow({ status, listing_type: lt }).label).not.toMatch(/^off[\s-]?market$/i);
    }
  });
});

describe('price change timestamp — the provider dates the last price change (PriceChangeTimestamp, populated 361,678 rows)', () => {
  it('a stored row carries the provider timestamp verbatim', () => {
    const l = lifecycleFromStoredRow({ status: 'Active', listing_type: 'sale', raw_data: { PriceChangeTimestamp: '2026-08-30T14:02:11Z' } });
    expect(l.priceChangeTimestamp).toBe('2026-08-30T14:02:11Z');
  });
  it('null when the provider delivered none — never approximated from another timestamp', () => {
    const l = lifecycleFromStoredRow({ status: 'Active', listing_type: 'sale', raw_data: { ModificationTimestamp: '2026-09-01T00:00:00Z' } });
    expect(l.priceChangeTimestamp).toBeNull();
  });
  it('a provider row carries it too', () => {
    const l = lifecycleFromProviderRow({ StandardStatus: 'Active', PropertyType: 'Residential', PriceChangeTimestamp: '2026-08-30T14:02:11Z' });
    expect(l?.priceChangeTimestamp).toBe('2026-08-30T14:02:11Z');
  });
});
