/**
 * PERSONAL PARTICIPATION — behavioural contract.
 *
 * These assertions encode the P0 incident of 2026-08-17 so it cannot recur.
 * Every number below was measured against PRODUCTION Neon and verified against
 * the LIVE Cotality API; none of it is inferred.
 *
 *   BEFORE  the reader returned 200 rows: 200 Closed, 0 belonging to the
 *           caller, 0 Mallan SL-. Live Cotality confirmed the caller
 *           participated in 0 of 12 sampled rows.
 *   AFTER   the same predicate returns 43 rows: 36 Cotality listing-side
 *           (exactly matching the live count of `ListAgentMlsId eq '39361'`),
 *           7 Mallan SL- (2 Active), and 0 strangers.
 */
import { participationWhere, isMallanAuthoredRow, BUYER_PARTICIPATION_HOLD } from '../personal-participation';

const MAYA = { agentId: '1', trestleMlsId: '39361' };

/** Flatten a Prisma where-tree to JSON for structural assertions. */
const flat = (w: unknown) => JSON.stringify(w, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));

describe('personal scope — proven participation only', () => {
  it('binds Mallan-authored rows to THIS agent, not merely to being Mallan-authored', () => {
    const w = flat(participationWhere(MAYA, 'personal'));
    // Being SL-/RL- is provenance; ownership additionally requires agent_id.
    expect(w).toContain('"agent_id":"1n"');
    expect(w).toContain('SL-');
    expect(w).toContain('RL-');
  });

  it('admits Cotality participation via the LIVE-VERIFIED identity field', () => {
    // `ListAgentMlsId 39361` was confirmed live as "Maya Allan, MAllan Real
    // Estate Inc" on 6/6 sampled records.
    const w = flat(participationWhere(MAYA, 'personal'));
    expect(w).toContain('"list_agent_mls_id":"39361"');
    // Co-listing IS participation — populated on 161/500 live Closed records.
    expect(w).toContain('"co_list_agent_mls_id":"39361"');
  });

  it('NEVER admits a provider row without a participation test', () => {
    // The exact defect: `{ mls_id: { not: null }, status: { in: TERMINAL } }`.
    const w = flat(participationWhere(MAYA, 'personal'));
    expect(w).not.toContain('mls_id":{"not":null');
    expect(w).not.toContain('Closed');
    expect(w).not.toContain('Sold');
  });

  it('an agent with NO provider identity gets only their Mallan-authored rows', () => {
    // Two of three Mallan agents have `trestle_mls_id: null` in production.
    // This must fail CLOSED, not match every provider row.
    const w = flat(participationWhere({ agentId: '4', trestleMlsId: null }, 'personal'));
    expect(w).toContain('"agent_id":"4n"');
    expect(w).not.toContain('list_agent_mls_id');
  });

  it('an unparseable agent id matches NOTHING rather than everything', () => {
    const w = flat(participationWhere({ agentId: 'not-a-number', trestleMlsId: null }, 'personal'));
    expect(w).toContain('"in":[]');
  });

  it('BROKER role is irrelevant here — scope is an explicit argument', () => {
    // The old code branched on role and skipped ownership for BROKER. The
    // resolver has no role input at all, so that class of bug is unrepresentable.
    expect(participationWhere(MAYA, 'personal')).toEqual(participationWhere(MAYA, 'personal'));
    const personal = flat(participationWhere(MAYA, 'personal'));
    const brokerage = flat(participationWhere({ ...MAYA, officeMlsIds: ['7041'] }, 'brokerage'));
    expect(personal).not.toEqual(brokerage);
  });
});

describe('brokerage scope — a separate product, fail-closed', () => {
  it('scopes to proven office identity', () => {
    const w = flat(participationWhere({ ...MAYA, officeMlsIds: ['7041'] }, 'brokerage'));
    expect(w).toContain('7041');
  });

  it('returns NOTHING when no office identity is proven', () => {
    // "No office => everything" is the dangerous direction.
    const w = flat(participationWhere(MAYA, 'brokerage'));
    expect(w).toBe('{"id":{"in":[]}}');
  });
});

describe('buyer-side participation is reserved, not forgotten', () => {
  it('records the proven provider contract and the exact storage hold', () => {
    expect(BUYER_PARTICIPATION_HOLD.status).toBe('AWAITING_AUTHORIZATION');
    expect(BUYER_PARTICIPATION_HOLD.providerFields).toContain('BuyerAgentMlsId');
    expect(BUYER_PARTICIPATION_HOLD.requiredColumns).toContain('buyer_agent_mls_id');
  });

  it('records that the value vocabulary is NOT purely numeric', () => {
    // 500 live Closed records: 473 numeric, 18 NONMEMBER, 9 team codes.
    // Coercing this to a number would silently drop real participation.
    expect(BUYER_PARTICIPATION_HOLD.sentinelValues).toEqual(
      expect.arrayContaining(['NONMEMBER', 'TM61', 'TM62', 'TM63']),
    );
  });

  it('is absent from the query until storage exists — no silent half-answer', () => {
    const w = flat(participationWhere(MAYA, 'personal'));
    expect(w).not.toContain('buyer_agent_mls_id');
  });
});

describe('Mallan-authored identification', () => {
  it.each([
    ['SL-0004', undefined, true],
    ['SL-0007', undefined, true],
    ['RL-0001', undefined, true],
    ['RLS20053594', true, false],
    ['RLS20082069', undefined, false],
  ])('%s -> mallan-authored=%s', (listing_id, rls_eligible, expected) => {
    expect(isMallanAuthoredRow({ listing_id, rls_eligible })).toBe(expected);
  });

  it('treats rls_eligible=false as Mallan-authored even without an SL-/RL- id', () => {
    expect(isMallanAuthoredRow({ listing_id: 'X-1', rls_eligible: false })).toBe(true);
  });
});
