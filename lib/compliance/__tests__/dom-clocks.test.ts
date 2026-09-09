/**
 * DOM is TWO clocks (Maya 2026-09-08), and ONE rule for each — lib/compliance/dom-tracker.ts is the rule's only home.
 *
 *   A. Coming Soon DOM — from the day the status became Coming Soon (ContractStatusChangeDate; equals the
 *      StatusChangeTimestamp day on every live Coming Soon row) to the as-of day, with the countdown to
 *      ActivationDate (REBNY's First Showing Date). Never merged into the market clock.
 *   B. Market DOM — from the day the property is on market (the later of OnMarketDate and ActivationDate: Coming
 *      Soon days are not market days) until the contract is signed.
 *
 * Contract signed, proven on the live feed 2026-09-08 (docs/operations/evidence-2026-09-08/dom/):
 *   Sale   — PurchaseContractDate on a Pending / Closed row (REBNY's required "Purchase Contract Signed Date (for
 *            Pending)"; on 100% of Pending sales; precedes CloseDate by a median 83 days). On an ACTIVE row it is NOT
 *            a signed contract: 178 live Active rows carry one — 92 predate a BackOnMarketDate (a fallen contract),
 *            80 are stale entries with no status change — and ContingentDate is populated on 0 rows.
 *   Rental — PurchaseContractDate on a Pending / Closed row (97.7% of Pending rentals), else the Leased date
 *            (CloseDate, REBNY's "Sold or Leased Date") on a Closed row.
 *   PendingTimestamp is the status-change timestamp (equals PurchaseContractDate on only 61% of Pending sales) and is
 *   never a contract date. The provider's DaysOnMarket is null on every sampled row of this feed and is never read.
 */
import { lifecycleFromProviderRow, lifecycleFromStoredRow, type ListingLifecycle } from '@/lib/listings/canonical-lifecycle';
import { REBNY_UCBA_RULES } from '../rebny-ucba-rules';
import {
  DOM_ACCRUING_STATUSES,
  DOM_RESET_ELIGIBLE_STATUSES,
  comingSoonDom,
  contractSignedDate,
  getCurrentDom,
  marketClockStart,
  marketDom,
} from '../dom-tracker';

const ASOF = '2026-09-08';
const sale = (o: Record<string, unknown>): ListingLifecycle => lifecycleFromProviderRow({ PropertyType: 'Residential', ...o } as never)!;
const rent = (o: Record<string, unknown>): ListingLifecycle => lifecycleFromProviderRow({ PropertyType: 'ResidentialLease', ...o } as never)!;

describe('one accrual rule — the two rule surfaces cannot disagree', () => {
  it('the market clock runs while Active or ActiveUnderContract (the CRM "Offer Accepted") and stops at Pending (the CRM "Contract Signed")', () => {
    expect([...DOM_ACCRUING_STATUSES].sort()).toEqual(['Active', 'ActiveUnderContract']);
    expect(DOM_ACCRUING_STATUSES.has('Pending')).toBe(false);
    expect([...DOM_RESET_ELIGIBLE_STATUSES].sort()).toEqual(['Cancelled', 'Withdrawn']);
  });
  it('the declared UCBA rule table is DERIVED from the tracker — no second accrual set survives', () => {
    expect([...REBNY_UCBA_RULES.domRules.accruingStatuses].sort()).toEqual([...DOM_ACCRUING_STATUSES].sort());
    expect(REBNY_UCBA_RULES.domRules.accruingStatuses as readonly string[]).not.toContain('Pending');
    expect(REBNY_UCBA_RULES.domRules.stopsAt).toBe('Pending');
  });
});

