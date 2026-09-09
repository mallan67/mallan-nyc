/// <reference types="jest" />
/**
 * CRM status — ONE MAPPING PER TRANSACTION (owner ruling, Maya 2026-09-08: "rental and sale has to have each their
 * own mapping"). Every function resolves through the listing's transaction mapping only; there is no shared
 * vocabulary and no type guard over one.
 */
import {
  normalizeCrmWorkflowStatus,
  mapCrmStatusToCanonicalStatus,
  isPublicDisplayStatus,
  isTerminalStatus,
  getStatusDisplayLabel,
  resolveCanonicalStatusForListing,
  getStatusTransitionError,
  allowedCanonicalTransitions,
  buildStatusPayload,
  formStatusForListing,
  statusMappingFor,
  transactionTypeOf,
  SALE_STATUS_MAPPING,
  RENTAL_STATUS_MAPPING,
  SALE_WORKFLOW_STATUSES,
  RENTAL_WORKFLOW_STATUSES,
  SALE_CANONICAL_STATUSES,
  RENTAL_CANONICAL_STATUSES,
  CANONICAL_STATUSES,
} from '@/lib/crm/status-mapping';

const SALE_ONLY = ['OfferOut', 'OfferThruUs', 'OfferAccepted', 'OAThruUs', 'ContractOut', 'COThruUs', 'ContractSigned', 'ContractSignedThruUs', 'Sold', 'SoldThruUs', 'ComingSoon'];
const RENTAL_ONLY = ['AppOut', 'AppThruUs', 'AppAccepted', 'AppAcceptedThruUs', 'LeaseOut', 'LeaseOutThruUs', 'LeaseSigned', 'LeaseSignedThruUs', 'Rented', 'RentedThruUs', 'Leased', 'LeasedThruUs'];

describe('two mappings, one per transaction', () => {
  test('the listing type selects exactly one mapping; an unknown type selects none', () => {
    expect(transactionTypeOf('sale')).toBe('sale');
    expect(transactionTypeOf('rent')).toBe('rent');
    expect(transactionTypeOf('rental')).toBe('rent');
    expect(transactionTypeOf('commercial')).toBeNull();
    expect(transactionTypeOf(null)).toBeNull();
    expect(statusMappingFor('sale')).toBe(SALE_STATUS_MAPPING);
    expect(statusMappingFor('rent')).toBe(RENTAL_STATUS_MAPPING);
    expect(statusMappingFor('rental')).toBe(RENTAL_STATUS_MAPPING);
    expect(statusMappingFor('')).toBeNull();
    expect(statusMappingFor(undefined)).toBeNull();
  });

  test('the sale vocabulary carries no rental word and the rental vocabulary carries no sale word', () => {
    for (const w of RENTAL_ONLY) expect(SALE_WORKFLOW_STATUSES as readonly string[]).not.toContain(w);
    for (const w of SALE_ONLY) expect(RENTAL_WORKFLOW_STATUSES as readonly string[]).not.toContain(w);
    // Coming Soon is a sales-only state (UCBA 2026 Art. I §16); the rental close is Rented, never Sold
    expect(RENTAL_CANONICAL_STATUSES as readonly string[]).not.toContain('ComingSoon');
    expect(RENTAL_CANONICAL_STATUSES as readonly string[]).not.toContain('Sold');
    expect(SALE_CANONICAL_STATUSES as readonly string[]).not.toContain('Rented');
    expect(SALE_STATUS_MAPPING.closedStatus).toBe('Sold');
    expect(RENTAL_STATUS_MAPPING.closedStatus).toBe('Rented');
  });

  test('every workflow word of a transaction maps to a canonical status OF THAT transaction, with a label and transitions', () => {
    for (const mapping of [SALE_STATUS_MAPPING, RENTAL_STATUS_MAPPING]) {
      for (const w of mapping.workflowStatuses) {
        const canonical = mapping.workflowToCanonical[w];
        expect(mapping.canonicalStatuses).toContain(canonical);
        expect(CANONICAL_STATUSES).toContain(canonical);
        expect(typeof mapping.displayLabels[w]).toBe('string');
        expect(Array.isArray(mapping.transitions[w])).toBe(true);
        for (const next of mapping.transitions[w]) expect(mapping.workflowStatuses).toContain(next);
      }
      for (const c of mapping.canonicalStatuses) {
        expect(typeof mapping.canonicalLabels[c]).toBe('string');
        for (const next of mapping.canonicalTransitions[c]) expect(mapping.canonicalStatuses).toContain(next);
      }
      for (const [word, alias] of Object.entries(mapping.savedStateAliases)) {
        expect(mapping.canonicalStatuses).toContain(alias);
        expect(typeof mapping.savedStateLabels[word]).toBe('string');
      }
    }
  });

  test('the module exports no shared workflow vocabulary', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@/lib/crm/status-mapping');
    expect(mod.CRM_WORKFLOW_STATUSES).toBeUndefined();
    expect(mod.WORKFLOW_TO_CANONICAL).toBeUndefined();
  });
});

