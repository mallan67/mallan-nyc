/// <reference types="jest" />
/**
 * CRM status — ONE MAPPING PER TRANSACTION, resolved to live Cotality StandardStatus tokens (owner rulings, Maya
 * 2026-09-08). Every function resolves through the listing's transaction mapping only; the canonical (stored)
 * status is always a live member; each workflow word carries its associated Cotality date; broker language is a
 * label per transaction (Closed → Sold / Rented).
 */
import {
  normalizeCrmWorkflowStatus,
  mapCrmStatusToCanonicalStatus,
  isPublicDisplayStatus,
  isTerminalStatus,
  getStatusDisplayLabel,
  resolveCanonicalStatusForListing,
  requiredFactsFor,
  getStatusTransitionError,
  allowedCanonicalTransitions,
  buildStatusPayload,
  formStatusForListing,
  statusPresentation,
  statusMappingFor,
  transactionTypeOf,
  SALE_STATUS_MAPPING,
  RENTAL_STATUS_MAPPING,
  SALE_WORKFLOW_STATUSES,
  RENTAL_WORKFLOW_STATUSES,
  SALE_CANONICAL_STATUSES,
  RENTAL_CANONICAL_STATUSES,
  CANONICAL_STATUSES,
  STATUS_FACT_FIELDS,
  MALLAN_LEASE_SIGNED_DATE_KEY,
} from '@/lib/crm/status-mapping';
import { COTALITY_STANDARD_STATUS_MEMBERS } from '@/lib/cotality/live-contract';
import { MALLAN_STORAGE_STATUSES } from '@/lib/listings/mallan-status';

const LIVE = ['Active', 'ActiveUnderContract', 'Canceled', 'Closed', 'ComingSoon', 'Delete', 'Expired', 'Hold', 'Incomplete', 'Pending', 'Withdrawn'];
const SALE_ONLY = ['OfferOut', 'OfferThruUs', 'OfferAccepted', 'OAThruUs', 'ContractOut', 'COThruUs', 'ContractSigned', 'ContractSignedThruUs', 'Sold', 'SoldThruUs', 'ComingSoon'];
const RENTAL_ONLY = ['AppOut', 'AppThruUs', 'AppAccepted', 'AppAcceptedThruUs', 'LeaseOut', 'LeaseOutThruUs', 'LeaseSigned', 'LeaseSignedThruUs', 'Rented', 'RentedThruUs', 'Leased', 'LeasedThruUs'];