describe('contract signed — the exact provider field per transaction type', () => {
  it('sale: PurchaseContractDate on a Pending row', () => {
    expect(contractSignedDate(sale({ StandardStatus: 'Pending', PurchaseContractDate: '2026-07-30', PendingTimestamp: '2026-07-31T00:00:00.000-00:00' }))).toBe('2026-07-30');
  });
  it('sale: PurchaseContractDate on a Closed row — never the CloseDate (the closing is not the contract)', () => {
    expect(contractSignedDate(sale({ StandardStatus: 'Closed', PurchaseContractDate: '2026-05-01', CloseDate: '2026-08-01' }))).toBe('2026-05-01');
    expect(contractSignedDate(sale({ StandardStatus: 'Closed', CloseDate: '2026-08-01' }))).toBeNull();
  });
  it('sale: a PurchaseContractDate on an ACTIVE row is not a signed contract (fallen or unconfirmed) — the clock keeps running', () => {
    expect(contractSignedDate(sale({ StandardStatus: 'Active', PurchaseContractDate: '2026-06-01', BackOnMarketDate: '2026-07-01', MajorChangeType: 'BackOnMarket' }))).toBeNull();
    expect(contractSignedDate(sale({ StandardStatus: 'Active', PurchaseContractDate: '2026-08-31' }))).toBeNull();
  });
  it('sale: PendingTimestamp is a status-change timestamp, never the contract date', () => {
    expect(contractSignedDate(sale({ StandardStatus: 'Pending', PendingTimestamp: '2026-07-05T00:00:00.000-00:00' }))).toBeNull();
  });
  it('rental: PurchaseContractDate on a Pending or Closed row; the Leased date when a Closed rental carries none', () => {
    expect(contractSignedDate(rent({ StandardStatus: 'Pending', PurchaseContractDate: '2026-08-20' }))).toBe('2026-08-20');
    expect(contractSignedDate(rent({ StandardStatus: 'Closed', PurchaseContractDate: '2026-08-20', CloseDate: '2026-08-26' }))).toBe('2026-08-20');
    expect(contractSignedDate(rent({ StandardStatus: 'Closed', CloseDate: '2026-08-26' }))).toBe('2026-08-26');
    expect(contractSignedDate(rent({ StandardStatus: 'Active', PurchaseContractDate: '2026-08-20' }))).toBeNull();
  });
});

describe('market clock start — the day the property is on market', () => {
  it('OnMarketDate when it is the activation day (entered Active: the common case)', () => {
    expect(marketClockStart(sale({ StandardStatus: 'Active', OnMarketDate: '2026-05-30', ActivationDate: '2026-05-30' }).contractEvents)).toBe('2026-05-30');
  });
  it('ActivationDate (First Showing Date) when the listing entered as Coming Soon — Coming Soon days are not market days', () => {
    expect(marketClockStart(sale({ StandardStatus: 'Active', OnMarketDate: '2026-07-27', ActivationDate: '2026-07-28' }).contractEvents)).toBe('2026-07-28');
  });
  it('OnMarketDate when the First Showing Date was back-dated to the listing contract date', () => {
    expect(marketClockStart(sale({ StandardStatus: 'Active', OnMarketDate: '2026-05-05', ActivationDate: '2026-03-01', ListingContractDate: '2026-03-01' }).contractEvents)).toBe('2026-05-05');
  });
  it('null when neither is delivered — never ListingContractDate, the entry time, or a Mallan created_at', () => {
    expect(marketClockStart(sale({ StandardStatus: 'Active', ListingContractDate: '2026-03-01', OriginalEntryTimestamp: '2026-03-01T10:00:00.000-00:00' }).contractEvents)).toBeNull();
  });
});

describe('market DOM — listed → contract signed', () => {
  it('a Pending sale: on market 2026-03-24, contract signed 2026-08-25 → 154 days, frozen at the contract', () => {
    const l = sale({ StandardStatus: 'Pending', OnMarketDate: '2026-03-24', ActivationDate: '2026-03-24', PurchaseContractDate: '2026-08-25', PendingTimestamp: '2026-08-27T13:00:00.000-00:00' });
    expect(marketDom(l, ASOF)).toEqual({ start: '2026-03-24', end: '2026-08-25', endReason: 'contract_signed', days: 154, unverified: null });
    expect(marketDom(l, '2027-01-01').days).toBe(154);
  });
  it('an Active sale keeps counting to the as-of day', () => {
    expect(marketDom(sale({ StandardStatus: 'Active', OnMarketDate: '2026-05-30', ActivationDate: '2026-05-30' }), ASOF)).toMatchObject({ start: '2026-05-30', end: ASOF, endReason: 'as_of', days: 101 });
  });
  it('an ex-Coming-Soon listing starts at the First Showing Date', () => {
    expect(marketDom(sale({ StandardStatus: 'Active', OnMarketDate: '2026-07-27', ActivationDate: '2026-07-28' }), ASOF).days).toBe(42);
  });
  it('a Coming Soon listing has no market days yet (activation in the future → 0), never a negative', () => {
    const l = sale({ StandardStatus: 'ComingSoon', OnMarketDate: '2026-09-01', ActivationDate: '2026-09-14', ContractStatusChangeDate: '2026-09-01' });
    expect(marketDom(l, ASOF)).toMatchObject({ start: '2026-09-14', days: 0, endReason: 'as_of' });
  });
  it('back on market after a fallen contract: the stale PurchaseContractDate does not stop the clock', () => {
    const l = sale({ StandardStatus: 'Active', OnMarketDate: '2026-01-10', ActivationDate: '2026-01-10', PurchaseContractDate: '2026-03-01', BackOnMarketDate: '2026-04-01', MajorChangeType: 'BackOnMarket' });
    expect(l.backOnMarket).toBe(true);
    expect(marketDom(l, ASOF)).toMatchObject({ end: ASOF, endReason: 'as_of', days: 241 });
  });
  it('a row off the feed stops the day it left (the Mallan Off Market state)', () => {
    const l = lifecycleFromStoredRow({ status: 'Active', listing_type: 'sale', sync_status: 'off_feed', terminal_since: new Date('2026-08-01T03:30:00Z'), raw_data: { OnMarketDate: '2026-05-01', ActivationDate: '2026-05-01' } });
    expect(marketDom(l, ASOF)).toEqual({ start: '2026-05-01', end: '2026-08-01', endReason: 'off_feed', days: 92, unverified: null });
  });
  it('a Closed sale without a PurchaseContractDate has NO market DOM — nothing is guessed from the close', () => {
    const d = marketDom(sale({ StandardStatus: 'Closed', OnMarketDate: '2026-01-10', ActivationDate: '2026-01-10', CloseDate: '2026-08-01' }), ASOF);
    expect(d.days).toBeNull();
    expect(d.endReason).toBeNull();
    expect(d.unverified).toMatch(/contract/i);
  });
  it('a row without an on-market date has NO market DOM (never a fabricated start)', () => {
    expect(marketDom(sale({ StandardStatus: 'Active', ListingContractDate: '2026-01-10' }), ASOF)).toMatchObject({ start: null, days: null });
  });
  it('the provider DaysOnMarket is never consulted', () => {
    expect(marketDom(sale({ StandardStatus: 'Active', OnMarketDate: '2026-09-01', ActivationDate: '2026-09-01', DaysOnMarket: 999 }), ASOF).days).toBe(7);
  });
});