describe('normalizeCrmWorkflowStatus — per transaction', () => {
  test('normalizes exact and case-insensitive matches within the transaction', () => {
    expect(normalizeCrmWorkflowStatus('BackOnMarket', 'sale')).toBe('BackOnMarket');
    expect(normalizeCrmWorkflowStatus('backonmarket', 'sale')).toBe('BackOnMarket');
    expect(normalizeCrmWorkflowStatus('ACTIVE', 'rent')).toBe('Active');
    expect(normalizeCrmWorkflowStatus('leasesigned', 'rent')).toBe('LeaseSigned');
    expect(normalizeCrmWorkflowStatus('Draft', 'rental')).toBe('Draft');
  });

  test('the other transaction\'s word is unknown, not guarded', () => {
    for (const w of RENTAL_ONLY) expect(normalizeCrmWorkflowStatus(w, 'sale')).toBeNull();
    for (const w of SALE_ONLY) expect(normalizeCrmWorkflowStatus(w, 'rent')).toBeNull();
  });

  test('returns null for unknown words, empty input and an unknown transaction', () => {
    expect(normalizeCrmWorkflowStatus('InvalidStatus', 'sale')).toBeNull();
    expect(normalizeCrmWorkflowStatus('', 'sale')).toBeNull();
    expect(normalizeCrmWorkflowStatus(null, 'rent')).toBeNull();
    expect(normalizeCrmWorkflowStatus(undefined, 'rent')).toBeNull();
    expect(normalizeCrmWorkflowStatus('Active', 'commercial')).toBeNull();
  });
});

describe('mapCrmStatusToCanonicalStatus — per transaction', () => {
  test('sale pipeline (Maya spec)', () => {
    const sale = (w: string) => mapCrmStatusToCanonicalStatus(w, 'sale');
    expect(sale('Draft')).toBe('Draft');
    expect(sale('Future')).toBe('Draft');
    expect(sale('ComingSoon')).toBe('ComingSoon');
    expect(sale('Active')).toBe('Active');
    expect(sale('BackOnMarket')).toBe('Active');
    expect(sale('OfferOut')).toBe('ActiveUnderContract');
    expect(sale('OfferThruUs')).toBe('ActiveUnderContract');
    expect(sale('OfferAccepted')).toBe('ActiveUnderContract');
    expect(sale('OAThruUs')).toBe('ActiveUnderContract');
    expect(sale('ContractOut')).toBe('ActiveUnderContract');
    expect(sale('COThruUs')).toBe('ActiveUnderContract');
    expect(sale('ContractSigned')).toBe('Pending');
    expect(sale('ContractSignedThruUs')).toBe('Pending');
    expect(sale('BoardApproved')).toBe('Pending');
    expect(sale('Sold')).toBe('Sold');
    expect(sale('SoldThruUs')).toBe('Sold');
    expect(sale('TempOffMarket')).toBe('Hold');
    expect(sale('PermOffMarket')).toBe('Withdrawn');
    expect(sale('Withdrawn')).toBe('Withdrawn');
    expect(sale('Expired')).toBe('Expired');
    expect(sale('Hold')).toBe('Hold');
    expect(sale('Cancelled')).toBe('Cancelled');
  });

  test('rental pipeline', () => {
    const rent = (w: string) => mapCrmStatusToCanonicalStatus(w, 'rent');
    expect(rent('Draft')).toBe('Draft');
    expect(rent('Future')).toBe('Draft');
    expect(rent('Active')).toBe('Active');
    expect(rent('BackOnMarket')).toBe('Active');
    for (const w of ['AppOut', 'AppThruUs', 'AppAccepted', 'AppAcceptedThruUs', 'LeaseOut', 'LeaseOutThruUs', 'LeaseSigned', 'LeaseSignedThruUs', 'BoardApproved']) {
      expect(rent(w)).toBe('Pending');
    }
    for (const w of ['Rented', 'RentedThruUs', 'Leased', 'LeasedThruUs']) expect(rent(w)).toBe('Rented');
    expect(rent('TempOffMarket')).toBe('Hold');
    expect(rent('PermOffMarket')).toBe('Withdrawn');
    expect(rent('Withdrawn')).toBe('Withdrawn');
    expect(rent('Expired')).toBe('Expired');
    expect(rent('Hold')).toBe('Hold');
    expect(rent('Cancelled')).toBe('Cancelled');
  });

  test('sale rejects every rental-only word; rental rejects every sale-only word', () => {
    for (const w of RENTAL_ONLY) expect(mapCrmStatusToCanonicalStatus(w, 'sale')).toBeNull();
    for (const w of SALE_ONLY) expect(mapCrmStatusToCanonicalStatus(w, 'rent')).toBeNull();
  });

  test('unknown status returns null, never sends raw to server', () => {
    expect(mapCrmStatusToCanonicalStatus('FakeStatus', 'sale')).toBeNull();
    expect(mapCrmStatusToCanonicalStatus('backOnTheMarket', 'rent')).toBeNull();
  });
});

