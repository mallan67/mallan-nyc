/// <reference types="jest" />
/**
 * LANE 3 PACKET 2 — THE ONE NURTURE CLOCK.
 *
 * Packet 1 built the discharge ledger and gave it no reader. `qualifies_nurture` and
 * `delivery_status` were written by the canonical send route and consumed by nothing, so no
 * scheduler could ask "has this client's nurture obligation been discharged?" — and three
 * independent clocks answered it their own way instead:
 *
 *   lib/lifecycle/engine.ts     last_contacted_at <= now-80d
 *   app/api/cron/tenant-nurture reengage_anchor_date -> outreach_6mo/90d/60d/30d ladder
 *   lib/crm/growth-tools.ts     cadenceDays(sales_drip_status) vs a five-field lastTouch()
 *
 * This module is the single replacement. The ANCHOR ORDER is owner-ruled and deliberately short:
 *
 *   1. newest ACCEPTED ActivityLog client_report_sent with qualifies_nurture = true
 *   2. otherwise a VERIFIED transition into the canonical Nurture state
 *   3. otherwise UNANCHORED — and UNANCHORED manufactures nothing
 *
 * WHY STEP 2 IS AN EMPTY SET RATHER THAN THE FOUR-TOKEN COHORT. The legacy engine admitted
 * `nurturing|past|new|contacted` into the nurture cohort. That is evidence of legacy behaviour,
 * not authority: 'new' and 'contacted' are ordinarily active prospect states, not a long-term
 * relationship cadence. Resolving step 2 against those four tokens would freeze the old
 * implementation into the new canonical rule before the business-state question is settled, so
 * CANONICAL_NURTURE_STAGES ships EMPTY. The mechanism is live and proven below; only the policy
 * is unfilled. Settling membership is a one-line change plus a production census that is still
 * owed.
 *
 * WHAT UNANCHORED MEANS, and why it is a state rather than a fallback date. It lets the platform
 * say the true thing: "this client belongs in Nurture, but Mallan has no reliable evidence of when
 * this nurture cycle began." Every tempting substitute means something else —
 * `last_contacted_at` is any contact (a completed task sets it), `reengage_anchor_date` is a
 * manually-entered rental re-engagement date, `Lead.updated_at` is any field edit, and the
 * `outreach_*` dates belong to the retired ladder. Backfilling from any of them would invent a
 * six-month obligation out of a timestamp that never meant that.
 *
 * NOT THE CLOCK, deliberately: TriggerExecution. It may dedupe processing so one cron firing does
 * not alert twice, but it does not decide when a relationship report is due. ActivityLog owns that.
 */
import {
  NURTURE_INTERVAL_MONTHS,
  CANONICAL_NURTURE_STAGES,
  LEGACY_NURTURE_COMPAT_STAGES,
  resolveNurtureAnchor,
  resolveNurtureAnchorsBatch,
  evaluateNurtureDue,
  verdictFromAnchor,
  isInCanonicalNurture,
  nurtureDueAt,
} from '@/lib/crm/nurture-due';
import type { NurtureLead } from '@/lib/crm/nurture-due';

const activityLogFindFirstMock = jest.fn();
const activityLogFindManyMock = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    activityLog: {
      findFirst: (...a: unknown[]) => activityLogFindFirstMock(...a),
      findMany: (...a: unknown[]) => activityLogFindManyMock(...a),
    },
  },
}));

const LEAD = 42n;
const NOW = new Date('2026-09-17T12:00:00.000Z');
/** Comfortably older than six months before NOW. */
const OLD = new Date('2026-01-05T09:00:00.000Z');
/** Comfortably newer than six months before NOW. */
const RECENT = new Date('2026-08-01T09:00:00.000Z');

/**
 * Deliberately WIDER than NurtureLead.
 *
 * NurtureLead exposes only { id, nurture_paused }, so TypeScript rejects every decoy below at
 * compile time — which is a stronger guarantee than any assertion here can make, and is the first
 * reason these clocks cannot creep back in. The casts are therefore intentional: they smuggle the
 * decoys past the compiler precisely so the RUNTIME behaviour can be proven too. That still earns
 * its place, because the lifecycle engine hands wider row objects to verdictFromAnchor, so the
 * narrow type is not enforced on every path at runtime.
 */
const base = {
  id: LEAD,
  nurture_paused: false,
  pipeline_stage: 'nurturing',
  // Every field below is a decoy: none of them may influence the clock.
  last_contacted_at: RECENT,
  reengage_anchor_date: RECENT,
  updated_at: RECENT,
  outreach_6mo_date: RECENT,
  outreach_90d_date: RECENT,
  outreach_60d_date: RECENT,
  outreach_30d_date: RECENT,
  sales_drip_status: 'monthly',
  rental_drip_status: 'monthly',
};

