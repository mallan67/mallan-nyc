/// <reference types="jest" />
/**
 * R2 BACKLOG UNIVERSE — one definition for the selector and the control plane.
 *
 * PROVEN DEFECT (independent audit of 0432bb68). Phase 4's `backlog_remaining`
 * probe rebuilt the backlog universe by hand instead of reusing
 * `buildR2BacklogWhere`'s base, and omitted two predicates:
 *
 *   * `media_key: { not: null }`      — unmirrorable rows (the mirror writes
 *                                        by media_key, so it can never touch them)
 *   * `r2_policy_excluded_at: null`   — explicitly policy-parked rows
 *
 * That was harmless while a policy exclusion ALSO stamped `r2_attempts = 9`,
 * because the probe's `r2_attempts < 8` clause caught it. The writer cutover
 * (654aacbc) stopped writing that sentinel — deliberately, because a policy
 * decision is not a failure — so a newly parked row now has NULL/low attempts
 * and passes the probe. It leaves the REAL backlog and stays counted forever.
 *
 * WHY THAT IS RELEASE-CRITICAL — the count is a control-plane input:
 *   backlog_remaining -> deriveOneCycleFollowup -> backlogPending
 *     -> nextBacklogRunAt -> preflight `backlog_due` -> One Cycle WAKES AGAIN
 * so the compute is woken forever to drain a backlog that cannot drain — the
 * exact opposite of this PR's Neon active-time goal. It also feeds
 * measureBacklogInflow -> computeAdaptiveDrainLimit, inflating batch sizes.
 *
 * The fix is ONE shared base (`buildR2MirrorableBacklogUniverseWhere`) that both
 * consumers layer on, so they cannot drift again.
 */

import {
  buildR2BacklogWhere,
  buildR2MirrorableBacklogUniverseWhere,
  buildR2ParkedRecoveryWhere,
  R2_RETRY_EXHAUSTED_THRESHOLD,
} from '../media-sync';

// ─── minimal Prisma-where evaluator (only the operators these selectors use) ──

type Row = Record<string, unknown>;

function matchLeaf(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (typeof cond !== 'object' || cond === null) return value === cond;
  const c = cond as Record<string, unknown>;
  if ('not' in c) {
    if (c.not === null) return value !== null && value !== undefined;
    return value !== c.not;
  }
  if ('lt' in c) {
    if (value === null || value === undefined) return false;
    return (value as number | Date) < (c.lt as number | Date);
  }
  if ('in' in c) return (c.in as unknown[]).includes(value);
  if ('notIn' in c) return !(c.notIn as unknown[]).includes(value);
  if ('startsWith' in c) return typeof value === 'string' && value.startsWith(c.startsWith as string);
  throw new Error(`unsupported operator: ${JSON.stringify(cond)}`);
}

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') {
      if (!(cond as Record<string, unknown>[]).every((c) => matches(row, c))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!(cond as Record<string, unknown>[]).some((c) => matches(row, c))) return false;
      continue;
    }
    if (key === 'NOT') {
      if (matches(row, cond as Record<string, unknown>)) return false;
      continue;
    }
    if (key === 'listing') {
      const listing = (row.listing ?? {}) as Row;
      if (!matches(listing, cond as Record<string, unknown>)) return false;
      continue;
    }
    if (!matchLeaf(row[key], cond)) return false;
  }
  return true;
}

// ─── fixtures ────────────────────────────────────────────────────────────────

const MALLAN_LISTING = {
  listing_id: 'SL-0004', rls_eligible: false, status: 'Active',
  idx_display_yn: true, owner_opt_out: false, participant_only: false,
  internet_entire_listing_display_yn: true, list_office_mls_id: null,
};

const THIRD_PARTY_DISPLAYABLE = {
  listing_id: 'RLS20105333', rls_eligible: true, status: 'Active',
  idx_display_yn: true, owner_opt_out: false, participant_only: false,
  internet_entire_listing_display_yn: true, list_office_mls_id: '51',
};

const THIRD_PARTY_TERMINAL = { ...THIRD_PARTY_DISPLAYABLE, status: 'Closed', idx_display_yn: false };

const base = (over: Row = {}): Row => ({
  status: 'active',
  media_url_original: 'https://api.cotality.com/trestle/Media/x.jpg',
  media_key: 'MK-1',
  media_type: 'Photo',
  r2_key: null,
  media_url_cached: null,
  r2_attempts: null,
  r2_last_attempt_at: null,
  r2_policy_excluded_at: null,
  listing: THIRD_PARTY_DISPLAYABLE,
  ...over,
});