describe('resolveCanonicalStatusForListing — the one resolver behind the form, the status API and the projection', () => {
  test.each([
    ['Closed', 'sale', 'Sold'], ['Closed', 'rent', 'Rented'], ['Closed', 'rental', 'Rented'],
    ['Canceled', 'sale', 'Cancelled'], ['Canceled', 'rent', 'Cancelled'],
    ['Incomplete', 'sale', 'Draft'], ['Incomplete', 'rent', 'Draft'],
    ['Pending', 'sale', 'Pending'], ['Pending', 'rent', 'Pending'],
    ['ActiveUnderContract', 'sale', 'ActiveUnderContract'], ['ActiveUnderContract', 'rent', 'ActiveUnderContract'],
    ['OfferAccepted', 'sale', 'ActiveUnderContract'], ['LeaseSigned', 'rent', 'Pending'],
    ['Sold', 'sale', 'Sold'], ['Rented', 'rent', 'Rented'], ['Leased', 'rent', 'Rented'],
    ['  Active  ', 'sale', 'Active'],
  ])('%s on %s → %s', (input, type, expected) => {
    expect(resolveCanonicalStatusForListing(input, type)).toBe(expected);
  });

  test.each([
    ['Leased', 'sale'], ['Rented', 'sale'], ['RentedThruUs', 'sale'], ['AppAccepted', 'sale'], ['LeaseOut', 'sale'],
    ['Sold', 'rent'], ['SoldThruUs', 'rent'], ['ContractSigned', 'rent'], ['OfferOut', 'rent'], ['ComingSoon', 'rent'],
    ['Nonsense', 'sale'], ['', 'sale'], ['Closed', 'commercial'], ['Active', null], ['Active', undefined],
  ])('%s on %s is refused (null)', (input, type) => {
    expect(resolveCanonicalStatusForListing(input, type)).toBeNull();
  });

  test('non-string input is refused', () => {
    expect(resolveCanonicalStatusForListing(42, 'sale')).toBeNull();
    expect(resolveCanonicalStatusForListing(null, 'rent')).toBeNull();
  });

  test('the resolver never reads a regex over a shared list', () => {
    const src = require('fs').readFileSync(require.resolve('@/lib/crm/status-mapping'), 'utf8') as string;
    expect(src).not.toMatch(/\/\^\(App\|Lease/);
    expect(src).not.toMatch(/\/\^\(Offer\|OAThruUs/);
    expect(src).not.toMatch(/CRM_WORKFLOW_STATUSES/);
  });
});

describe('public display eligibility', () => {
  test('Active, ComingSoon, ActiveUnderContract are public-display eligible', () => {
    expect(isPublicDisplayStatus('Active')).toBe(true);
    expect(isPublicDisplayStatus('ComingSoon')).toBe(true);
    expect(isPublicDisplayStatus('ActiveUnderContract')).toBe(true);
  });

  test('Draft, Withdrawn, Expired, Sold, Rented, Hold, Pending, Cancelled are NOT', () => {
    for (const s of ['Draft', 'Withdrawn', 'Expired', 'Sold', 'Rented', 'Hold', 'Pending', 'Cancelled']) expect(isPublicDisplayStatus(s)).toBe(false);
  });
});

describe('terminal status detection', () => {
  test('terminal statuses', () => {
    for (const s of ['Sold', 'Rented', 'Withdrawn', 'Expired', 'Cancelled']) expect(isTerminalStatus(s)).toBe(true);
    // Closed is the only terminal status the feed delivers (374,791 closed rentals alone). Departure from the
    // feed is a presence fact (sync_status off_feed → Off Market), never a status — so no such status is terminal.
    expect(isTerminalStatus('Closed')).toBe(true);
    expect(isTerminalStatus('Delisted')).toBe(false);
  });

  test('non-terminal statuses', () => {
    for (const s of ['Active', 'Draft', 'Pending', 'Hold']) expect(isTerminalStatus(s)).toBe(false);
  });
});

describe('display labels — per transaction', () => {
  test('sale labels', () => {
    expect(getStatusDisplayLabel('BackOnMarket', 'sale')).toBe('Back On Market');
    expect(getStatusDisplayLabel('OAThruUs', 'sale')).toBe('OA Thru Us');
    expect(getStatusDisplayLabel('Pending', 'sale')).toBe('In Contract');
    expect(getStatusDisplayLabel('Sold', 'sale')).toBe('Sold');
  });
  test('rental labels', () => {
    expect(getStatusDisplayLabel('AppOut', 'rent')).toBe('Application Out');
    expect(getStatusDisplayLabel('LeaseSignedThruUs', 'rent')).toBe('Lease Signed Thru Us');
    expect(getStatusDisplayLabel('Pending', 'rent')).toBe('Pending');
    expect(getStatusDisplayLabel('Rented', 'rent')).toBe('Rented');
  });
  test('a word of the other transaction (or an unknown one) falls back to the input', () => {
    expect(getStatusDisplayLabel('AppOut', 'sale')).toBe('AppOut');
    expect(getStatusDisplayLabel('OfferOut', 'rent')).toBe('OfferOut');
    expect(getStatusDisplayLabel('Whatever', 'sale')).toBe('Whatever');
    expect(getStatusDisplayLabel('Active', 'commercial')).toBe('Active');
  });
});

describe('workflow transition validation — per transaction pipeline', () => {
  test('valid sale transitions return null', () => {
    expect(getStatusTransitionError('Draft', 'Active', 'sale')).toBeNull();
    expect(getStatusTransitionError('Active', 'OfferOut', 'sale')).toBeNull();
    expect(getStatusTransitionError('Active', 'BackOnMarket', 'sale')).toBeNull();
    expect(getStatusTransitionError('ContractSigned', 'Sold', 'sale')).toBeNull();
    expect(getStatusTransitionError('TempOffMarket', 'Active', 'sale')).toBeNull();
  });

  test('valid rental transitions return null', () => {
    expect(getStatusTransitionError('Draft', 'Active', 'rent')).toBeNull();
    expect(getStatusTransitionError('Active', 'AppOut', 'rent')).toBeNull();
    expect(getStatusTransitionError('AppAccepted', 'LeaseOut', 'rent')).toBeNull();
    expect(getStatusTransitionError('LeaseSigned', 'Rented', 'rent')).toBeNull();
    expect(getStatusTransitionError('BoardApproved', 'RentedThruUs', 'rent')).toBeNull();
  });

  test('a sale never moves into a rental word and a rental never into a sale word', () => {
    expect(getStatusTransitionError('Active', 'AppOut', 'sale')).toMatch(/Unknown target status/);
    expect(getStatusTransitionError('BoardApproved', 'Rented', 'sale')).toMatch(/Unknown target status/);
    expect(getStatusTransitionError('Active', 'OfferOut', 'rent')).toMatch(/Unknown target status/);
    expect(getStatusTransitionError('BoardApproved', 'Sold', 'rent')).toMatch(/Unknown target status/);
    expect(getStatusTransitionError('Draft', 'ComingSoon', 'rent')).toMatch(/Unknown target status/);
  });

  test('invalid transitions return an error message', () => {
    expect(getStatusTransitionError('Draft', 'Sold', 'sale')).not.toBeNull();
    expect(getStatusTransitionError('Sold', 'Active', 'sale')).not.toBeNull();
    expect(getStatusTransitionError('Active', 'Draft', 'sale')).not.toBeNull();
    expect(getStatusTransitionError('Rented', 'Active', 'rent')).toMatch(/none \(terminal\)/);
  });

  test('unknown status or transaction returns an error', () => {
    expect(getStatusTransitionError('FakeStatus', 'Active', 'sale')).not.toBeNull();
    expect(getStatusTransitionError('Active', 'OfferOut', 'commercial')).toMatch(/Unknown transaction type/);
  });
});

describe('canonical transitions — the status API state machine per transaction', () => {
  test('a sale in contract closes as Sold, never Rented', () => {
    expect(allowedCanonicalTransitions('Pending', 'sale')).toEqual(['Sold', 'Active', 'Withdrawn']);
    expect(allowedCanonicalTransitions('Pending', 'sale')).not.toContain('Rented');
  });
  test('a rental pending closes as Rented, never Sold', () => {
    expect(allowedCanonicalTransitions('Pending', 'rent')).toEqual(['Rented', 'Active', 'Withdrawn']);
    expect(allowedCanonicalTransitions('Pending', 'rent')).not.toContain('Sold');
  });
  test('a rental draft never goes Coming Soon; a sale draft may', () => {
    expect(allowedCanonicalTransitions('Draft', 'rent')).toEqual(['Active']);
    expect(allowedCanonicalTransitions('Draft', 'sale')).toEqual(['Active', 'ComingSoon']);
  });
  test('the stored close of the feed (Closed) resolves to the transaction close and is terminal', () => {
    expect(allowedCanonicalTransitions('Closed', 'sale')).toEqual([]);
    expect(allowedCanonicalTransitions('Closed', 'rent')).toEqual([]);
    expect(allowedCanonicalTransitions('Sold', 'sale')).toEqual([]);
    expect(allowedCanonicalTransitions('Rented', 'rent')).toEqual([]);
  });
  test('unknown current status or transaction → null (the route answers 400)', () => {
    expect(allowedCanonicalTransitions('Sold', 'rent')).toBeNull();
    expect(allowedCanonicalTransitions('Rented', 'sale')).toBeNull();
    expect(allowedCanonicalTransitions('Garbage', 'sale')).toBeNull();
    expect(allowedCanonicalTransitions('Active', 'commercial')).toBeNull();
  });
});

describe('buildStatusPayload — per transaction', () => {
  test('BackOnMarket on a sale builds canonical Active + workflow BackOnMarket', () => {
    const result = buildStatusPayload('BackOnMarket', 'sale');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.canonicalStatus).toBe('Active');
      expect(result.workflowStatus).toBe('BackOnMarket');
      expect(result.displayLabel).toBe('Back On Market');
    }
  });

  test('LeaseSigned on a rental builds canonical Pending', () => {
    const result = buildStatusPayload('LeaseSigned', 'rent');
    expect(result).toEqual({ canonicalStatus: 'Pending', workflowStatus: 'LeaseSigned', displayLabel: 'Lease Signed' });
  });

  test('a rental word on a sale (and vice versa) is an error, as is garbage or an unknown transaction', () => {
    expect('error' in buildStatusPayload('LeaseSigned', 'sale')).toBe(true);
    expect('error' in buildStatusPayload('OfferOut', 'rent')).toBe(true);
    expect('error' in buildStatusPayload('Garbage', 'sale')).toBe(true);
    expect('error' in buildStatusPayload('Active', 'commercial')).toBe(true);
  });

  test('333 E 46th can publish as canonical Active', () => {
    const result = buildStatusPayload('Active', 'sale');
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.canonicalStatus).toBe('Active');
  });
});