describe('Coming Soon DOM — a separate clock', () => {
  // Live row RLS20112015 (2026-09-08): OnMarketDate back-dated to the listing contract date, status entered Coming
  // Soon on 09-01 (ContractStatusChangeDate = StatusChangeTimestamp day), activation 09-09.
  const cs = sale({ StandardStatus: 'ComingSoon', OnMarketDate: '2026-08-27', ListingContractDate: '2026-08-27', ContractStatusChangeDate: '2026-09-01', ActivationDate: '2026-09-09', OriginalEntryTimestamp: '2026-09-01T11:23:15.000-00:00' });
  it('runs from the day the status became Coming Soon to the as-of day, with the countdown to activation', () => {
    expect(comingSoonDom(cs, ASOF)).toEqual({ start: '2026-09-01', activation: '2026-09-09', days: 7, daysUntilActivation: 1, exceedsFourteenDays: false });
  });
  it('is never merged into the market clock', () => {
    expect(marketDom(cs, ASOF).days).toBe(0);
  });
  it('is null for any other stage', () => {
    expect(comingSoonDom(sale({ StandardStatus: 'Active', OnMarketDate: '2026-09-01', ActivationDate: '2026-09-01' }), ASOF)).toBeNull();
    expect(comingSoonDom(sale({ StandardStatus: 'Pending', OnMarketDate: '2026-09-01', ActivationDate: '2026-09-01', PurchaseContractDate: '2026-09-05' }), ASOF)).toBeNull();
  });
  it('flags the UCBA Art. I §16 fourteen-day maximum', () => {
    const late = sale({ StandardStatus: 'ComingSoon', OnMarketDate: '2026-08-01', ContractStatusChangeDate: '2026-08-01', ActivationDate: '2026-08-15' });
    expect(comingSoonDom(late, ASOF)).toEqual({ start: '2026-08-01', activation: '2026-08-15', days: 38, daysUntilActivation: -24, exceedsFourteenDays: true });
  });
});

describe('the stored-column clock is the fallback for rows without provider dates', () => {
  const daysAgo = (n: number): Date => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(d.getHours() - 1); return d; };
  it('getCurrentDom prefers the provider-dated market clock when the lifecycle carries one', () => {
    const lifecycle = lifecycleFromStoredRow({ status: 'Active', listing_type: 'sale', sync_status: 'synced', raw_data: { OnMarketDate: '2026-08-29', ActivationDate: '2026-08-29' } });
    const stored = { status: 'Active', participant_only: false, status_changed_at: daysAgo(3), first_active_date: daysAgo(3), days_on_market: 50 };
    expect(getCurrentDom(stored, { lifecycle, asOf: ASOF })).toBe(10);
    expect(getCurrentDom(stored)).toBe(53);
  });
  it('a Mallan-authored row without provider dates keeps the stored accrual', () => {
    const lifecycle = lifecycleFromStoredRow({ status: 'Active', listing_type: 'sale', raw_data: {} });
    expect(getCurrentDom({ status: 'Active', participant_only: false, status_changed_at: daysAgo(3), first_active_date: daysAgo(3), days_on_market: 50 }, { lifecycle, asOf: ASOF })).toBe(53);
  });
});

