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
    // The CODE is complete and wired; only the production mutation is held.
    expect(BUYER_PARTICIPATION_HOLD.status).toBe('CODE_COMPLETE_AWAITING_PRODUCTION_MUTATION');
    expect(BUYER_PARTICIPATION_HOLD.providerFields).toContain('BuyerAgentMlsId');
    expect(BUYER_PARTICIPATION_HOLD.requiredColumns).toContain('buyer_agent_mls_id');
    // The backfill predicate must be the UNION of roles: a single-field filter
    // misses 106 co-buyer-only and 370 office-only rows (live-verified).
    expect(BUYER_PARTICIPATION_HOLD.backfillFilterTemplate).toContain('CoBuyerAgentMlsId');
    expect(BUYER_PARTICIPATION_HOLD.backfillFilterTemplate).toContain('ListAgentMlsId');
  });

  it('records that the value vocabulary is NOT purely numeric', () => {
    // 500 live Closed records: 473 numeric, 18 NONMEMBER, 9 team codes.
    // Coercing this to a number would silently drop real participation.
    // CORRECTED: only NONMEMBER is proven. TM6x span a single office each and
    // are shaped like real identities, so classifying them as non-agents would
    // drop real participation.
    expect(BUYER_PARTICIPATION_HOLD.sentinelValues).toEqual(['NONMEMBER']);
  });

  it('OFFICE roles never appear in the PERSONAL predicate', () => {
    // An office match proves BROKERAGE participation, not which individual
    // agent participated. Using it personally would recreate the contamination.
    const w = flat(participationWhere(MAYA, 'personal'));
    expect(w).not.toContain('buyer_office_mls_id');
    expect(w).not.toContain('list_office_mls_id');
  });

  it('buyer-side roles are HELD until the migration is authorized (expand-first ordering)', () => {
    // CORRECTED 2026-08-19. This test previously asserted the buyer clauses were
    // WIRED. They were — unconditionally — while
    // `docs/operations/buyer-participation-schema-hold-2026-08-17.md` §7 still
    // lists "Enable the two buyer-side clauses" as an UNCHECKED authorization box
    // and states "None of these has been performed."
    //
    // Production has ZERO `%buyer%` columns on `listings` (verified 2026-08-19),
    // so emitting them raises Prisma P2022 on every personal-participation query.
    // Shipping that is the 2026-04-19 silent-drift failure mode (NEON.md Trap #1):
    // schema-dependent code deployed ahead of its migration.
    //
    // Expand-first means the MIGRATION leads and the READER follows. Until the
    // migration is authorized and applied, the correct state is HELD.
    const w = flat(participationWhere(MAYA, 'personal'));
    expect(w).not.toContain('buyer_agent_mls_id');
    expect(w).not.toContain('co_buyer_agent_mls_id');

    // Listing-side participation is unaffected and must remain fully correct.
    expect(w).toContain('"list_agent_mls_id":"39361"');
    expect(w).toContain('"co_list_agent_mls_id":"39361"');
  });

  it('compares EXACTLY — the resolver holds no blacklist of provider values', () => {
    // DESIGN DECISION, corrected. An earlier revision refused a set of opaque
    // provider strings before comparing. That assigned semantics without
    // Cotality evidence and would have DROPPED real participation: each `TM6x`
    // spans exactly one office (7991) and is shaped like a genuine identity.
    //
    // Exact comparison is sufficient for every real identity — `'NONMEMBER'`
    // does not equal `'39361'` — so the blacklist bought nothing while carrying
    // the risk of silently discarding valid rows.
    //
    // THE RESIDUAL RISK IS REAL AND BELONGS UPSTREAM: if an Agent record ever
    // carried a non-individual value as its own `trestle_mls_id`, this predicate
    // would match every row sharing it. The control for that is VALIDATING
    // `agents.trestle_mls_id` as a verified individual Cotality member identity
    // when it is stored — not an ever-growing blacklist at query time. Asserted
    // here so the trade-off is explicit rather than accidental.
    const w = flat(participationWhere({ agentId: '1', trestleMlsId: 'NONMEMBER' }, 'personal'));
    expect(w).toContain('"list_agent_mls_id":"NONMEMBER"');
    expect(w).toContain('"agent_id":"1n"');

    // A verified identity resolves to itself and nothing else. (Asserted on the
    // listing-side roles — the buyer-side clauses are HELD pending migration
    // authorization; see the preceding test.)
    const mine = flat(participationWhere(MAYA, 'personal'));
    expect(mine).toContain('"list_agent_mls_id":"39361"');
    expect(mine).not.toContain('NONMEMBER');
  });
});

describe('Mallan-authored identification — AUTHORSHIP, not visibility', () => {
  it.each([
    ['SL-0004', true],
    ['SL-0007', true],
    ['RL-0001', true],
    ['RLS20053594', false],
    ['RLS20082069', false],
  ])('%s -> mallan-authored=%s', (listing_id, expected) => {
    expect(isMallanAuthoredRow({ listing_id })).toBe(expected);
  });

  it('RELEASE BLOCKER FIXED: rls_eligible is NOT an authorship signal', () => {
    // `rls_eligible` is a VISIBILITY/eligibility flag from `classifyRlsEligibility`.
    // Using it as a source test conflates two of the four decisions the master
    // plan requires be separate (§4 Identity/Source/Authority/Visibility), and it
    // breaks in BOTH directions:
    //
    //   a COMMERCIAL THIRD-PARTY listing is rls_eligible:false by design and
    //   would have been misread as Mallan-authored;
    //
    //   an RLS-ELIGIBLE SL- exclusive — the ordinary case for a real Mallan
    //   exclusive published to REBNY — is rls_eligible:true and must STILL be
    //   recognised as Mallan-authored.
    //
    // Production proof that removing the proxy changed nothing today:
    //   prefix only = 7, prefix OR rls_eligible=false = 7, reclassified = 0.
    expect(isMallanAuthoredRow({ listing_id: 'RLS20053594' } as never)).toBe(false);
    // Even if a caller supplies the flag, it must not influence the answer.
    expect(isMallanAuthoredRow({ listing_id: 'RLS20053594', rls_eligible: false } as never)).toBe(false);
    // And an RLS-eligible Mallan exclusive is still Mallan-authored.
    expect(isMallanAuthoredRow({ listing_id: 'SL-0099', rls_eligible: true } as never)).toBe(true);
  });

  it('the ownership predicate contains no rls_eligible arm', () => {
    const w = flat(participationWhere(MAYA, 'personal'));
    expect(w).not.toContain('rls_eligible');
  });
});