/** A qualifying discharge row as the canonical route actually writes it. */
function qualifyingRow(at: Date) {
  return { id: 1n, created_at: at, actor_id: 7n };
}

beforeEach(() => {
  activityLogFindFirstMock.mockReset();
  activityLogFindFirstMock.mockResolvedValue(null);
  activityLogFindManyMock.mockReset();
  activityLogFindManyMock.mockResolvedValue([]);
});

// ═════════════════════════════════════════════════════════════════════════════
// A — the anchor comes from the discharge ledger, and only from a real discharge
// ═════════════════════════════════════════════════════════════════════════════
describe('A · the qualifying report is the anchor', () => {
  it('anchors on the newest accepted qualifying report', async () => {
    activityLogFindFirstMock.mockResolvedValue(qualifyingRow(OLD));
    const anchor = await resolveNurtureAnchor(LEAD);
    expect(anchor).toEqual({ kind: 'qualifying_report', at: OLD });
  });

  it('asks the ledger for exactly the three conditions that constitute a discharge', async () => {
    await resolveNurtureAnchor(LEAD);
    const where = (activityLogFindFirstMock.mock.calls[0][0] as Record<string, any>).where;
    expect(where.lead_id).toBe(LEAD);
    expect(where.activity_type).toBe('client_report_sent');
    // Two JSON-path predicates on one column cannot be sibling keys — the second would overwrite
    // the first — so the second rides in an AND. Both forms are already proven in this repo
    // (report-send/route.ts:111 string, listings/route.ts:412 boolean).
    expect(where.metadata).toEqual({ path: ['qualifies_nurture'], equals: true });
    expect(where.AND).toEqual([{ metadata: { path: ['delivery_status'], equals: 'accepted' } }]);
  });

  it('orders newest-first so the most recent discharge wins', async () => {
    await resolveNurtureAnchor(LEAD);
    const args = activityLogFindFirstMock.mock.calls[0][0] as Record<string, any>;
    expect(args.orderBy).toEqual({ created_at: 'desc' });
  });

  it('scopes the query to the one lead, so one client cannot answer for another', async () => {
    await resolveNurtureAnchor(99n);
    const where = (activityLogFindFirstMock.mock.calls[0][0] as Record<string, any>).where;
    expect(where.lead_id).toBe(99n);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — UNANCHORED manufactures nothing
// ═════════════════════════════════════════════════════════════════════════════
describe('B · UNANCHORED is a state, not a date', () => {
  it('reports unanchored when the ledger holds no qualifying discharge', async () => {
    const anchor = await resolveNurtureAnchor(LEAD);
    expect(anchor).toEqual({ kind: 'unanchored' });
  });

  it('surfaces an agent action and NO due date', async () => {
    const verdict = await evaluateNurtureDue(base as unknown as NurtureLead, NOW);
    expect(verdict).toEqual({ state: 'unanchored', action: 'nurture_baseline_required' });
    expect(verdict).not.toHaveProperty('due_at');
  });

  it('does not become due merely because the decoy timestamps are old', async () => {
    // Every decoy pushed far into the past. An implementation that fell back to any of them
    // would now report `due`; the honest answer is still that we do not know.
    const verdict = await evaluateNurtureDue(
      {
        ...base,
        last_contacted_at: OLD,
        reengage_anchor_date: OLD,
        updated_at: OLD,
        outreach_6mo_date: OLD,
        outreach_90d_date: OLD,
        outreach_60d_date: OLD,
        outreach_30d_date: OLD,
      } as unknown as NurtureLead,
      NOW,
    );
    expect(verdict.state).toBe('unanchored');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — membership is settled, and the legacy stages are not members
// ═════════════════════════════════════════════════════════════════════════════
describe('C · the canonical Nurture state', () => {
  it('is exactly the one canonical token', () => {
    // An earlier revision shipped this EMPTY to avoid canonising the legacy cohort. That was a
    // contradiction rather than caution: the lifecycle engine went on treating all four legacy
    // tokens as nurture obligations, so the legacy predicate WAS the membership rule while the
    // code claimed none had been chosen. The production census classifies legacy rows; it is not
    // a reason to leave the canonical state undefined.
    expect(CANONICAL_NURTURE_STAGES).toEqual(['nurturing']);
  });

  it('keeps the three legacy stages separate and non-member', () => {
    expect(LEGACY_NURTURE_COMPAT_STAGES).toEqual(['past', 'new', 'contacted']);
    for (const legacy of LEGACY_NURTURE_COMPAT_STAGES) {
      expect(CANONICAL_NURTURE_STAGES).not.toContain(legacy);
    }
  });

  it('a stage entry into the canonical state anchors when no report exists', async () => {
    activityLogFindFirstMock.mockImplementation(async (args: any) =>
      args.where.activity_type === 'status_change' ? { id: 2n, created_at: OLD } : null,
    );
    expect(await resolveNurtureAnchor(LEAD)).toEqual({ kind: 'stage_entry', at: OLD });
  });

  it('a qualifying report still outranks a stage entry', async () => {
    activityLogFindFirstMock.mockImplementation(async (args: any) =>
      args.where.activity_type === 'client_report_sent'
        ? qualifyingRow(RECENT)
        : { id: 2n, created_at: OLD },
    );
    expect(await resolveNurtureAnchor(LEAD)).toEqual({ kind: 'qualifying_report', at: RECENT });
  });

  it('asks only for entries into a CANONICAL stage', async () => {
    await resolveNurtureAnchor(LEAD);
    const stageCall = activityLogFindFirstMock.mock.calls.find(
      (c) => (c[0] as any).where.activity_type === 'status_change',
    );
    expect(stageCall).toBeDefined();
    expect((stageCall![0] as any).where.OR).toEqual([
      { metadata: { path: ['new_pipeline_stage'], equals: 'nurturing' } },
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D — pause is honoured, and short-circuits before any ledger read
// ═════════════════════════════════════════════════════════════════════════════
describe('D · nurture_paused suppresses the obligation', () => {
  it('returns paused and computes nothing', async () => {
    const verdict = await evaluateNurtureDue({ ...base, nurture_paused: true } as unknown as NurtureLead, NOW);
    expect(verdict).toEqual({ state: 'paused' });
  });

  it('does not query the ledger at all when paused', async () => {
    await evaluateNurtureDue({ ...base, nurture_paused: true } as unknown as NurtureLead, NOW);
    expect(activityLogFindFirstMock).not.toHaveBeenCalled();
  });

  it('a paused client with a long-overdue anchor is still paused, not due', async () => {
    activityLogFindFirstMock.mockResolvedValue(qualifyingRow(OLD));
    const verdict = await evaluateNurtureDue({ ...base, nurture_paused: true } as unknown as NurtureLead, NOW);
    expect(verdict.state).toBe('paused');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E — the six-month arithmetic
// ═════════════════════════════════════════════════════════════════════════════
describe('E · rolling six-month cadence', () => {
  it('is six months, not 80 days and not 2016 hours', () => {
    expect(NURTURE_INTERVAL_MONTHS).toBe(6);
  });

  it('adds six calendar months to the anchor', () => {
    expect(nurtureDueAt(new Date('2026-01-31T00:00:00.000Z')).toISOString()).toBe(
      new Date('2026-07-31T00:00:00.000Z').toISOString(),
    );
  });

  it('reports due when the anchor is older than six months', async () => {
    activityLogFindFirstMock.mockResolvedValue(qualifyingRow(OLD));
    const verdict = await evaluateNurtureDue(base as unknown as NurtureLead, NOW);
    expect(verdict.state).toBe('due');
    expect((verdict as any).anchor).toEqual({ kind: 'qualifying_report', at: OLD });
  });

  it('reports scheduled — not due — when the anchor is inside six months', async () => {
    activityLogFindFirstMock.mockResolvedValue(qualifyingRow(RECENT));
    const verdict = await evaluateNurtureDue(base as unknown as NurtureLead, NOW);
    expect(verdict.state).toBe('scheduled');
    expect((verdict as any).due_at.toISOString()).toBe(nurtureDueAt(RECENT).toISOString());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F — negative mutation proofs: the decoy clocks are genuinely unread
// ═════════════════════════════════════════════════════════════════════════════
describe('F · the retired clocks cannot influence the verdict', () => {
  const decoys: Array<[string, Record<string, unknown>]> = [
    ['last_contacted_at', { last_contacted_at: OLD }],
    ['reengage_anchor_date', { reengage_anchor_date: OLD }],
    ['updated_at', { updated_at: OLD }],
    ['outreach_6mo_date', { outreach_6mo_date: OLD }],
    ['outreach_90d_date', { outreach_90d_date: OLD }],
    ['outreach_60d_date', { outreach_60d_date: OLD }],
    ['outreach_30d_date', { outreach_30d_date: OLD }],
    ['sales_drip_status', { sales_drip_status: 'biannual' }],
    ['rental_drip_status', { rental_drip_status: 'biannual' }],
  ];

  it.each(decoys)('moving %s does not change a scheduled verdict', async (_name, patch) => {
    activityLogFindFirstMock.mockResolvedValue(qualifyingRow(RECENT));
    const control = await evaluateNurtureDue(base as unknown as NurtureLead, NOW);
    activityLogFindFirstMock.mockResolvedValue(qualifyingRow(RECENT));
    const mutated = await evaluateNurtureDue({ ...base, ...patch } as unknown as NurtureLead, NOW);
    expect(mutated).toEqual(control);
  });

  it('the module source never reads a retired clock', () => {
    // Source assertion as a belt to the behavioural braces above: a future edit could reintroduce
    // one of these as a fallback and the behavioural tests would only catch it for the fields they
    // happen to move.
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../lib/crm/nurture-due.ts'),
      'utf8',
    );
    const executable = src
      .split(/\r?\n/)
      .filter((l: string) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*'))
      .join('\n');
    for (const banned of [
      'last_contacted_at',
      'reengage_anchor_date',
      'updated_at',
      'outreach_6mo_date',
      'outreach_90d_date',
      'outreach_60d_date',
      'outreach_30d_date',
      'sales_drip_status',
      'rental_drip_status',
      'triggerExecution',
      'listingView',
    ]) {
      expect({ banned, present: executable.includes(banned) }).toEqual({ banned, present: false });
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// G — ONE CLOCK MEANS THE BATCH AND SINGLE PATHS AGREE
// ═════════════════════════════════════════════════════════════════════════════
describe('G · batch/single parity', () => {
  /**
   * WHY THIS BLOCK EXISTS. An earlier revision implemented the stage-entry step ONLY in
   * resolveNurtureAnchor and let resolveNurtureAnchorsBatch mark every remaining lead
   * unanchored. Both the lifecycle engine and Growth Tools use the BATCH path, so that was a
   * second set of semantics hiding inside the one clock: a single-lead lookup could find a
   * stage-entry anchor that the actual scheduling and dashboard paths could not. The
   * divergence was invisible while the canonical stage set was empty and would have surfaced
   * the moment it was populated — as a silent scheduling difference, not an error.
   */
  const scenarios: Array<[string, () => void]> = [
    ['a qualifying report', () => {
      activityLogFindFirstMock.mockImplementation(async (args: any) =>
        args.where.activity_type === 'client_report_sent' ? qualifyingRow(OLD) : null,
      );
      activityLogFindManyMock.mockImplementation(async (args: any) =>
        args.where.activity_type === 'client_report_sent'
          ? [{ lead_id: LEAD, created_at: OLD }]
          : [],
      );
    }],
    ['a stage entry only', () => {
      activityLogFindFirstMock.mockImplementation(async (args: any) =>
        args.where.activity_type === 'status_change' ? { id: 2n, created_at: OLD } : null,
      );
      activityLogFindManyMock.mockImplementation(async (args: any) =>
        args.where.activity_type === 'status_change'
          ? [{ lead_id: LEAD, created_at: OLD }]
          : [],
      );
    }],
    ['nothing at all', () => {
      activityLogFindFirstMock.mockResolvedValue(null);
      activityLogFindManyMock.mockResolvedValue([]);
    }],
  ];

  it.each(scenarios)('%s resolves identically on both paths', async (_name, arrange) => {
    arrange();
    const single = await resolveNurtureAnchor(LEAD);
    arrange();
    const batch = await resolveNurtureAnchorsBatch([LEAD]);
    expect(batch.get(String(LEAD))).toEqual(single);
  });

  it('the batch path DOES query for stage entries', async () => {
    // The specific regression: it previously never issued this query at all.
    await resolveNurtureAnchorsBatch([LEAD]);
    const asked = activityLogFindManyMock.mock.calls.map((c) => (c[0] as any).where.activity_type);
    expect(asked).toContain('status_change');
  });

  it('it asks for stage entries only for leads still unanchored', async () => {
    activityLogFindManyMock.mockImplementation(async (args: any) =>
      args.where.activity_type === 'client_report_sent'
        ? [{ lead_id: 1n, created_at: OLD }]
        : [],
    );
    await resolveNurtureAnchorsBatch([1n, 2n]);
    const stageCall = activityLogFindManyMock.mock.calls.find(
      (c) => (c[0] as any).where.activity_type === 'status_change',
    );
    // Lead 1 already has a report anchor, so only lead 2 needs the second query.
    expect((stageCall![0] as any).where.lead_id).toEqual({ in: [2n] });
  });

  it('every requested lead gets an entry, so a caller never reads undefined', async () => {
    const out = await resolveNurtureAnchorsBatch([1n, 2n, 3n]);
    expect([...out.keys()].sort()).toEqual(['1', '2', '3']);
    expect([...out.values()].every((v) => v.kind === 'unanchored')).toBe(true);
  });

  it('an empty cohort issues no query at all', async () => {
    await resolveNurtureAnchorsBatch([]);
    expect(activityLogFindManyMock).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// H — CURRENT MEMBERSHIP DECIDES WHETHER THE CLOCK APPLIES AT ALL
// ═════════════════════════════════════════════════════════════════════════════
describe('H · membership gates the verdict', () => {
  /**
   * HISTORY AND APPLICABILITY ARE DIFFERENT FACTS, and an earlier revision of this module
   * conflated them by omitting pipeline_stage from NurtureLead entirely. It could answer when
   * a cycle started and never whether the clock should be running, which produced two bad
   * cases: a client who entered Nurture months ago and has since moved to active kept
   * generating due obligations off records that were still true but no longer relevant, and a
   * client sitting in new or contacted could acquire a cadence outright because an agent
   * marked one report as nurture follow-up.
   */
  it('the canonical membership test accepts only the canonical stage', () => {
    expect(isInCanonicalNurture('nurturing')).toBe(true);
    for (const other of [...LEGACY_NURTURE_COMPAT_STAGES, 'active_buyer', 'deal', null, undefined, '']) {
      expect({ other, member: isInCanonicalNurture(other as any) }).toEqual({ other, member: false });
    }
  });

  it.each([...LEGACY_NURTURE_COMPAT_STAGES, 'active_buyer', 'deal', 'closed'])(
    'a client in %s is not_applicable even with an overdue qualifying report',
    async (stage) => {
      // The history is REAL and is not deleted. It simply does not apply while the client is
      // outside the canonical Nurture state.
      activityLogFindFirstMock.mockResolvedValue(qualifyingRow(OLD));
      const verdict = await evaluateNurtureDue(
        { ...base, pipeline_stage: stage } as unknown as NurtureLead,
        NOW,
      );
      expect(verdict).toEqual({ state: 'not_applicable' });
    },
  );

  it('leaving Nurture stops the obligation WITHOUT touching the ledger', async () => {
    activityLogFindFirstMock.mockResolvedValue(qualifyingRow(OLD));
    const inside = await evaluateNurtureDue(base as unknown as NurtureLead, NOW);
    expect(inside.state).toBe('due');

    activityLogFindFirstMock.mockResolvedValue(qualifyingRow(OLD));
    const outside = await evaluateNurtureDue(
      { ...base, pipeline_stage: 'active_buyer' } as unknown as NurtureLead,
      NOW,
    );
    expect(outside.state).toBe('not_applicable');

    // Re-entering restores the obligation from the same untouched history.
    activityLogFindFirstMock.mockResolvedValue(qualifyingRow(OLD));
    const back = await evaluateNurtureDue(base as unknown as NurtureLead, NOW);
    expect(back.state).toBe('due');
  });

  it('a non-member is decided without reading the ledger at all', async () => {
    await evaluateNurtureDue(
      { ...base, pipeline_stage: 'contacted' } as unknown as NurtureLead,
      NOW,
    );
    expect(activityLogFindFirstMock).not.toHaveBeenCalled();
  });

  it('membership outranks pause, so a paused non-member is not_applicable', async () => {
    const verdict = await evaluateNurtureDue(
      { ...base, pipeline_stage: 'closed', nurture_paused: true } as unknown as NurtureLead,
      NOW,
    );
    expect(verdict).toEqual({ state: 'not_applicable' });
  });

  it('verdictFromAnchor applies the SAME order as the single path', () => {
    // The batch path reaches its verdict through this function, so parity depends on it.
    const anchor = { kind: 'qualifying_report' as const, at: OLD };
    expect(
      verdictFromAnchor({ id: LEAD, nurture_paused: false, pipeline_stage: 'past' }, anchor, NOW),
    ).toEqual({ state: 'not_applicable' });
    expect(
      verdictFromAnchor({ id: LEAD, nurture_paused: true, pipeline_stage: 'nurturing' }, anchor, NOW),
    ).toEqual({ state: 'paused' });
    expect(
      verdictFromAnchor({ id: LEAD, nurture_paused: false, pipeline_stage: 'nurturing' }, anchor, NOW)
        .state,
    ).toBe('due');
  });
});
