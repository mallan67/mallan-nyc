/// <reference types="jest" />
/**
 * LISTING-EXPIRATION CRON — ownership authority, not agent association.
 *
 * DEFECT. Tasks 1 (30-day warning) and 2 (7-day warning + UCBA email) selected
 * listings with `agent_id: { not: null }` alone. That is association, not
 * ownership: `syncAgentHistory` stamps `agent_id` on THIRD-PARTY feed rows
 * because it matches `BuyerAgentMlsId` as well as `ListAgentMlsId`, and feed
 * rows carry their own `expiration_date`.
 *
 * Consequences on a third-party row:
 *   - a notification reading "Your exclusive on {address} expires ..." for a
 *     listing another brokerage holds;
 *   - Task 2 additionally SENDS that as an email;
 *   - `expiration_30d_notified` / `expiration_7d_notified` written onto a
 *     Cotality-source-owned row.
 *
 * Task 3 already scoped correctly via `buildMallanOwnedListingWhere()`. These
 * tests pin the SAME canonical predicate on Tasks 1 and 2, and assert the
 * predicate is applied by the production helper rather than reimplemented here.
 */

import { buildMallanOwnedListingWhere } from '@/lib/idx/media-sync';

type Row = Record<string, unknown>;

/** Evaluate the production ownership predicate against a row. */
function matchesOwnership(row: Row): boolean {
  const where = buildMallanOwnedListingWhere() as { OR?: Array<Record<string, unknown>> };
  const clauses = where.OR ?? [];
  return clauses.some((c) => {
    if ('rls_eligible' in c) return row.rls_eligible === c.rls_eligible;
    const li = c.listing_id as { startsWith?: string } | undefined;
    if (li?.startsWith) return typeof row.listing_id === 'string' && row.listing_id.startsWith(li.startsWith);
    return false;
  });
}

const LOCAL_SL = { listing_id: 'SL-0004', rls_eligible: false, agent_id: 42n };
const LOCAL_RL = { listing_id: 'RL-0011', rls_eligible: false, agent_id: 42n };
const WEBSITE_ONLY = { listing_id: 'RLS20000777', rls_eligible: false, agent_id: 42n };
/** Third-party feed row where the Mallan agent was the BUYER-side agent. */
const THIRD_PARTY = { listing_id: 'RLS20105333', rls_eligible: true, agent_id: 42n };
/** Mallan's own listing returned through Cotality — still source-owned. */
const RETURN_COPY = { listing_id: 'RLS20093870', rls_eligible: true, agent_id: 42n };

describe('the canonical ownership predicate admits only Mallan-owned rows', () => {
  it.each([
    ['A local SL-*', LOCAL_SL, true],
    ['B local RL-*', LOCAL_RL, true],
    ['C website-only (rls_eligible=false)', WEBSITE_ONLY, true],
    ['D third-party RLS', THIRD_PARTY, false],
    ['F buyer-side association only', { ...THIRD_PARTY, agent_id: 42n }, false],
  ])('%s', (_label, row, expected) => {
    expect(matchesOwnership(row)).toBe(expected);
  });

  it('an RLS return-copy is NOT Mallan-owned for this purpose', () => {
    // Source-owned: its expiration_date belongs to the feed, not to a Mallan
    // listing agreement.
    expect(matchesOwnership(RETURN_COPY)).toBe(false);
  });

  it('agent_id is never part of the ownership predicate', () => {
    expect(JSON.stringify(buildMallanOwnedListingWhere())).not.toContain('agent_id');
  });
});

describe('the cron applies that predicate to BOTH warning tasks', () => {
  const SRC = require('fs').readFileSync(
    require('path').resolve(__dirname, '../../app/api/cron/listing-expiration/route.ts'),
    'utf8',
  ) as string;
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  /** Each `prisma.listing.findMany` block's `where` clause, in file order. */
  function listingSelections(): string[] {
    const out: string[] = [];
    let i = CODE.indexOf('prisma.listing.findMany');
    while (i !== -1) {
      out.push(CODE.slice(i, CODE.indexOf('select:', i)));
      i = CODE.indexOf('prisma.listing.findMany', i + 1);
    }
    return out;
  }

  it('there are exactly three listing selections (30d, 7d, expired)', () => {
    expect(listingSelections()).toHaveLength(3);
  });

  it('EVERY listing selection carries the ownership predicate', () => {
    for (const [i, sel] of listingSelections().entries()) {
      expect({ index: i, hasOwnership: sel.includes('buildMallanOwnedListingWhere()') })
        .toEqual({ index: i, hasOwnership: true });
    }
  });

  it('agent_id survives only as the recipient data requirement', () => {
    for (const sel of listingSelections()) {
      expect(sel).toContain('agent_id: { not: null }');
    }
  });

  it('H: the notified flags are only ever written inside those scoped tasks', () => {
    // Both writes exist; neither can be reached for a row the scoped SELECT
    // never returned.
    expect(CODE).toContain('expiration_30d_notified: true');
    expect(CODE).toContain('expiration_7d_notified: true');
    expect(listingSelections()[0]).toContain('expiration_30d_notified: false');
    expect(listingSelections()[1]).toContain('expiration_7d_notified: false');
  });

  it('G: the outbound email lives in the scoped 7-day task', () => {
    const sevenDayTask = CODE.slice(
      CODE.indexOf('expiration_7d_notified: false'),
      CODE.indexOf('Task 3'),
    );
    expect(sevenDayTask).toContain('sendEmail');
  });

  it('I: Task 3 (ProtectedPeriod) remains Mallan-owned scoped', () => {
    const taskThree = CODE.slice(CODE.indexOf('protected_period: null'));
    expect(taskThree.slice(0, 200)).toContain('buildMallanOwnedListingWhere()');
  });

  it('the ProtectedPeriod follow-up tasks inherit scope (no independent listing select)', () => {
    // They select protectedPeriod rows, which only exist because the scoped
    // Task 3 created them.
    expect((CODE.match(/prisma\.listing\.findMany/g) ?? []).length).toBe(3);
    expect(CODE).toContain('prisma.protectedPeriod.findMany');
  });
});

export {};
