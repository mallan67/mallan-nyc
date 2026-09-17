/// <reference types="jest" />
/**
 * C4B — THE UNIVERSE, ITS TOTAL AND ITS PAGE ALL DESCRIBE THE SAME AUDIENCE-ELIGIBLE INVENTORY.
 *
 * THE DEFECT. universe.ts merged two sources that were gated ASYMMETRICALLY. Provider rows were filtered
 * inside the OData query, before the count (`Permission has 'IDX'`, provider-query.ts:122). Mallan-authored
 * rows were not filtered at all: mallanRowsFor()'s where-clause carried no permission column and its
 * `select` did not even load one. hydrate.ts then gated BOTH sources per row — so the count and the page
 * disagreed by construction, and a suppressed Mallan listing was counted and then removed.
 *
 * WHY THAT IS COMPLIANCE-BEARING, not arithmetic. Owner opt-out means no public dissemination (UCBA Art. I
 * §5(A)). The listing's CONTENT was correctly withheld by hydration; the FACT of its existence still
 * reached a client — through a Saved Search `result_count` stored as fact, and through a Search Alert email
 * saying "N matching listings". A number can disclose a listing.
 *
 * THE MITIGATION THAT EXISTED, AND WHY IT WAS NOT ENOUGH. executor.ts degraded `countMeaning` to
 * 'lower_bound' when the CURRENT PAGE lost rows. Two problems: the label is directionally inverted — a row
 * counted and then filtered makes the total an OVER-count, so the only truthful degraded label is an upper
 * bound — and the degradation is page-local, so exclusions on page 3 left 'exact' standing. Neither
 * countSearch() nor the alert cron hydrates at all, so neither ever saw the signal.
 *
 * AUDIENCE IS PART OF UNIVERSE IDENTITY. participant_only is excluded for the public and ALLOWED for a
 * member — so member and public are genuinely different universes, with different totals, and must never
 * share a cache entry. Gating only the audience-independent flags would have left the public count wrong.
 *
 * ONE GATE, NOT A SECOND SPELLING. The predicate lives in lib/search/engine/audience-gate.ts and is
 * consumed by BOTH universe membership and hydration. Hydration keeps gating — universe gate is membership
 * truth, hydration gate is race/drift safety — but they are the same implementation.
 *
 * NOT client-distribution.ts: that helper documents itself as client-facing, and its participant_only rule
 * would strip legitimate professional inventory out of member Search.
 */
import type { SearchCriteria } from '@/lib/search/engine/criteria';

const listingFindMany = jest.fn(async (_a?: unknown) => mallanRows);
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { listing: { findMany: listingFindMany } } }));

const walkProviderMock = jest.fn(async () => ({ rows: providerRows, count: providerRows.length, pages: 1, complete: providerComplete }));
jest.mock('@/lib/search/engine/provider-client', () => ({
  __esModule: true,
  walkProvider: walkProviderMock,
  queryProvider: jest.fn(async () => ({ records: [], mediaRows: 0, mediaComplete: true })),
}));

let mallanRows: Record<string, unknown>[] = [];
let providerRows: Record<string, unknown>[] = [];
let providerComplete = true;

import { settleUniverse } from '@/lib/search/engine/universe';
import { universeKeyOf, countSearch, settledUniverseFor } from '@/lib/search/engine/executor';
import { mallanRowPassesGate } from '@/lib/search/engine/audience-gate';

const CRITERIA: SearchCriteria = {
  workflow: 'sale', standardStatus: ['Active'], cityRegion: [], subdivisionName: [], buildingName: [],
  commonInterest: [], structureType: [], postalCode: [], listingId: [], furnished: [], petsAllowed: [],
  sort: 'price_asc' as SearchCriteria['sort'], limit: 20, offset: 0,
};

/** A Mallan-authored row exactly as prisma returns it, with the four gate columns present. */
const mallan = (id: string, over: Record<string, unknown> = {}) => ({
  listing_id: id, list_price: 1000000, listing_contract_date: null,
  bathrooms_full: 2, bathrooms_half: 0, property_sub_type: null,
  address: { full: id + ' Street' }, updated_at: new Date('2026-09-01'),
  owner_opt_out: false, participant_only: false,
  internet_entire_listing_display_yn: true, internet_address_display_yn: true,
  ...over,
});

const provider = (key: string) => ({
  ListingKey: key, ListingId: key, ListPrice: 2000000,
  ListingContractDate: null, ModificationTimestamp: '2026-09-01T00:00:00Z',
});

