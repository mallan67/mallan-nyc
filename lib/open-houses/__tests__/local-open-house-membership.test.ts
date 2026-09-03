/**
 * MALLAN-LOCAL OPEN HOUSE MEMBERSHIP — ONE CONTRACT, ONE TIMEZONE, FAIL CLOSED.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS EXTRACTED RATHER THAN WRITTEN AGAIN
 *
 * Two readers already query `showings` for open houses:
 *
 *   app/api/open-houses/route.ts        fetchLocalOpenHouses()
 *   lib/open-houses/upcoming-open-houses.ts  fetchLocalUpcoming()
 *
 * Both build public DTOs. Neither answers the question authenticated Search
 * needs — "which Mallan listings have an open house in THIS window" — and
 * copying a third `prisma.showing.findMany()` into the Search route would make
 * the divergence permanent. So the membership rule lives here once, as a pure
 * function over rows, and the caller supplies the rows.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LIFECYCLE DECISION, MADE EXPLICITLY
 *
 * `Showing.status` is "requested" | "confirmed" | "completed" | "cancelled",
 * and it DEFAULTS to "requested" (prisma/schema.prisma). The existing public
 * readers use `status != 'cancelled'`, which admits "requested" and "completed".
 *
 * Authenticated broker Search uses **confirmed only**, and that is deliberate:
 *
 *   - the CRM writes `status: "confirmed"` on every agent-created showing
 *     (app/api/crm/showings/route.ts:171, "Agent-created showings are
 *     auto-confirmed"), so requiring it excludes nothing a broker scheduled;
 *   - "requested" on an open house is a proposal nobody confirmed, and a broker
 *     searching open houses is deciding where to send a client;
 *   - "completed" is a past event, which is not an upcoming open house even when
 *     it falls on today's date.
 *
 * This is STRICTER than the public readers. Their behaviour is deliberately not
 * changed here — a shared extraction that quietly altered the public site would
 * be a regression smuggled in behind a Search fix.
 */
import {
  BROKER_SEARCH_OPEN_HOUSE_STATUSES,
  BROKER_SEARCH_OPEN_HOUSE_TYPES,
  localOpenHouseMembershipFrom,
  type LocalShowingRow,
} from '../local-open-house-membership';
import { resolveOpenHouseWindow } from '../../search/open-house-window';

/** A `showings` row joined to its canonical Mallan listing. */
const row = (over: Partial<LocalShowingRow> = {}): LocalShowingRow => ({
  // 12:00 UTC on 2026-09-12 is 08:00 the same day in New York.
  date: new Date('2026-09-12T12:00:00Z'),
  type: 'openhouse',
  status: 'confirmed',
  listing: {
    listing_id: 'SL-0007',
    rls_eligible: false,
    status: 'Active',
  },
  ...over,
});

/** Saturday 2026-09-12 through Sunday 2026-09-13, resolved in New York. */
const WEEKEND = resolveOpenHouseWindow({
  preset: 'weekend',
  now: new Date('2026-09-11T16:00:00Z'), // Friday
});

describe('the lifecycle decision is enforced, state by state', () => {
  it.each([
    ['confirmed', true],
    ['requested', false],
    ['completed', false],
    ['cancelled', false],
  ])('status "%s" counts as an upcoming open house: %s', (status, included) => {
    const m = localOpenHouseMembershipFrom([row({ status })], WEEKEND);
    expect(m.state).toBe('resolved');
    if (m.state !== 'resolved') return;
    expect(m.listingIds.has('SL-0007')).toBe(included);
  });

  it('the declared status set is exactly ["confirmed"]', () => {
    // Pinned so widening it is a deliberate edit, not a drift.
    expect([...BROKER_SEARCH_OPEN_HOUSE_STATUSES]).toEqual(['confirmed']);
  });
});

describe('only an OPEN HOUSE counts — a private showing is not one', () => {
  it.each([
    ['openhouse', true],
    ['brokersopen', false],
    ['private', false],
    ['virtual', false],
  ])('type "%s": %s', (type, included) => {
    const m = localOpenHouseMembershipFrom([row({ type })], WEEKEND);
    if (m.state !== 'resolved') throw new Error('expected resolved');
    expect(m.listingIds.has('SL-0007')).toBe(included);
  });

  it('brokersopen is EXCLUDED pending a product decision, not silently folded in', () => {
    // A brokers-only open house is plausibly relevant to a broker, but it is a
    // different event with different access rules. Including it would widen
    // what "Open House" means without anyone deciding to.
    expect([...BROKER_SEARCH_OPEN_HOUSE_TYPES]).toEqual(['openhouse']);
  });
});

