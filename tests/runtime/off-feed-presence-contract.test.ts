/// <reference types="jest" />
/**
 * THE OFF-FEED PRESENCE CONTRACT (owner rulings, Maya 2026-09-09).
 *
 * A listing that disappears from the licensed feed keeps its LAST OBSERVED provider status. Departure is recorded
 * as a PRESENCE fact — `sync_status = 'off_feed'` with `terminal_since` as the off-feed-since day — and is never
 * turned into a manufactured Withdrawn / Expired / Canceled / Hold / Delete status. Such a row:
 *
 *   - displays as "Off Market — reason unknown" (the reason is unknown unless the provider or a Mallan agent
 *     supplied one);
 *   - leaves public display immediately;
 *   - ends its market DOM at the off-feed-since day, flagged `estimated` because that day is when Mallan DETECTED
 *     the disappearance, not a proven removal date;
 *   - returns to presence without inventing a Back on Market event.
 *
 * WHY THIS FILE EXISTS: production currently holds ZERO rows with `sync_status = 'off_feed'` (verified read-only
 * 2026-09-09) because the deployed reconciliation overwrites the status instead of recording presence. No consumer
 * has ever been exercised against an off-feed row, so the exclusion cannot be proven empirically from the data —
 * it is proven here, structurally and behaviourally, BEFORE the 6,953-row correction is executed.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { lifecycleFromStoredRow, OFF_FEED_SYNC_STATUS, OFF_MARKET_LABEL } from '@/lib/listings/canonical-lifecycle';
import { marketDom, getCurrentDom } from '@/lib/compliance/dom-tracker';
import { statusPresentation } from '@/lib/crm/status-mapping';
import { reconcileStatusDecision } from '@/lib/idx/reconcile-decision';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const ASOF = '2026-09-09';

/** A provider row that was last observed on-market and has since disappeared from the feed. */
const departed = (status: string, listing_type: 'sale' | 'rent' = 'sale', extra: Record<string, unknown> = {}) =>
  lifecycleFromStoredRow({
    status,
    listing_type,
    sync_status: OFF_FEED_SYNC_STATUS,
    terminal_since: new Date('2026-08-15T00:00:00Z'),
    raw_data: { StandardStatus: status, OnMarketDate: '2026-06-01', ActivationDate: '2026-06-01', ...extra },
  });