function seed(m: Record<string, unknown>[], p: Record<string, unknown>[] = [], complete = true) {
  mallanRows = m; providerRows = p; providerComplete = complete;
  listingFindMany.mockClear(); walkProviderMock.mockClear();
}

const ids = (u: { rows: Array<{ listingId: string }> }) => u.rows.map((r) => r.listingId).sort();

// ─────────────────────────────────────────────────────────────────────────────
// A — the shared gate, and the internet-display asymmetry adjudicated
// ─────────────────────────────────────────────────────────────────────────────
describe('A · one audience gate, consumed by membership and hydration alike', () => {
  it('owner_opt_out is excluded for EVERY audience — the owner withdrew the listing', () => {
    const row = { owner_opt_out: true, participant_only: false, internet_entire_listing_display_yn: true };
    expect({ pub: mallanRowPassesGate(row, 'public'), mem: mallanRowPassesGate(row, 'member') })
      .toEqual({ pub: false, mem: false });
  });

  it('participant_only is excluded for the public and ALLOWED for a member', () => {
    const row = { owner_opt_out: false, participant_only: true, internet_entire_listing_display_yn: true };
    expect({ pub: mallanRowPassesGate(row, 'public'), mem: mallanRowPassesGate(row, 'member') })
      .toEqual({ pub: false, mem: true });
  });

  it('ASYMMETRY CLOSED — a Mallan internet_entire_listing_display_yn=false is blocked at both audiences, as the provider equivalent already was', () => {
    // providerRowPassesGate blocked `InternetEntireListingDisplayYN === false` for both audiences while
    // mallanRowPassesGate checked only owner_opt_out/participant_only, so the same decision expressed in
    // Mallan storage survived where the provider's did not. The column is Boolean NOT NULL, so there is no
    // fail-open ambiguity here: false means false.
    const row = { owner_opt_out: false, participant_only: false, internet_entire_listing_display_yn: false };
    expect({ pub: mallanRowPassesGate(row, 'public'), mem: mallanRowPassesGate(row, 'member') })
      .toEqual({ pub: false, mem: false });
  });

  it('an ordinary row passes at both audiences', () => {
    const row = { owner_opt_out: false, participant_only: false, internet_entire_listing_display_yn: true };
    expect({ pub: mallanRowPassesGate(row, 'public'), mem: mallanRowPassesGate(row, 'member') })
      .toEqual({ pub: true, mem: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — membership is gated BEFORE the count
// ─────────────────────────────────────────────────────────────────────────────
describe('B · a suppressed Mallan row never enters universe.rows or universe.total', () => {
  it('PUBLIC: owner_opt_out and participant_only are both absent from the total', async () => {
    seed([mallan('SL-1'), mallan('SL-OPT', { owner_opt_out: true }), mallan('SL-PRIV', { participant_only: true })]);
    const u = await settleUniverse(CRITERIA, 'public');
    expect({ ids: ids(u), total: u.total, mallanRows: u.mallanRows }).toEqual({ ids: ['SL-1'], total: 1, mallanRows: 1 });
  });

  it('MEMBER: owner_opt_out absent, participant_only PRESENT — the audience it exists for', async () => {
    seed([mallan('SL-1'), mallan('SL-OPT', { owner_opt_out: true }), mallan('SL-PRIV', { participant_only: true })]);
    const u = await settleUniverse(CRITERIA, 'member');
    expect({ ids: ids(u), total: u.total }).toEqual({ ids: ['SL-1', 'SL-PRIV'], total: 2 });
  });

  it('the two audiences genuinely differ in total for the same criteria', async () => {
    seed([mallan('SL-1'), mallan('SL-PRIV', { participant_only: true })]);
    const pub = await settleUniverse(CRITERIA, 'public');
    seed([mallan('SL-1'), mallan('SL-PRIV', { participant_only: true })]);
    const mem = await settleUniverse(CRITERIA, 'member');
    expect({ pub: pub.total, mem: mem.total }).toEqual({ pub: 1, mem: 2 });
  });

  it('the Mallan query now LOADS the gate columns it needs — membership cannot be decided without them', async () => {
    seed([mallan('SL-1')]);
    await settleUniverse(CRITERIA, 'public');
    const select = (listingFindMany.mock.calls[0][0] as { select: Record<string, boolean> }).select;
    for (const col of ['owner_opt_out', 'participant_only', 'internet_entire_listing_display_yn']) {
      expect({ col, loaded: select[col] === true }).toEqual({ col, loaded: true });
    }
  });

  it('provider membership is not weakened — provider rows still arrive through their own query gate', async () => {
    seed([mallan('SL-1')], [provider('P-1'), provider('P-2')]);
    const u = await settleUniverse(CRITERIA, 'public');
    expect(u.providerRows).toBe(2);
    expect(u.total).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — cache identity includes audience
// ─────────────────────────────────────────────────────────────────────────────
describe('C · member and public never share a settled universe', () => {
  it('universeKeyOf distinguishes the two audiences', () => {
    expect(universeKeyOf(CRITERIA, 'public')).not.toBe(universeKeyOf(CRITERIA, 'member'));
  });

  it('a cached public universe cannot be served to a member', async () => {
    seed([mallan('SL-1'), mallan('SL-PRIV', { participant_only: true })]);
    const pub = await settledUniverseFor(CRITERIA, 'public', true);
    expect({ total: pub.universe.total, fromCache: pub.fromCache }).toEqual({ total: 1, fromCache: false });

    seed([mallan('SL-1'), mallan('SL-PRIV', { participant_only: true })]);
    const mem = await settledUniverseFor(CRITERIA, 'member', true);
    // A cache hit here would have handed the member the public total — the poisoning this guards.
    expect({ total: mem.universe.total, fromCache: mem.fromCache }).toEqual({ total: 2, fromCache: false });
  });

  it('the SAME audience does reuse its own entry — the key is not merely unique per call', async () => {
    seed([mallan('SL-1')]);
    await settledUniverseFor(CRITERIA, 'member', true);
    const again = await settledUniverseFor(CRITERIA, 'member', true);
    expect(again.fromCache).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D — countSearch, the previously unmitigated path
// ─────────────────────────────────────────────────────────────────────────────
describe('D · countSearch counts the audience-eligible universe and nothing else', () => {
  it('countSearch(public) excludes a suppressed Mallan row', async () => {
    seed([mallan('SL-1'), mallan('SL-OPT', { owner_opt_out: true })]);
    const c = await countSearch(CRITERIA, 'public', false);
    expect(c.total).toBe(1);
  });

  it('countSearch(member) retains participant-only inventory', async () => {
    seed([mallan('SL-1'), mallan('SL-PRIV', { participant_only: true })]);
    const c = await countSearch(CRITERIA, 'member', false);
    expect(c.total).toBe(2);
  });

  it('the two counts differ for identical criteria', async () => {
    seed([mallan('SL-PRIV', { participant_only: true })]);
    const pub = await countSearch(CRITERIA, 'public', false);
    seed([mallan('SL-PRIV', { participant_only: true })]);
    const mem = await countSearch(CRITERIA, 'member', false);
    expect({ pub: pub.total, mem: mem.total }).toEqual({ pub: 0, mem: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E — countMeaning: the sign error corrected
// ─────────────────────────────────────────────────────────────────────────────
describe('E · countMeaning describes the direction of the error truthfully', () => {
  it('complete walk, nothing lost → exact', async () => {
    seed([mallan('SL-1')], [], true);
    const u = await settleUniverse(CRITERIA, 'public');
    expect(u.countMeaning).toBe('exact');
  });

  it('incomplete walk, nothing lost → lower_bound (there may be more)', async () => {
    seed([mallan('SL-1')], [], false);
    const u = await settleUniverse(CRITERIA, 'public');
    expect(u.countMeaning).toBe('lower_bound');
  });

  it('the vocabulary can express an over-count and a two-sided unknown', async () => {
    const { COUNT_MEANINGS } = await import('@/lib/search/engine/universe');
    expect([...COUNT_MEANINGS].sort()).toEqual(['exact', 'indeterminate', 'lower_bound', 'upper_bound']);
  });

  it('an over-count is never labelled lower_bound — the executor resolves the two directions', async () => {
    const { resolveCountMeaning } = await import('@/lib/search/engine/executor');
    expect(resolveCountMeaning('exact', 0)).toBe('exact');
    // complete walk + rows lost after counting = the total is too high
    expect(resolveCountMeaning('exact', 2)).toBe('upper_bound');
    // incomplete walk + nothing lost = the total is too low
    expect(resolveCountMeaning('lower_bound', 0)).toBe('lower_bound');
    // both at once: neither direction is guaranteed
    expect(resolveCountMeaning('lower_bound', 2)).toBe('indeterminate');
  });
});