describe('the window is the SAME New York window the provider side uses', () => {
  it('a showing inside the window is a member', () => {
    const m = localOpenHouseMembershipFrom([row()], WEEKEND);
    if (m.state !== 'resolved') throw new Error('expected resolved');
    expect([...m.listingIds]).toEqual(['SL-0007']);
  });

  it('a showing the day BEFORE the window is not', () => {
    const m = localOpenHouseMembershipFrom(
      [row({ date: new Date('2026-09-11T12:00:00Z') })], WEEKEND);
    if (m.state !== 'resolved') throw new Error('expected resolved');
    expect(m.listingIds.size).toBe(0);
  });

  it('a showing the day AFTER the window is not', () => {
    const m = localOpenHouseMembershipFrom(
      [row({ date: new Date('2026-09-14T12:00:00Z') })], WEEKEND);
    if (m.state !== 'resolved') throw new Error('expected resolved');
    expect(m.listingIds.size).toBe(0);
  });

  it('both bounds are INCLUSIVE — the last day of the window counts', () => {
    const m = localOpenHouseMembershipFrom(
      [row({ date: new Date('2026-09-13T12:00:00Z') })], WEEKEND);
    if (m.state !== 'resolved') throw new Error('expected resolved');
    expect(m.listingIds.has('SL-0007')).toBe(true);
  });

  it('a late-evening New York showing is judged by its NEW YORK date', () => {
    // 01:00 UTC on the 14th is 21:00 on the 13th in New York — inside the
    // weekend. Reading the UTC date would push it outside and lose the event.
    const m = localOpenHouseMembershipFrom(
      [row({ date: new Date('2026-09-14T01:00:00Z') })], WEEKEND);
    if (m.state !== 'resolved') throw new Error('expected resolved');
    expect(m.listingIds.has('SL-0007')).toBe(true);
  });

  it('an open-ended window (`to` null) admits everything from `from` onward', () => {
    const open = { from: '2026-09-12', to: null };
    const m = localOpenHouseMembershipFrom(
      [row({ date: new Date('2027-01-01T12:00:00Z') })], open);
    if (m.state !== 'resolved') throw new Error('expected resolved');
    expect(m.listingIds.has('SL-0007')).toBe(true);
  });
});

describe('only a MALLAN-AUTHORED listing can be a local member', () => {
  it('an SL- listing qualifies', () => {
    const m = localOpenHouseMembershipFrom([row()], WEEKEND);
    if (m.state !== 'resolved') throw new Error('expected resolved');
    expect(m.listingIds.has('SL-0007')).toBe(true);
  });

  it('an RL- listing qualifies', () => {
    const m = localOpenHouseMembershipFrom(
      [row({ listing: { listing_id: 'RL-0002', rls_eligible: false, status: 'Active' } })], WEEKEND);
    if (m.state !== 'resolved') throw new Error('expected resolved');
    expect(m.listingIds.has('RL-0002')).toBe(true);
  });

  it('a PROVIDER-sourced listing in the same table is NOT a local member', () => {
    // An RLS-numbered row here belongs to the Cotality side of the universe and
    // is resolved by ListingKey. Admitting it locally would double-count the
    // same property from two authorities.
    const m = localOpenHouseMembershipFrom(
      [row({ listing: { listing_id: 'RLS20112217', rls_eligible: true, status: 'Active' } })], WEEKEND);
    if (m.state !== 'resolved') throw new Error('expected resolved');
    expect(m.listingIds.size).toBe(0);
  });

  it('a row with no listing identity is dropped, never keyed as empty', () => {
    const m = localOpenHouseMembershipFrom(
      [row({ listing: { listing_id: '', rls_eligible: false, status: 'Active' } })], WEEKEND);
    if (m.state !== 'resolved') throw new Error('expected resolved');
    expect(m.listingIds.size).toBe(0);
  });
});

describe('several open houses on one listing produce ONE member', () => {
  it('a Saturday and a Sunday event on the same listing is one listing', () => {
    const m = localOpenHouseMembershipFrom([
      row({ date: new Date('2026-09-12T12:00:00Z') }),
      row({ date: new Date('2026-09-13T12:00:00Z') }),
    ], WEEKEND);
    if (m.state !== 'resolved') throw new Error('expected resolved');
    expect([...m.listingIds]).toEqual(['SL-0007']);
    expect(m.rowsRead).toBe(2);
  });
});

describe('the identity that leaves this module is the MALLAN one', () => {
  it('membership is keyed by Listing.listing_id, never by the internal row id', () => {
    // `Showing.listing_id` is a BigInt FK to `Listing.id` — an internal Postgres
    // key that means nothing outside the database. The canonical Mallan search
    // identity is `Listing.listing_id` (SL-/RL-), and that is what a consumer
    // can reconcile against. Neither may ever be sent to Cotality as a
    // ListingKey.
    const m = localOpenHouseMembershipFrom([row()], WEEKEND);
    if (m.state !== 'resolved') throw new Error('expected resolved');
    for (const id of m.listingIds) {
      expect(id).toMatch(/^(SL|RL)-/i);
      expect(id).not.toMatch(/^\d+$/);
    }
  });
});