describe('formStatusForListing — the server projection the four forms/viewers render', () => {
  const row = (o: Record<string, unknown>) => ({ status: undefined as unknown, sync_status: 'synced', terminal_since: null, raw_data: {}, ...o });

  test('a closed row shows the transaction close: Sold on a sale, Rented on a rental', () => {
    expect(formStatusForListing(row({ status: 'Closed', listing_type: 'sale', raw_data: { StandardStatus: 'Closed' } })))
      .toEqual({ value: 'Sold', label: 'Sold', providerStatus: 'Closed' });
    expect(formStatusForListing(row({ status: 'Closed', listing_type: 'rent', raw_data: { StandardStatus: 'Closed' } })))
      .toEqual({ value: 'Rented', label: 'Rented', providerStatus: 'Closed' });
  });

  test('Pending reads In Contract on a sale and Pending on a rental', () => {
    expect(formStatusForListing(row({ status: 'Pending', listing_type: 'sale' }))).toMatchObject({ value: 'Pending', label: 'In Contract' });
    expect(formStatusForListing(row({ status: 'Pending', listing_type: 'rent' }))).toMatchObject({ value: 'Pending', label: 'Pending' });
  });

  test('the saved workflow word wins only when it is this transaction\'s and agrees with the stored state', () => {
    expect(formStatusForListing(row({ status: 'Pending', listing_type: 'sale', raw_data: { _crmWorkflowStatus: 'ContractSigned' } })))
      .toMatchObject({ value: 'ContractSigned', label: 'Contract Signed' });
    expect(formStatusForListing(row({ status: 'Pending', listing_type: 'rent', raw_data: { rentalStatus: 'LeaseSigned' } })))
      .toMatchObject({ value: 'LeaseSigned', label: 'Lease Signed' });
    // a rental word saved on a sale row is not a sale state — the stored canonical state is shown
    expect(formStatusForListing(row({ status: 'Pending', listing_type: 'sale', raw_data: { _crmWorkflowStatus: 'LeaseSigned' } })))
      .toMatchObject({ value: 'Pending', label: 'In Contract' });
    // a stale workflow word that disagrees with the stored state is not shown
    expect(formStatusForListing(row({ status: 'Active', listing_type: 'sale', raw_data: { _crmWorkflowStatus: 'ContractSigned' } })))
      .toMatchObject({ value: 'Active', label: 'Active' });
  });

  test('the form\'s own saved-state spelling is kept as the agent chose it, labelled as the form labels it — when it agrees with the stored state', () => {
    expect(formStatusForListing(row({ status: 'Draft', listing_type: 'rent', raw_data: { _crmWorkflowStatus: 'Incomplete' } }))).toMatchObject({ value: 'Incomplete', label: 'Incomplete' });
    expect(formStatusForListing(row({ status: 'Draft', listing_type: 'sale', raw_data: { saleStatus: 'Incomplete' } }))).toMatchObject({ value: 'Incomplete', label: 'Incomplete' });
    expect(formStatusForListing(row({ status: 'Sold', listing_type: 'sale', raw_data: { _crmWorkflowStatus: 'Closed' } }))).toMatchObject({ value: 'Closed', label: 'Sold' });
    expect(formStatusForListing(row({ status: 'Rented', listing_type: 'rent', raw_data: { rentalStatus: 'Closed' } }))).toMatchObject({ value: 'Closed', label: 'Rented' });
    expect(formStatusForListing(row({ status: 'Cancelled', listing_type: 'rent', raw_data: { _crmWorkflowStatus: 'Canceled' } }))).toMatchObject({ value: 'Canceled', label: 'Canceled' });
    // a stale saved-state word that disagrees with the stored state is not shown
    expect(formStatusForListing(row({ status: 'Active', listing_type: 'sale', raw_data: { _crmWorkflowStatus: 'Closed' } }))).toMatchObject({ value: 'Active', label: 'Active' });
  });

  test('unknown transaction, blank status and the other transaction\'s stored close are unavailable, never invented', () => {
    expect(formStatusForListing(row({ status: 'Active', listing_type: null }))).toMatchObject({ value: '', label: 'Status unavailable' });
    expect(formStatusForListing(row({ status: '', listing_type: 'sale' }))).toMatchObject({ value: '', label: 'Status unavailable' });
    expect(formStatusForListing(row({ status: 'Rented', listing_type: 'sale' }))).toMatchObject({ value: '', label: 'Status unavailable' });
    expect(formStatusForListing(row({ status: 'Sold', listing_type: 'rent' }))).toMatchObject({ value: '', label: 'Status unavailable' });
  });

  test('a row off the feed is Off Market (a presence fact), with the last provider status preserved', () => {
    expect(formStatusForListing(row({ status: 'Active', listing_type: 'sale', sync_status: 'off_feed', terminal_since: new Date('2026-08-01T00:00:00Z'), raw_data: { StandardStatus: 'Active' } })))
      .toEqual({ value: '', label: 'Off Market', providerStatus: 'Active' });
  });
});