const COOLDOWN = new Date('2026-08-09T12:00:00Z');
const OLD_ATTEMPT = new Date('2026-08-01T00:00:00Z');   // older than cooldown -> eligible
const RECENT_ATTEMPT = new Date('2026-08-09T13:00:00Z'); // inside cooldown -> deferred

const inMain = (row: Row) => matches(row, buildR2BacklogWhere(COOLDOWN, []) as Record<string, unknown>);
const inUniverse = (row: Row) => matches(row, buildR2MirrorableBacklogUniverseWhere() as Record<string, unknown>);

// ─── the defect, stated directly ─────────────────────────────────────────────

describe('THE DEFECT: policy-parked and unmirrorable rows must leave BOTH', () => {
  it('F: explicit policy exclusion with NULL attempts — excluded from both', () => {
    const row = base({ r2_policy_excluded_at: new Date('2026-08-09T10:00:00Z'), r2_attempts: null });
    expect(inMain(row)).toBe(false);
    expect(inUniverse(row)).toBe(false); // was TRUE before the fix -> phantom backlog
  });

  it('G: explicit policy exclusion with attempts 1-7 — excluded from both', () => {
    const row = base({ r2_policy_excluded_at: new Date('2026-08-09T10:00:00Z'), r2_attempts: 3 });
    expect(inMain(row)).toBe(false);
    expect(inUniverse(row)).toBe(false);
  });

  it('H: media_key NULL (unmirrorable) — excluded from both', () => {
    const row = base({ media_key: null });
    expect(inMain(row)).toBe(false);
    expect(inUniverse(row)).toBe(false); // was TRUE before the fix
  });
});

// ─── full retry / policy class matrix (audit section 3) ──────────────────────

describe('retry / policy class matrix — selector and universe agree', () => {
  const cases: Array<[string, Row, boolean]> = [
    ['A never-attempted eligible', base(), true],
    ['B pending retry 1', base({ r2_attempts: 1, r2_last_attempt_at: OLD_ATTEMPT }), true],
    ['B pending retry 7', base({ r2_attempts: 7, r2_last_attempt_at: OLD_ATTEMPT }), true],
    ['C exact 8 retry-exhausted', base({ r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD }), false],
    ['D legacy exact 9 sentinel', base({ r2_attempts: 9 }), false],
    ['E legacy >9 overflow', base({ r2_attempts: 12 }), false],
    ['F policy-excluded, attempts NULL', base({ r2_policy_excluded_at: new Date() }), false],
    ['G policy-excluded, attempts 3', base({ r2_policy_excluded_at: new Date(), r2_attempts: 3 }), false],
    ['H media_key NULL', base({ media_key: null }), false],
    ['I already mirrored', base({ r2_key: 'r2/x.webp', media_url_cached: 'https://cdn/x.webp' }), false],
    ['J terminal third-party', base({ listing: THIRD_PARTY_TERMINAL }), false],
    ['K third-party FloorPlan (feed set is Photo-only)', base({ media_type: 'FloorPlan' }), false],
    ['L Mallan-owned FloorPlan', base({ media_type: 'FloorPlan', listing: MALLAN_LISTING }), true],
    ['L Mallan-owned Photo', base({ listing: MALLAN_LISTING }), true],
    ['no source URL', base({ media_url_original: null }), false],
    ['deleted row', base({ status: 'deleted' }), false],
  ];

  it.each(cases)('%s', (_label, row, expected) => {
    expect(inUniverse(row)).toBe(expected);
    expect(inMain(row)).toBe(expected);
  });
});

// ─── the ONE deliberate divergence: cooldown ─────────────────────────────────