describe('a disappeared listing keeps its last observed provider status', () => {
  it.each([
    ['Active', 'sale'], ['Active', 'rent'], ['Pending', 'sale'], ['Pending', 'rent'], ['ComingSoon', 'sale'],
  ] as const)('%s (%s): the reconciler preserves the status and records presence instead', (status, type) => {
    const d = reconcileStatusDecision(status, { kind: 'absent' }, 'synced');
    expect(d.targetStatus).toBe(status);
    expect(d.targetIsTerminal).toBe(false);
    expect(d.targetSyncStatus).toBe(OFF_FEED_SYNC_STATUS);
    // and the stored row still reports the provider's own last word
    expect(departed(status, type).providerStatus).toBe(status);
    expect(departed(status, type).storageStatus).toBe(status);
  });

  it('NO absent listing is ever transitioned to a manufactured terminal status', () => {
    for (const status of ['Active', 'ActiveUnderContract', 'Pending', 'ComingSoon']) {
      const d = reconcileStatusDecision(status, { kind: 'absent' }, 'synced');
      for (const invented of ['Withdrawn', 'Expired', 'Canceled', 'Cancelled', 'Hold', 'Delete']) {
        expect(d.targetStatus).not.toBe(invented);
      }
    }
  });

  it('an already off-feed row is left alone (no repeated transition, no clock bump)', () => {
    const d = reconcileStatusDecision('Active', { kind: 'absent' }, OFF_FEED_SYNC_STATUS);
    expect(d.action).toBe('none');
  });

  it('the deployed-era behaviour is gone from the source: no writer manufactures Withdrawn on absence', () => {
    const cron = read('app/api/cron/feed-reconcile/route.ts');
    expect(cron).not.toMatch(/Not present in Trestle Active feed at reconcile time/);
    expect(cron).not.toMatch(/to_status:\s*['"]Withdrawn['"]/);
    // the transition is decided by the ONE authority, never by a literal
    expect(cron).toMatch(/reconcileStatusDecision\(/);
    expect(cron).toMatch(/status: decision\.targetStatus/);
  });
});

describe('a disappeared listing reads Off Market with the reason unknown', () => {
  it('the lifecycle stage is off_market and the label says the reason is unknown', () => {
    const l = departed('Active');
    expect(l.stage).toBe('off_market');
    expect(l.label).toBe(OFF_MARKET_LABEL);
    expect(OFF_MARKET_LABEL).toMatch(/reason unknown/i);
  });

  it('the CRM / portal projection shows the Off Market label, keeps the provider status, and flags the presence', () => {
    const row = { status: 'Active', listing_type: 'sale', sync_status: OFF_FEED_SYNC_STATUS, terminal_since: new Date('2026-08-15T00:00:00Z'), raw_data: { StandardStatus: 'Active' } };
    const p = statusPresentation(row);
    expect(p.offMarket).toBe(true);
    expect(p.label).toBe(OFF_MARKET_LABEL);
    expect(p.providerStatus).toBe('Active');
    expect(p.status).toBe('Active'); // the last observed provider status is preserved, never rewritten
  });

  it('a Mallan agent decision is NOT reason-unknown: an agent-set Withdrawn keeps its own label', () => {
    const l = lifecycleFromStoredRow({ status: 'Withdrawn', listing_type: 'sale', sync_status: 'synced', raw_data: { WithdrawnDate: '2026-07-01' } });
    expect(l.stage).toBe('withdrawn');
    expect(l.label).not.toBe(OFF_MARKET_LABEL);
  });
});

describe('a disappeared listing leaves public display immediately', () => {
  it('the lifecycle refuses public display for every on-market status that went off feed', () => {
    for (const status of ['Active', 'ActiveUnderContract', 'Pending', 'ComingSoon']) {
      expect(departed(status).publiclyDisplayable).toBe(false);
    }
  });

  it('the public DTO filter drops it, whatever its stored status says', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { filterDisplayableDbListings } = require('@/lib/idx/db-to-public-dto');
    const base = {
      id: 1n, listing_id: 'RLS1', status: 'Active', listing_type: 'sale', idx_display_yn: true,
      owner_opt_out: false, participant_only: false, internet_entire_listing_display_yn: true,
      internet_address_display_yn: true, rls_eligible: true, address: {}, media: [], listing_media: [],
      raw_data: { StandardStatus: 'Active' }, updated_at: new Date(),
    };
    const onFeed = { ...base, sync_status: 'synced', terminal_since: null };
    const offFeed = { ...base, sync_status: OFF_FEED_SYNC_STATUS, terminal_since: new Date('2026-08-15T00:00:00Z') };
    expect(filterDisplayableDbListings([onFeed]).length).toBe(1);
    // even with every distribution gate open, presence closes it
    expect(filterDisplayableDbListings([offFeed]).length).toBe(0);
  });
});

describe('every current-inventory consumer excludes an off-feed row', () => {
  /**
   * A query that selects listings by an ON-MARKET status must also carry a presence or display gate. Without one,
   * restoring the 6,953 rows to their last observed status would hand off-feed inventory to that surface as though
   * it were live. Each entry names the file and the gate that protects it.
   */
  const GATED: Array<{ file: string; gate: RegExp; what: string }> = [
    // Each pattern must match the WHERE clause, never a `select` field list. `idx_display_yn: true` appears in
    // both positions in this codebase, so a bare match on it is a false pass — the compliance-audit route selects
    // that column while filtering on status alone, which is exactly the leak this suite exists to catch.
    { file: 'lib/cma/engine.ts', gate: /\.\.\.SEARCH_DISPLAY_GATE|publiclyDisplayable/, what: 'the database CMA comp pool' },
    { file: 'app/api/portal/comparables/route.ts', gate: /\.\.\.SEARCH_DISPLAY_GATE/, what: 'portal comparables' },
    { file: 'app/api/agents/[slug]/listings/route.ts', gate: /filterDisplayableDbListings/, what: 'agent public listing pages' },
    { file: 'app/api/market/route.ts', gate: /Base where clause[\s\S]{0,200}idx_display_yn:\s*true/, what: 'public market statistics' },
    { file: 'app/api/crm/compliance/audit/route.ts', gate: /sync_status|OFF_FEED_SYNC_STATUS/, what: 'the CRM compliance audit inventory' },
  ];

  it.each(GATED)('$what ($file) carries a presence or display gate', ({ file, gate }) => {
    expect(read(file)).toMatch(gate);
  });

  /**
   * Two consumers are safe STRUCTURALLY rather than by a gate clause, and the proof is the shape of the query
   * itself. Asserting a `sync_status` clause on them would be wrong — it would demand a filter that is not the
   * thing keeping them correct, and would pass while the real bound silently rotted.
   */
  it('the four Searches cannot reach an off-feed row: the Mallan branch is bounded by the SL-/RL- id prefix', () => {
    const src = read('lib/search/engine/universe.ts');
    // Mallan-authored rows only: an SL-/RL- prefix plus a null mls_id. A provider row's id is `RLS…`, which does
    // not match `RL-`, so no provider row can enter through this branch whatever its status says.
    expect(src).toMatch(/const prefix = c\.workflow === 'sale' \? 'SL-' : 'RL-'/);
    expect(src).toMatch(/mls_id: null, listing_id: \{ startsWith: prefix \}/);
    // The other branch is the live provider walk. A row that is off the feed is BY DEFINITION not in the walk.
    expect(src).toMatch(/walkProvider</);
  });

  it('the landlord lease tracker cannot reach one either: it is scoped to the landlord\'s own clients', () => {
    const src = read('app/api/crm/lease-tracker/route.ts');
    expect(src).toMatch(/owner_client_id/);
  });
});

/**
 * Read-only production counts behind the two structural proofs above (2026-09-09, `hidden-mountain-87248164`,
 * 27,029 listings) are recorded in docs/status/OFF-FEED-PRESENCE-FINDINGS-2026-09-09.md, not asserted here — a
 * test that compares a literal to itself proves nothing and would read as coverage it does not have.
 *   rows with listing_id LIKE 'RL-%' .......... 0   (no provider row can enter the Mallan search branch)
 *   stored-Withdrawn rows with owner_client_id  0   (none are reachable by the lease tracker)
 *   rows with sync_status IS NULL ............. 0   (a not-off_feed filter is null-safe on this data)
 *   rows with sync_status = 'off_feed' ........ 0   (the presence model has never run in production)
 */
describe('the presence gate is enforced in the two places that own it', () => {
  it('the shared search gate and the public filter are the two places presence is enforced', () => {
    // SEARCH_DISPLAY_GATE enforces presence through idx_display_yn, which the reconciler forces false on departure;
    // filterDisplayableDbListings enforces it through the lifecycle. Both must stay in place.
    expect(read('lib/search/listing-access-decision.ts')).toMatch(/idx_display_yn:\s*true/);
    expect(read('app/api/cron/feed-reconcile/route.ts')).toMatch(/idx_display_yn:\s*false/);
    expect(read('lib/idx/db-to-public-dto.ts')).toMatch(/publiclyDisplayable/);
  });
});

describe('market DOM ends at the off-feed-since day, and says it is an estimate', () => {
  it('the clock stops the day Mallan detected the disappearance', () => {
    expect(marketDom(departed('Active'), ASOF)).toEqual({
      start: '2026-06-01', end: '2026-08-15', endReason: 'off_feed_detected', days: 75, estimated: true, unverified: null,
    });
  });

  it('it never keeps running to the as-of day, and never uses a manufactured removal date', () => {
    const d = marketDom(departed('Pending', 'rent'), ASOF);
    expect(d.end).toBe('2026-08-15');
    expect(d.end).not.toBe(ASOF);
    expect(d.estimated).toBe(true);
  });

  it('a row that is still present is NOT an estimate', () => {
    const present = lifecycleFromStoredRow({ status: 'Active', listing_type: 'sale', sync_status: 'synced', raw_data: { StandardStatus: 'Active', OnMarketDate: '2026-06-01', ActivationDate: '2026-06-01' } });
    expect(marketDom(present, ASOF).estimated).toBe(false);
    expect(marketDom(present, ASOF).endReason).toBe('as_of');
  });
});

describe('a listing that returns to the feed comes back without an invented event', () => {
  it('presence is restored and no Back on Market event is manufactured', () => {
    const d = reconcileStatusDecision('Active', { kind: 'onmarket', status: 'Active' }, OFF_FEED_SYNC_STATUS);
    expect(d.action).toBe('update');
    expect(d.targetStatus).toBe('Active');
    expect(d.targetSyncStatus).toBe('synced');
    expect(d.reason).not.toMatch(/back on market/i);
  });

  it('the returned row carries no BackOnMarketDate unless the PROVIDER delivered one', () => {
    const returned = lifecycleFromStoredRow({ status: 'Active', listing_type: 'sale', sync_status: 'synced', raw_data: { StandardStatus: 'Active', OnMarketDate: '2026-06-01', ActivationDate: '2026-06-01' } });
    expect(returned.backOnMarket).toBe(false);
    expect(returned.backOnMarketDate).toBeNull();
    // when the provider DOES deliver it, the fact is honoured
    const real = lifecycleFromStoredRow({ status: 'Active', listing_type: 'sale', sync_status: 'synced', raw_data: { StandardStatus: 'Active', OnMarketDate: '2026-06-01', ActivationDate: '2026-06-01', MajorChangeType: 'BackOnMarket', BackOnMarketDate: '2026-08-20' } });
    expect(real.backOnMarket).toBe(true);
    expect(real.backOnMarketDate).toBe('2026-08-20');
  });
});

describe('a closed listing shows its full list-to-close market duration on every surface', () => {
  const closed = lifecycleFromStoredRow({
    status: 'Closed', listing_type: 'sale', sync_status: 'synced',
    raw_data: { StandardStatus: 'Closed', OnMarketDate: '2026-01-10', ActivationDate: '2026-01-10', CloseDate: '2026-06-15', ClosePrice: 900000 },
  });

  it('the provider-dated clock reports the full span, never zero', () => {
    expect(marketDom(closed, ASOF)).toMatchObject({ end: '2026-06-15', days: 156, endReason: 'closed', estimated: false });
  });

  it('the stored-column reader returns the retained span for a Mallan row with no provider dates', () => {
    const stored = { status: 'Closed', participant_only: false, status_changed_at: new Date(), first_active_date: null, days_on_market: 0, cumulative_days_on_market: 156 };
    expect(getCurrentDom(stored)).toBe(156);
    expect(getCurrentDom(stored)).not.toBe(0);
  });

  /**
   * BEHAVIOURAL (owner review 2026-09-09): *"The Closed DOM test especially cannot claim 'every surface' merely
   * because four files contain getCurrentDom or marketDom."* Correct — a filename containing a symbol proves
   * nothing about what the surface renders. The shared public projection is executed here instead, and the DOM it
   * actually returns is inspected. The source scan that remains below is narrowed to the claim it can support.
   */
  it('the shared public projection returns the full list-to-close span for a Closed row', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { dbListingToPublicDTO } = require('@/lib/idx/db-to-public-dto');
    const dto = dbListingToPublicDTO({
      id: 1n, listing_id: 'RLS-CLOSED-1', status: 'Closed', listing_type: 'sale', sync_status: 'synced',
      property_type: 'Residential', property_sub_type: null, list_price: 1000000,
      bedrooms_total: 2, bathrooms_full: 2, bathrooms_half: 0, living_area: 900,
      borough: 'Manhattan', neighborhood: 'Upper East Side',
      address: {}, features: {}, media: [], listing_media: [],
      idx_display_yn: false, owner_opt_out: false, participant_only: false,
      internet_entire_listing_display_yn: true, internet_address_display_yn: true, rls_eligible: true,
      days_on_market: 0, cumulative_days_on_market: 156,
      raw_data: { StandardStatus: 'Closed', OnMarketDate: '2026-01-10', ActivationDate: '2026-01-10', CloseDate: '2026-06-15', ClosePrice: 900000 },
      updated_at: new Date('2026-06-16T00:00:00Z'), created_at: new Date('2026-01-10T00:00:00Z'),
      listing_contract_date: new Date('2026-01-10T00:00:00Z'), modification_timestamp: new Date('2026-06-16T00:00:00Z'),
    });
    // The retained provider dates give the real span; the zeroed stored column must never be what surfaces.
    expect(dto.lifecycle.marketDom).toMatchObject({ end: '2026-06-15', endReason: 'closed', days: 156, estimated: false });
    expect(dto.lifecycle.marketDom.days).not.toBe(0);
    expect(dto.lifecycle.closedDate).toBe('2026-06-15');
  });

  it('the four CRM/market DOM routes reference the calculator rather than reading days_on_market directly', () => {
    // A NARROW claim, stated as what it is: these specific four files import the calculator. It is a wiring
    // check, not proof of what any of them renders — the behavioural proof for that is the projection test above.
    for (const file of [
      'app/api/crm/sales/listings/route.ts',
      'app/api/crm/sales/sellers/route.ts',
      'app/api/crm/rentals/landlords/route.ts',
      'app/api/market/route.ts',
    ]) {
      expect({ file, usesCalculator: /getCurrentDom|marketDom/.test(read(file)) }).toEqual({ file, usesCalculator: true });
    }
  });
});
