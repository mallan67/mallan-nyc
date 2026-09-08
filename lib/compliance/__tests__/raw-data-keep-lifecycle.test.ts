/**
 * The lifecycle evidence the whole-corpus census proved (2026-09-08) must survive persistence: the fields that
 * identify In Contract (PurchaseContractDate, PendingTimestamp, MajorChangeType) and Back on Market
 * (BackOnMarketDate/Timestamp, MajorChangeType) were selected from the feed and then stripped by the keep-list,
 * so no reader could ever derive them (production: 0 of 26,510 rows carry MajorChangeType or PurchaseContractDate).
 */
import { RAW_DATA_KEEP_FIELDS } from '../raw-data-keep-fields';
import { cotalityFields } from '@/lib/cotality/contract';

const LIFECYCLE_EVIDENCE = cotalityFields('Property', [
  'MajorChangeType', 'MajorChangeTimestamp',
  'PurchaseContractDate', 'PendingTimestamp', 'ContractStatusChangeDate', 'StatusChangeTimestamp',
  'BackOnMarketDate', 'BackOnMarketTimestamp',
  'OnMarketTimestamp', 'OffMarketTimestamp', 'OriginalEntryTimestamp', 'PriceChangeTimestamp',
]);

describe('raw_data keeps the lifecycle evidence', () => {
  it.each(LIFECYCLE_EVIDENCE)('%s is retained', (field) => {
    expect(RAW_DATA_KEEP_FIELDS).toContain(field);
  });
  it('the previously kept lifecycle fields are still there', () => {
    for (const f of ['StandardStatus', 'ActivationDate', 'OnMarketDate', 'OffMarketDate', 'CloseDate', 'ListingContractDate']) expect(RAW_DATA_KEEP_FIELDS).toContain(f);
  });
});