describe('cooldown is the ONLY deliberate difference, and its semantic is explicit', () => {
  /**
   * A cooldown-deferred row is still mirrorable — it is TEMPORALLY deferred,
   * not excluded. So it MUST count as backlog pending (otherwise the control
   * plane would report an empty backlog and stop scheduling work that is
   * genuinely outstanding), while the MAIN selector skips it this invocation.
   */
  it('recently-attempted row: deferred from this run, still counted as backlog', () => {
    const row = base({ r2_attempts: 2, r2_last_attempt_at: RECENT_ATTEMPT });
    expect(inMain(row)).toBe(false);      // skipped this invocation
    expect(inUniverse(row)).toBe(true);   // still outstanding work
  });

  it('cooled-down row re-enters the main selector', () => {
    const row = base({ r2_attempts: 2, r2_last_attempt_at: OLD_ATTEMPT });
    expect(inMain(row)).toBe(true);
    expect(inUniverse(row)).toBe(true);
  });

  it('the universe carries NO cooldown predicate', () => {
    expect(JSON.stringify(buildR2MirrorableBacklogUniverseWhere())).not.toContain('r2_last_attempt_at');
  });
});

// ─── the SECOND connected defect: recovery re-admitting parked rows ─────────

describe('parked-recovery selector must also honour the explicit policy column', () => {
  const RECOVERY_COOLDOWN = new Date('2026-08-09T12:00:00Z');
  const inRecovery = (row: Row) =>
    matches(row, buildR2ParkedRecoveryWhere(RECOVERY_COOLDOWN) as Record<string, unknown>);

  /**
   * The recovery cohort is `r2_attempts` EXACTLY 8. Recovery runs its chunk
   * through the SAME `mirrorChunk`, which pushes deterministic rejections onto
   * `policyParkIds` (media-sync.ts:4060/4104) even when `recoveryAttempt` is
   * true. So an exactly-8 row CAN acquire `r2_policy_excluded_at` while keeping
   * attempts = 8. Without the policy clause, recovery re-selects it every
   * cooldown cycle to re-reject and re-park it — precisely the "resurface
   * forever" loop the explicit column was introduced to end, left open on the
   * recovery path.
   */
  it('an exactly-8 row that was later policy-parked is NOT re-admitted', () => {
    const row = base({
      r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD,
      r2_last_attempt_at: OLD_ATTEMPT,
      r2_policy_excluded_at: new Date('2026-08-09T10:00:00Z'),
    });
    expect(inRecovery(row)).toBe(false);
  });

  it('a genuine exactly-8 recovery candidate IS still admitted', () => {
    const row = base({
      r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD,
      r2_last_attempt_at: OLD_ATTEMPT,
      r2_policy_excluded_at: null,
    });
    expect(inRecovery(row)).toBe(true);
  });

  it('recovery still excludes unmirrorable and non-exhausted rows', () => {
    expect(inRecovery(base({ r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD, r2_last_attempt_at: OLD_ATTEMPT, media_key: null }))).toBe(false);
    expect(inRecovery(base({ r2_attempts: 3, r2_last_attempt_at: OLD_ATTEMPT }))).toBe(false);
    expect(inRecovery(base({ r2_attempts: 9, r2_last_attempt_at: OLD_ATTEMPT }))).toBe(false);
  });

  it('recovery and the main universe never both claim the same row', () => {
    // Disjoint by construction: universe requires attempts < 8, recovery
    // requires exactly 8.
    for (const attempts of [null, 0, 7, 8, 9]) {
      const row = base({ r2_attempts: attempts, r2_last_attempt_at: OLD_ATTEMPT });
      expect(inUniverse(row) && inRecovery(row)).toBe(false);
    }
  });
});

// ─── structural: the selector is built FROM the universe ─────────────────────

describe('structure — the selector layers on the shared universe', () => {
  const universe = buildR2MirrorableBacklogUniverseWhere() as Record<string, unknown>;
  const main = buildR2BacklogWhere(COOLDOWN, []) as Record<string, unknown>;

  it('every universe top-level predicate appears in the selector', () => {
    for (const k of ['status', 'media_url_original', 'media_key', 'OR']) {
      expect(main[k]).toEqual(universe[k]);
    }
  });

  it('the universe pins all four previously-omitted predicates', () => {
    const s = JSON.stringify(universe);
    expect(universe.media_key).toEqual({ not: null });
    expect(s).toContain('r2_policy_excluded_at');
    expect(s).toContain('r2_attempts');
    expect(s).toContain('media_type'); // via buildR2MirrorPolicyMediaWhere
  });

  it('attemptedIds exclusion applies to the selector only', () => {
    const withIds = buildR2BacklogWhere(COOLDOWN, [1n, 2n]) as Record<string, unknown>;
    expect(withIds.id).toEqual({ notIn: [1n, 2n] });
    expect(universe.id).toBeUndefined();
  });
});