describe('the two clocks, end to end — Coming Soon duration; market DOM from listing start until sold / rented / off-market', () => {
  const csRow = { StandardStatus: 'ComingSoon', OnMarketDate: '2026-08-20', ContractStatusChangeDate: '2026-09-01', ActivationDate: '2026-09-10' };
  it('Coming Soon DURATION accrues day by day on its own clock while the market clock stays at zero', () => {
    const l = sale(csRow);
    expect(comingSoonDom(l, '2026-09-01')).toEqual({ start: '2026-09-01', activation: '2026-09-10', days: 0, daysUntilActivation: 9, exceedsFourteenDays: false });
    expect(comingSoonDom(l, '2026-09-08')).toMatchObject({ days: 7, daysUntilActivation: 2, exceedsFourteenDays: false });
    expect(comingSoonDom(l, '2026-09-16')).toMatchObject({ days: 15, daysUntilActivation: -6, exceedsFourteenDays: true });
    for (const day of ['2026-09-01', '2026-09-08']) expect(marketDom(l, day).days).toBe(0);
  });
  it('once activated the Coming Soon clock is gone and the market clock starts at the First Showing Date, never at the Coming Soon day', () => {
    const l = sale({ ...csRow, StandardStatus: 'Active' });
    expect(comingSoonDom(l, '2026-09-20')).toBeNull();
    expect(marketDom(l, '2026-09-10')).toMatchObject({ start: '2026-09-10', days: 0, endReason: 'as_of' });
    expect(marketDom(l, '2026-09-20')).toMatchObject({ start: '2026-09-10', days: 10, endReason: 'as_of' });
  });
  it('market DOM until SOLD: a Closed sale stops at the signed contract (PurchaseContractDate) — not at the closing — and never grows afterwards', () => {
    const l = sale({ StandardStatus: 'Closed', OnMarketDate: '2026-01-10', ActivationDate: '2026-01-10', PurchaseContractDate: '2026-05-01', CloseDate: '2026-06-15', ClosePrice: 950000 });
    expect(l.providerStage).toBe('closed');
    expect(marketDom(l, ASOF)).toEqual({ start: '2026-01-10', end: '2026-05-01', endReason: 'contract_signed', days: 111, unverified: null });
    expect(marketDom(l, '2027-06-15').days).toBe(111);
    expect(comingSoonDom(l, ASOF)).toBeNull();
  });
  it('market DOM until RENTED: a Closed rental stops at the signed lease (PurchaseContractDate), else at the Leased date (CloseDate)', () => {
    const signed = rent({ StandardStatus: 'Closed', OnMarketDate: '2026-06-01', ActivationDate: '2026-06-01', PurchaseContractDate: '2026-06-20', CloseDate: '2026-07-01' });
    expect(marketDom(signed, ASOF)).toEqual({ start: '2026-06-01', end: '2026-06-20', endReason: 'contract_signed', days: 19, unverified: null });
    const leasedOnly = rent({ StandardStatus: 'Closed', OnMarketDate: '2026-06-01', ActivationDate: '2026-06-01', CloseDate: '2026-07-01' });
    expect(marketDom(leasedOnly, ASOF)).toEqual({ start: '2026-06-01', end: '2026-07-01', endReason: 'contract_signed', days: 30, unverified: null });
    expect(marketDom(leasedOnly, '2027-01-01').days).toBe(30);
  });
  it('market DOM until OFF MARKET: a sale or a rental that left the feed stops the day it left, the last provider status preserved, no Coming Soon clock', () => {
    for (const listing_type of ['sale', 'rent']) {
      const l = lifecycleFromStoredRow({ status: 'Active', listing_type, sync_status: 'off_feed', terminal_since: new Date('2026-08-15T12:00:00Z'), raw_data: { StandardStatus: 'Active', OnMarketDate: '2026-06-01', ActivationDate: '2026-06-01' } });
      expect(l.stage).toBe('off_market');
      expect(marketDom(l, ASOF)).toEqual({ start: '2026-06-01', end: '2026-08-15', endReason: 'off_feed', days: 75, unverified: null });
      expect(comingSoonDom(l, ASOF)).toBeNull();
    }
  });
  it('the two clocks never share a day: Coming Soon 2026-01-01 → activation 01-10, contract 05-01 — market DOM 111, the Coming Soon clock retired with its stage', () => {
    const l = sale({ StandardStatus: 'Closed', OnMarketDate: '2026-01-01', ContractStatusChangeDate: '2026-01-01', ActivationDate: '2026-01-10', PurchaseContractDate: '2026-05-01', CloseDate: '2026-06-15' });
    expect(marketDom(l, ASOF)).toMatchObject({ start: '2026-01-10', end: '2026-05-01', days: 111 });
    expect(comingSoonDom(l, ASOF)).toBeNull();
  });
});