describe('the canonical vocabulary IS the live Cotality StandardStatus vocabulary', () => {
  test('the eleven live members (one-L Canceled) are the storage vocabulary; every canonical status is one of them', () => {
    expect([...COTALITY_STANDARD_STATUS_MEMBERS].sort()).toEqual([...LIVE].sort());
    expect([...MALLAN_STORAGE_STATUSES].sort()).toEqual([...LIVE].sort());
    for (const c of CANONICAL_STATUSES) expect(LIVE).toContain(c);
    for (const legacy of ['Draft', 'Sold', 'Rented', 'Leased', 'Cancelled']) expect(CANONICAL_STATUSES as readonly string[]).not.toContain(legacy);
  });
  test('no mapping stores a Mallan word: every workflow → canonical target is a live member', () => {
    for (const mapping of [SALE_STATUS_MAPPING, RENTAL_STATUS_MAPPING]) {
      for (const w of mapping.workflowStatuses) expect(LIVE).toContain(mapping.workflowToCanonical[w]);
      for (const c of mapping.canonicalStatuses) expect(LIVE).toContain(c);
      expect(mapping.closedStatus).toBe('Closed');
    }
  });
  test('the module never names a workflow value MlsStatus', () => {
    const src = require('fs').readFileSync(require.resolve('@/lib/crm/status-mapping'), 'utf8') as string;
    expect(src).not.toMatch(/MlsStatus\s*[:=]/);
    expect(src).not.toMatch(/\/\^\(App\|Lease/);
    expect(src).not.toMatch(/CRM_WORKFLOW_STATUSES/);
  });
});

describe('two mappings, one per transaction', () => {
  test('the listing type selects exactly one mapping; an unknown type selects none', () => {
    expect(transactionTypeOf('sale')).toBe('sale');
    expect(transactionTypeOf('rent')).toBe('rent');
    expect(transactionTypeOf('rental')).toBe('rent');
    expect(transactionTypeOf('commercial')).toBeNull();
    expect(statusMappingFor('sale')).toBe(SALE_STATUS_MAPPING);
    expect(statusMappingFor('rental')).toBe(RENTAL_STATUS_MAPPING);
    expect(statusMappingFor('')).toBeNull();
  });
  test('the sale vocabulary carries no rental word and the rental vocabulary carries no sale word', () => {
    for (const w of RENTAL_ONLY) expect(SALE_WORKFLOW_STATUSES as readonly string[]).not.toContain(w);
    for (const w of SALE_ONLY) expect(RENTAL_WORKFLOW_STATUSES as readonly string[]).not.toContain(w);
    expect(RENTAL_CANONICAL_STATUSES as readonly string[]).not.toContain('ComingSoon');
    expect(SALE_CANONICAL_STATUSES as readonly string[]).toContain('ComingSoon');
  });
  test('every workflow word maps to a canonical status OF THAT transaction, with a label, facts and transitions', () => {
    for (const mapping of [SALE_STATUS_MAPPING, RENTAL_STATUS_MAPPING]) {
      for (const w of mapping.workflowStatuses) {
        expect(mapping.canonicalStatuses).toContain(mapping.workflowToCanonical[w]);
        expect(typeof mapping.displayLabels[w]).toBe('string');
        for (const next of mapping.transitions[w]) expect(mapping.workflowStatuses).toContain(next);
      }
      for (const c of mapping.canonicalStatuses) {
        expect(typeof mapping.canonicalLabels[c]).toBe('string');
        expect(Array.isArray(mapping.statusFacts[c])).toBe(true);
        for (const f of mapping.statusFacts[c]) expect(STATUS_FACT_FIELDS).toContain(f);
        for (const next of mapping.canonicalTransitions[c]) expect(mapping.canonicalStatuses).toContain(next);
      }
    }
  });
});

describe('workflow → provider status + associated date (the ruling, line by line)', () => {
  test.each([
    ['sale', 'ContractSigned', 'Pending', ['PurchaseContractDate']],
    ['sale', 'ContractSignedThruUs', 'Pending', ['PurchaseContractDate']],
    ['sale', 'BoardApproved', 'Pending', ['PurchaseContractDate']],
    ['sale', 'Sold', 'Closed', ['CloseDate', 'ClosePrice']],
    ['sale', 'SoldThruUs', 'Closed', ['CloseDate', 'ClosePrice']],
    ['rent', 'Rented', 'Closed', ['CloseDate', 'ClosePrice']],
    ['rent', 'RentedThruUs', 'Closed', ['CloseDate', 'ClosePrice']],
    ['rent', 'Leased', 'Closed', ['CloseDate', 'ClosePrice']],
    ['rent', 'LeaseSigned', 'Pending', [MALLAN_LEASE_SIGNED_DATE_KEY]],
    ['rent', 'LeaseSignedThruUs', 'Pending', [MALLAN_LEASE_SIGNED_DATE_KEY]],
    ['rent', 'BoardApproved', 'Pending', [MALLAN_LEASE_SIGNED_DATE_KEY]],
    ['sale', 'Expired', 'Expired', ['ExpirationDate']],
    ['rent', 'Expired', 'Expired', ['ExpirationDate']],
    ['sale', 'Withdrawn', 'Withdrawn', ['WithdrawnDate']],
    ['rent', 'PermOffMarket', 'Withdrawn', ['WithdrawnDate']],
    ['sale', 'Cancelled', 'Canceled', ['CancellationDate']],
    ['rent', 'Cancelled', 'Canceled', ['CancellationDate']],
    ['sale', 'Hold', 'Hold', []],
    ['rent', 'TempOffMarket', 'Hold', []],
    ['sale', 'BackOnMarket', 'Active', ['BackOnMarketDate']],
    ['rent', 'BackOnMarket', 'Active', ['BackOnMarketDate']],
    ['sale', 'ComingSoon', 'ComingSoon', ['ActivationDate']],
    ['sale', 'Draft', 'Incomplete', []],
    ['rent', 'Future', 'Incomplete', []],
  ])('%s %s → %s + %j', (type, word, canonical, facts) => {
    expect(mapCrmStatusToCanonicalStatus(word, type)).toBe(canonical);
    expect(resolveCanonicalStatusForListing(word, type)).toBe(canonical);
    expect(requiredFactsFor(word, type)).toEqual(facts);
  });

  test('Offer Out, Application Out and Lease Out never map to Pending automatically', () => {
    expect(mapCrmStatusToCanonicalStatus('OfferOut', 'sale')).toBe('Active');
    expect(mapCrmStatusToCanonicalStatus('OfferThruUs', 'sale')).toBe('Active');
    expect(mapCrmStatusToCanonicalStatus('AppOut', 'rent')).toBe('Active');
    expect(mapCrmStatusToCanonicalStatus('AppThruUs', 'rent')).toBe('Active');
    expect(mapCrmStatusToCanonicalStatus('LeaseOut', 'rent')).not.toBe('Pending');
    expect(mapCrmStatusToCanonicalStatus('LeaseOutThruUs', 'rent')).not.toBe('Pending');
    expect(mapCrmStatusToCanonicalStatus('ContractOut', 'sale')).not.toBe('Pending');
  });

  test('the rental never carries PurchaseContractDate: no rental status or word requires it', () => {
    for (const w of RENTAL_WORKFLOW_STATUSES) expect(requiredFactsFor(w, 'rent')).not.toContain('PurchaseContractDate');
    for (const c of RENTAL_CANONICAL_STATUSES) expect(RENTAL_STATUS_MAPPING.statusFacts[c]).not.toContain('PurchaseContractDate');
    expect(SALE_STATUS_MAPPING.statusFacts.Pending).toEqual(['PurchaseContractDate']);
    expect(RENTAL_STATUS_MAPPING.statusFacts.Pending).toEqual([MALLAN_LEASE_SIGNED_DATE_KEY]);
  });

  test('Expired requires ExpirationDate, never OffMarketDate', () => {
    for (const type of ['sale', 'rent']) {
      expect(requiredFactsFor('Expired', type)).toEqual(['ExpirationDate']);
      expect(requiredFactsFor('Expired', type)).not.toContain('OffMarketDate');
    }
  });
});

describe('resolveCanonicalStatusForListing — this transaction only', () => {
  test.each([
    ['Closed', 'sale', 'Closed'], ['Closed', 'rent', 'Closed'], ['Canceled', 'sale', 'Canceled'], ['Incomplete', 'rent', 'Incomplete'],
    ['Pending', 'sale', 'Pending'], ['ActiveUnderContract', 'rent', 'ActiveUnderContract'],
    // legacy stored spellings (rows written before the token correction) resolve to the token
    ['Sold', 'sale', 'Closed'], ['Rented', 'rent', 'Closed'], ['Leased', 'rent', 'Closed'], ['Cancelled', 'sale', 'Canceled'], ['Draft', 'rent', 'Incomplete'],
    ['  Active  ', 'sale', 'Active'],
  ])('%s on %s → %s', (input, type, expected) => {
    expect(resolveCanonicalStatusForListing(input, type)).toBe(expected);
  });
  test.each([
    ['Leased', 'sale'], ['Rented', 'sale'], ['RentedThruUs', 'sale'], ['AppAccepted', 'sale'], ['LeaseOut', 'sale'],
    ['Sold', 'rent'], ['SoldThruUs', 'rent'], ['ContractSigned', 'rent'], ['OfferOut', 'rent'], ['ComingSoon', 'rent'],
    ['Nonsense', 'sale'], ['', 'sale'], ['Closed', 'commercial'], ['Active', null],
  ])('%s on %s is refused (null)', (input, type) => {
    expect(resolveCanonicalStatusForListing(input, type)).toBeNull();
    expect(requiredFactsFor(input, type)).toBeNull();
  });
});

describe('normalizeCrmWorkflowStatus — per transaction', () => {
  test('normalizes exact and case-insensitive matches within the transaction', () => {
    expect(normalizeCrmWorkflowStatus('backonmarket', 'sale')).toBe('BackOnMarket');
    expect(normalizeCrmWorkflowStatus('leasesigned', 'rent')).toBe('LeaseSigned');
  });
  test('the other transaction\'s word is unknown, not guarded; unknown transaction → null', () => {
    for (const w of RENTAL_ONLY) expect(normalizeCrmWorkflowStatus(w, 'sale')).toBeNull();
    for (const w of SALE_ONLY) expect(normalizeCrmWorkflowStatus(w, 'rent')).toBeNull();
    expect(normalizeCrmWorkflowStatus('Active', 'commercial')).toBeNull();
    expect(normalizeCrmWorkflowStatus(null, 'rent')).toBeNull();
  });
});

describe('labels — broker language per transaction, applied at display time', () => {
  test('Closed reads Sold on a sale and Rented on a rental; Pending reads In Contract on a sale', () => {
    expect(getStatusDisplayLabel('Closed', 'sale')).toBe('Sold');
    expect(getStatusDisplayLabel('Closed', 'rent')).toBe('Rented');
    expect(getStatusDisplayLabel('Pending', 'sale')).toBe('In Contract');
    expect(getStatusDisplayLabel('Pending', 'rent')).toBe('Pending');
    expect(getStatusDisplayLabel('Canceled', 'sale')).toBe('Canceled');
    expect(getStatusDisplayLabel('Cancelled', 'rent')).toBe('Canceled'); // the workflow word, labelled with the live spelling
    expect(getStatusDisplayLabel('SoldThruUs', 'sale')).toBe('Sold Thru Us');
    expect(getStatusDisplayLabel('AppOut', 'rent')).toBe('Application Out');
  });
  test('a word of the other transaction (or an unknown one) falls back to the input', () => {
    expect(getStatusDisplayLabel('AppOut', 'sale')).toBe('AppOut');
    expect(getStatusDisplayLabel('Whatever', 'sale')).toBe('Whatever');
  });
});

describe('public display and terminal', () => {
  test('Active, ComingSoon, ActiveUnderContract are public-display eligible; drafts, holds and terminals are not', () => {
    for (const s of ['Active', 'ComingSoon', 'ActiveUnderContract']) expect(isPublicDisplayStatus(s)).toBe(true);
    for (const s of ['Incomplete', 'Withdrawn', 'Expired', 'Closed', 'Hold', 'Pending', 'Canceled']) expect(isPublicDisplayStatus(s)).toBe(false);
  });
  test('terminal = Closed / Withdrawn / Expired / Canceled / Delete — and their legacy spellings', () => {
    for (const s of ['Closed', 'Withdrawn', 'Expired', 'Canceled', 'Delete', 'Sold', 'Rented', 'Leased', 'Cancelled']) expect(isTerminalStatus(s)).toBe(true);
    for (const s of ['Active', 'Incomplete', 'Draft', 'Pending', 'Hold', 'Delisted']) expect(isTerminalStatus(s)).toBe(false);
  });
});

describe('workflow transition validation — per transaction pipeline', () => {
  test('valid transitions return null', () => {
    expect(getStatusTransitionError('Draft', 'Active', 'sale')).toBeNull();
    expect(getStatusTransitionError('ContractSigned', 'Sold', 'sale')).toBeNull();
    expect(getStatusTransitionError('Active', 'AppOut', 'rent')).toBeNull();
    expect(getStatusTransitionError('LeaseSigned', 'Rented', 'rent')).toBeNull();
  });
  test('a sale never moves into a rental word and vice versa; terminals have no exits', () => {
    expect(getStatusTransitionError('Active', 'AppOut', 'sale')).toMatch(/Unknown target status/);
    expect(getStatusTransitionError('Active', 'OfferOut', 'rent')).toMatch(/Unknown target status/);
    expect(getStatusTransitionError('Draft', 'ComingSoon', 'rent')).toMatch(/Unknown target status/);
    expect(getStatusTransitionError('Rented', 'Active', 'rent')).toMatch(/none \(terminal\)/);
    expect(getStatusTransitionError('Active', 'OfferOut', 'commercial')).toMatch(/Unknown transaction type/);
  });
});

describe('canonical transitions — the status API state machine per transaction (live tokens)', () => {
  test('a sale in contract closes as Closed; a rental in contract closes as Closed; both are labelled by transaction', () => {
    expect(allowedCanonicalTransitions('Pending', 'sale')).toEqual(['Closed', 'Active', 'Withdrawn', 'Canceled']);
    expect(allowedCanonicalTransitions('Pending', 'rent')).toEqual(['Closed', 'Active', 'Withdrawn', 'Canceled']);
  });
  test('a rental draft never goes Coming Soon; a sale draft may; legacy Draft resolves to Incomplete', () => {
    expect(allowedCanonicalTransitions('Incomplete', 'rent')).toEqual(['Active']);
    expect(allowedCanonicalTransitions('Draft', 'sale')).toEqual(['Active', 'ComingSoon']);
  });
  test('Closed and Canceled are terminal (legacy Sold / Rented / Cancelled too); unknown → null', () => {
    for (const s of ['Closed', 'Sold', 'Canceled', 'Cancelled']) expect(allowedCanonicalTransitions(s, 'sale')).toEqual([]);
    for (const s of ['Closed', 'Rented', 'Leased']) expect(allowedCanonicalTransitions(s, 'rent')).toEqual([]);
    expect(allowedCanonicalTransitions('Sold', 'rent')).toBeNull();
    expect(allowedCanonicalTransitions('Garbage', 'sale')).toBeNull();
  });
});

describe('buildStatusPayload — per transaction, with the facts the transition must carry', () => {
  test('sale Contract Signed', () => {
    expect(buildStatusPayload('ContractSigned', 'sale')).toEqual({ canonicalStatus: 'Pending', workflowStatus: 'ContractSigned', displayLabel: 'Contract Signed', requiredFacts: ['PurchaseContractDate'] });
  });
  test('rental Lease Signed carries the Mallan lease-signed date, never PurchaseContractDate', () => {
    expect(buildStatusPayload('LeaseSigned', 'rent')).toEqual({ canonicalStatus: 'Pending', workflowStatus: 'LeaseSigned', displayLabel: 'Lease Signed', requiredFacts: [MALLAN_LEASE_SIGNED_DATE_KEY] });
  });
  test('the other transaction\'s word, garbage, or an unknown transaction is an error', () => {
    expect('error' in buildStatusPayload('LeaseSigned', 'sale')).toBe(true);
    expect('error' in buildStatusPayload('OfferOut', 'rent')).toBe(true);
    expect('error' in buildStatusPayload('Active', 'commercial')).toBe(true);
  });
});

describe('formStatusForListing — the server projection the four forms / viewers render', () => {
  const row = (o: Record<string, unknown>) => ({ status: undefined as unknown, sync_status: 'synced', terminal_since: null, raw_data: {}, ...o });
  test('a closed row shows the transaction close: Sold on a sale, Rented on a rental (token Closed; legacy Sold / Rented rows too)', () => {
    expect(formStatusForListing(row({ status: 'Closed', listing_type: 'sale', raw_data: { StandardStatus: 'Closed' } }))).toEqual({ value: 'Closed', label: 'Sold', providerStatus: 'Closed' });
    expect(formStatusForListing(row({ status: 'Closed', listing_type: 'rent' }))).toMatchObject({ value: 'Closed', label: 'Rented' });
    expect(formStatusForListing(row({ status: 'Sold', listing_type: 'sale' }))).toMatchObject({ value: 'Closed', label: 'Sold' });
    expect(formStatusForListing(row({ status: 'Rented', listing_type: 'rent' }))).toMatchObject({ value: 'Closed', label: 'Rented' });
  });
  test('Pending reads In Contract on a sale and Pending on a rental; the agent\'s agreeing workflow word wins', () => {
    expect(formStatusForListing(row({ status: 'Pending', listing_type: 'sale' }))).toMatchObject({ value: 'Pending', label: 'In Contract' });
    expect(formStatusForListing(row({ status: 'Pending', listing_type: 'rent' }))).toMatchObject({ value: 'Pending', label: 'Pending' });
    expect(formStatusForListing(row({ status: 'Pending', listing_type: 'sale', raw_data: { _crmWorkflowStatus: 'ContractSigned' } }))).toMatchObject({ value: 'ContractSigned', label: 'Contract Signed' });
    expect(formStatusForListing(row({ status: 'Closed', listing_type: 'sale', raw_data: { _crmWorkflowStatus: 'SoldThruUs' } }))).toMatchObject({ value: 'SoldThruUs', label: 'Sold Thru Us' });
    expect(formStatusForListing(row({ status: 'Incomplete', listing_type: 'rent', raw_data: { _crmWorkflowStatus: 'Draft' } }))).toMatchObject({ value: 'Draft', label: 'Draft' });
  });
  test('a rental word on a sale row, or a stale word, is not shown; the stored state is', () => {
    expect(formStatusForListing(row({ status: 'Pending', listing_type: 'sale', raw_data: { _crmWorkflowStatus: 'LeaseSigned' } }))).toMatchObject({ value: 'Pending', label: 'In Contract' });
    expect(formStatusForListing(row({ status: 'Active', listing_type: 'sale', raw_data: { _crmWorkflowStatus: 'ContractSigned' } }))).toMatchObject({ value: 'Active', label: 'Active' });
  });
  test('unknown transaction, blank status and an off-feed row are never invented into a status', () => {
    expect(formStatusForListing(row({ status: 'Active', listing_type: null }))).toMatchObject({ value: '', label: 'Status unavailable' });
    expect(formStatusForListing(row({ status: '', listing_type: 'sale' }))).toMatchObject({ value: '', label: 'Status unavailable' });
    expect(formStatusForListing(row({ status: 'Active', listing_type: 'sale', sync_status: 'off_feed', terminal_since: new Date('2026-08-01T00:00:00Z'), raw_data: { StandardStatus: 'Active' } })))
      .toEqual({ value: '', label: 'Off Market — reason unknown', providerStatus: 'Active' });
  });
});

describe('statusPresentation — what manage listings, portals, dashboards and CMA render', () => {
  const row = (o: Record<string, unknown>) => ({ status: undefined as unknown, sync_status: 'synced', terminal_since: null, raw_data: {}, ...o });
  test('the exact provider token plus the transaction label', () => {
    expect(statusPresentation(row({ status: 'Closed', listing_type: 'sale' }))).toMatchObject({ status: 'Closed', label: 'Sold', transaction: 'sale', workflow: null });
    expect(statusPresentation(row({ status: 'Closed', listing_type: 'rent', raw_data: { _crmWorkflowStatus: 'RentedThruUs' } }))).toMatchObject({ status: 'Closed', label: 'Rented', workflow: 'RentedThruUs', workflowLabel: 'Rented Thru Us' });
    expect(statusPresentation(row({ status: 'Pending', listing_type: 'sale' }))).toMatchObject({ status: 'Pending', label: 'In Contract' });
    expect(statusPresentation(row({ status: 'Cancelled', listing_type: 'rent' }))).toMatchObject({ status: 'Canceled', label: 'Canceled' });
    expect(statusPresentation(row({ status: 'Draft', listing_type: 'sale' }))).toMatchObject({ status: 'Incomplete', label: 'Incomplete' });
  });
  test('Off Market is the presence fact, never a status; an unknown state is unavailable', () => {
    expect(statusPresentation(row({ status: 'Active', listing_type: 'sale', sync_status: 'off_feed', terminal_since: new Date('2026-08-01T00:00:00Z') }))).toMatchObject({ status: 'Active', label: 'Off Market — reason unknown', offMarket: true });
    expect(statusPresentation(row({ status: 'Bogus', listing_type: 'sale' }))).toMatchObject({ status: null, label: 'Status unavailable' });
    expect(statusPresentation(row({ status: 'Active', listing_type: 'commercial' }))).toMatchObject({ status: null, label: 'Status unavailable', transaction: null });
  });
});
