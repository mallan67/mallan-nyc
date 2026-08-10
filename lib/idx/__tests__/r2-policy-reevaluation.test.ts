/// <reference types="jest" />
/**
 * R2 POLICY EXCLUSION — BOUNDED RE-ADMISSION.
 *
 * PROVEN PRODUCTION DEFECT (read-only measurement, 2026-08-10, hidden-mountain):
 *
 *   20,195 active third-party Photos are policy-parked across 1,721 listings.
 *   43 of them are the CURRENT canonical hero of their listing and have no R2
 *   object. They can never acquire one: nothing clears a policy exclusion, and
 *   its age is never read.
 *
 * A third-party Photo is parked when it is not the canonical hero at the moment
 * it is examined. Hero identity is MUTABLE — Cotality changes
 * `PreferredPhotoYN`, changes `order`, or the current hero row leaves. When the
 * hero moves to an already-parked row, that row stays excluded forever. The
 * photo still serves through `/api/media/proxy`, so this is a durability and
 * cost defect, not a broken image — but the column's own schema contract says
 * "the age gives a bounded re-evaluation window", and nothing consumed it.
 *
 * TWO PARK ENCODINGS EXIST AND BOTH MUST BE COVERED:
 *   * `r2_policy_excluded_at` non-null — the current writer (101 rows).
 *   * `r2_attempts = 9` (R2_POLICY_PARKED_ATTEMPTS) — the LEGACY writer
 *     (20,094 rows, and where all 43 stranded heroes live). The failure path
 *     caps the counter at 8 (`CASE WHEN r2_attempts < 8 THEN r2_attempts + 1`),
 *     so exactly-9 is unreachable by failure and is purely a policy marker.
 *     Clearing it on re-admission therefore destroys no failure history.
 *
 * MUTABLE vs IMMUTABLE. Only exclusions that can stop being true are worth
 * re-evaluating. A media_type outside the scope's approved set is fixed per
 * media_key and is filtered out by `buildR2MirrorPolicyMediaWhere()`, which the
 * re-evaluation selector ANDs in — so the immutable class is never selected and
 * never churns.
 *
 * The selector is a DEDICATED bounded owner. It deliberately does NOT weaken
 * `buildR2MirrorableBacklogUniverseWhere()` with an age clause: parked rows must
 * stay out of the backlog and out of `backlog_remaining` until a re-evaluation
 * actually re-admits them, or the control plane would wake Neon for work the
 * mirror still refuses to do.
 */

import {
  buildR2PolicyReevaluationWhere,
  reevaluateR2PolicyExclusions,
  buildR2MirrorableBacklogUniverseWhere,
  buildR2ParkedRecoveryWhere,
  R2_POLICY_REEVAL_INTERVAL_MS,
  R2_POLICY_REEVAL_BATCH_LIMIT,
  R2_RETRY_EXHAUSTED_THRESHOLD,
} from '../media-sync';
import { R2_POLICY_PARKED_ATTEMPTS } from '@/lib/media/r2-policy-state';

// ─── prisma mock ─────────────────────────────────────────────────────────────

const mockFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
const mockUpdateMany = jest.fn<Promise<{ count: number }>, [unknown]>();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listingMedia: {
      findMany: (args: unknown) => mockFindMany(args),
      updateMany: (args: unknown) => mockUpdateMany(args),
    },
  },
}));

// ─── generic Prisma-where evaluator ──────────────────────────────────────────
//
// It interprets the where the PRODUCTION selector emits. It encodes no policy
// of its own: every ownership / displayability / age rule reaching it comes
// from `buildR2PolicyReevaluationWhere`. An operator it does not implement
// throws rather than silently passing, so the mock can never be more permissive
// than the real query.

type Row = Record<string, unknown>;

function matchLeaf(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond !== 'object') return value === cond;
  const c = cond as Record<string, unknown>;
  if ('not' in c) {
    if (c.not === null) return value !== null && value !== undefined;
    return value !== c.not;
  }
  if ('lt' in c) {
    if (value === null || value === undefined) return false;
    return (value as number | Date) < (c.lt as number | Date);
  }
  if ('gte' in c) {
    if (value === null || value === undefined) return false;
    return (value as number | Date) >= (c.gte as number | Date);
  }
  if ('in' in c) return (c.in as unknown[]).includes(value);
  if ('notIn' in c) return !(c.notIn as unknown[]).includes(value);
  if ('startsWith' in c) return typeof value === 'string' && value.startsWith(c.startsWith as string);
  if ('equals' in c) return value === c.equals;
  throw new Error(`unsupported operator: ${JSON.stringify(cond)}`);
}

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
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
      if (!matches((row.listing ?? {}) as Row, cond as Record<string, unknown>)) return false;
      continue;
    }
    if (!matchLeaf(row[key], cond)) return false;
  }
  return true;
}

// ─── fixtures ────────────────────────────────────────────────────────────────

const THIRD_PARTY = {
  listing_id: 'RLS20105333', rls_eligible: true, status: 'Active',
  idx_display_yn: true, owner_opt_out: false, participant_only: false,
  internet_entire_listing_display_yn: true, list_office_mls_id: '51',
};
const THIRD_PARTY_TERMINAL = { ...THIRD_PARTY, status: 'Closed', idx_display_yn: false };
const MALLAN = {
  listing_id: 'SL-0004', rls_eligible: false, status: 'Active',
  idx_display_yn: false, owner_opt_out: false, participant_only: false,
  internet_entire_listing_display_yn: false, list_office_mls_id: null,
};

const NOW = new Date('2026-08-10T06:00:00Z').getTime();
const now = () => NOW;
/** Older than the re-evaluation interval ⇒ due. */
const DUE = new Date(NOW - R2_POLICY_REEVAL_INTERVAL_MS - 60_000);
/** Inside the interval ⇒ NOT due. */
const FRESH = new Date(NOW - 60_000);
const threshold = () => new Date(NOW - R2_POLICY_REEVAL_INTERVAL_MS);

let nextId = 1;
const row = (over: Row = {}): Row => ({
  id: BigInt(nextId++),
  listing_id: 'RLS20105333',
  media_key: `MK-${nextId}`,
  media_type: 'Photo',
  status: 'active',
  preferred_photo_yn: false,
  order: 5,
  media_url_original: 'https://api.cotality.com/trestle/Media/x.jpg',
  media_url_cached: null,
  r2_key: null,
  r2_attempts: null,
  r2_last_attempt_at: null,
  r2_policy_excluded_at: null,
  listing: THIRD_PARTY,
  ...over,
});
/** Current-writer park (explicit column). */
const parked = (over: Row = {}) => row({ r2_policy_excluded_at: DUE, ...over });
/** Legacy park (attempts sentinel + the cooldown stamp the old writer wrote). */
const legacyParked = (over: Row = {}) =>
  row({ r2_attempts: R2_POLICY_PARKED_ATTEMPTS, r2_last_attempt_at: DUE, ...over });

const selectable = (r: Row) =>
  matches(r, buildR2PolicyReevaluationWhere(threshold()) as Record<string, unknown>);

beforeEach(() => {
  nextId = 1;
  mockFindMany.mockReset();
  mockUpdateMany.mockReset();
  mockUpdateMany.mockImplementation(async (args) => ({
    count: ((args as { where: { id: { in: unknown[] } } }).where.id.in ?? []).length,
  }));
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 1 — the selector
// ═════════════════════════════════════════════════════════════════════════════

describe('buildR2PolicyReevaluationWhere — which parked rows come back for review', () => {
  it('1. a due third-party non-hero Photo parked by the CURRENT writer is selected', () => {
    expect(selectable(parked())).toBe(true);
  });

  it('2. a due third-party non-hero Photo parked by the LEGACY writer is selected', () => {
    // 20,094 Production rows — and the only class where stranded heroes exist.
    expect(selectable(legacyParked())).toBe(true);
  });

  it('3. a row parked INSIDE the interval is NOT selected (cadence, no 10-minute churn)', () => {
    expect(selectable(parked({ r2_policy_excluded_at: FRESH }))).toBe(false);
    expect(selectable(legacyParked({ r2_last_attempt_at: FRESH }))).toBe(false);
  });

  it('4. a row that is not parked at all is NOT selected', () => {
    expect(selectable(row())).toBe(false);
    expect(selectable(row({ r2_attempts: 3, r2_last_attempt_at: DUE }))).toBe(false);
  });

  it('5. IMMUTABLE class — a media_type outside the scope never re-enters', () => {
    // A third-party FloorPlan matches neither branch of the mirror policy, so
    // it is not selected and cannot churn.
    expect(selectable(parked({ media_type: 'FloorPlan' }))).toBe(false);
    expect(selectable(parked({ media_type: 'Video' }))).toBe(false);
    expect(selectable(legacyParked({ media_type: 'FloorPlan' }))).toBe(false);
  });

  it('6. media of a non-displayable / terminal listing is never re-admitted', () => {
    expect(selectable(parked({ listing: THIRD_PARTY_TERMINAL }))).toBe(false);
  });

  it('7. media_key NULL can never be mirrored, so it is never re-evaluated', () => {
    expect(selectable(parked({ media_key: null }))).toBe(false);
  });

  it('8. an already-mirrored row is not re-evaluated', () => {
    expect(selectable(parked({ r2_key: 'r2/abc.jpg', media_url_cached: 'https://cdn/abc.jpg' }))).toBe(false);
  });

  it('9. a deleted/replaced row is not re-evaluated', () => {
    expect(selectable(parked({ status: 'deleted' }))).toBe(false);
  });

  it('10. real retry-exhausted state (exactly 8) is NOT a policy park and is not selected', () => {
    expect(selectable(row({ r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD, r2_last_attempt_at: DUE }))).toBe(false);
  });

  it('11. legacy >9 stays fail-closed', () => {
    expect(selectable(row({ r2_attempts: 10, r2_last_attempt_at: DUE }))).toBe(false);
    expect(selectable(row({ r2_attempts: 12, r2_last_attempt_at: DUE }))).toBe(false);
  });

  it('12. the two park encodings never double-match the same row', () => {
    // A legacy row that has since been re-stamped carries BOTH markers; the
    // legacy branch requires a null column, so exactly one branch can fire.
    const migrated = row({ r2_attempts: R2_POLICY_PARKED_ATTEMPTS, r2_policy_excluded_at: DUE, r2_last_attempt_at: DUE });
    expect(selectable(migrated)).toBe(true);
    const w = buildR2PolicyReevaluationWhere(threshold()) as Record<string, unknown>;
    const branches = JSON.stringify(w);
    expect(branches).toContain('r2_policy_excluded_at');
    expect(branches).toContain('r2_attempts');
  });
});

describe('the main backlog control plane is NOT weakened', () => {
  it('13. a still-parked row stays out of the backlog universe (no phantom backlog)', () => {
    const u = buildR2MirrorableBacklogUniverseWhere() as Record<string, unknown>;
    expect(matches(parked(), u)).toBe(false);
    expect(matches(legacyParked(), u)).toBe(false);
  });

  it('14. the backlog universe contains no age-based re-admission clause', () => {
    // Re-admission belongs to its own selector. If an age clause ever appears
    // here, parked rows would rejoin backlog_remaining without the mirror
    // agreeing to take them.
    const s = JSON.stringify(buildR2MirrorableBacklogUniverseWhere());
    expect(s).toContain('"r2_policy_excluded_at":null');
    // The column may appear ONLY as an exact-null match. Any operator object
    // on it (`lt`, `gte`, `not`) would be an age/re-admission clause. Asserting
    // on the column specifically, not on `"lt"` anywhere — the unrelated
    // `r2_attempts < 8` retry clause legitimately uses `lt`.
    expect(s).not.toMatch(/"r2_policy_excluded_at":\s*\{/);
    // Same guard on the recovery selector, which shares the parked universe.
    expect(JSON.stringify(buildR2ParkedRecoveryWhere(new Date(NOW)))).not.toMatch(
      /"r2_policy_excluded_at":\s*\{/,
    );
  });

  it('15. a RE-ADMITTED row does enter the backlog universe (genuine work is counted)', () => {
    const readmitted = row({ r2_policy_excluded_at: null, r2_attempts: null });
    expect(matches(readmitted, buildR2MirrorableBacklogUniverseWhere() as Record<string, unknown>)).toBe(true);
  });

  it('16. exact-8 recovery semantics are untouched by re-admission', () => {
    const rec = buildR2ParkedRecoveryWhere(new Date(NOW - 1)) as Record<string, unknown>;
    expect(matches(row({ r2_attempts: 8, r2_last_attempt_at: DUE }), rec)).toBe(true);
    expect(matches(row({ r2_attempts: 9, r2_last_attempt_at: DUE }), rec)).toBe(false);
    expect(matches(parked({ r2_attempts: 8, r2_last_attempt_at: DUE }), rec)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 2 — the re-evaluation pass
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Serve the production selector honestly: page `pool` through the ACTUAL where
 * and `take` the production code supplies, and answer per-listing hero reads
 * from the same pool. A selector that stops filtering correctly changes these
 * results.
 */
function installPool(pool: Row[]) {
  mockFindMany.mockImplementation(async (args) => {
    const a = args as { where: Record<string, unknown>; take?: number; select?: Record<string, unknown> };
    // Per-listing hero read: keyed only by listing_id.
    if (typeof a.where?.listing_id === 'string' && !('status' in a.where)) {
      return pool.filter((r) => r.listing_id === a.where.listing_id);
    }
    const hit = pool.filter((r) => matches(r, a.where));
    return typeof a.take === 'number' ? hit.slice(0, a.take) : hit;
  });
}

/** Collapse the pass's updateMany calls into id → written data. */
function writes(): Array<{ ids: string[]; data: Record<string, unknown> }> {
  return mockUpdateMany.mock.calls.map(([args]) => {
    const a = args as { where: { id: { in: bigint[] } }; data: Record<string, unknown> };
    return { ids: a.where.id.in.map(String), data: a.data };
  });
}
function writtenFor(id: bigint): Record<string, unknown> | undefined {
  return writes().find((w) => w.ids.includes(String(id)))?.data;
}

describe('reevaluateR2PolicyExclusions — bounded re-admission', () => {
  it('17. a parked row that is NOW the canonical hero is re-admitted', async () => {
    const hero = legacyParked({ preferred_photo_yn: true, order: 9 });
    const other = row({ media_key: 'MK-other', order: 0, r2_key: 'r2/hero-old.jpg', media_url_cached: 'https://cdn/o.jpg' });
    installPool([hero, other]);

    const res = await reevaluateR2PolicyExclusions({ now });

    expect(res.readmitted).toBe(1);
    expect(res.kept_parked).toBe(0);
    const w = writtenFor(hero.id as bigint);
    expect(w).toEqual({ r2_policy_excluded_at: null, r2_attempts: null });
  });

  it('18. re-admission clears the LEGACY sentinel but never real failure history', async () => {
    // 9 is unreachable by failure (the counter caps at 8), so clearing it is
    // restoring truth. A genuine 0-7 count must survive re-admission.
    const legacyHero = legacyParked({ preferred_photo_yn: true });
    installPool([legacyHero]);
    await reevaluateR2PolicyExclusions({ now });
    expect(writtenFor(legacyHero.id as bigint)).toEqual({ r2_policy_excluded_at: null, r2_attempts: null });

    mockUpdateMany.mockClear();
    const realFailures = parked({ preferred_photo_yn: true, r2_attempts: 5 });
    installPool([realFailures]);
    await reevaluateR2PolicyExclusions({ now });
    const w = writtenFor(realFailures.id as bigint);
    expect(w).toEqual({ r2_policy_excluded_at: null });
    expect(w).not.toHaveProperty('r2_attempts');
  });

  it('19. a parked row that is STILL not the hero stays parked and its clock restarts', async () => {
    const heroRow = row({ media_key: 'MK-hero', order: 0 });
    const stillNotHero = legacyParked({ order: 7 });
    installPool([heroRow, stillNotHero]);

    const res = await reevaluateR2PolicyExclusions({ now });

    expect(res.readmitted).toBe(0);
    expect(res.kept_parked).toBe(1);
    const w = writtenFor(stillNotHero.id as bigint) as { r2_policy_excluded_at: Date };
    expect(w.r2_policy_excluded_at).toBeInstanceOf(Date);
    expect(w.r2_policy_excluded_at.getTime()).toBe(NOW);
    // Its real failure history is untouched, and the legacy sentinel is NOT
    // cleared — the row is still excluded by both encodings.
    expect(w).not.toHaveProperty('r2_attempts');
  });

  it('20. a re-stamped row is no longer due, so it cannot churn on the next run', async () => {
    const stillNotHero = legacyParked({ order: 7 });
    const heroRow = row({ media_key: 'MK-hero', order: 0 });
    installPool([heroRow, stillNotHero]);
    await reevaluateR2PolicyExclusions({ now });

    // Apply the write the pass just made, then re-select.
    const after = { ...stillNotHero, r2_policy_excluded_at: new Date(NOW) };
    expect(selectable(after)).toBe(false);
  });

  it('21. a Mallan-owned parked row is re-admitted regardless of hero identity', async () => {
    // Mallan-owned scope retains the COMPLETE active Photo + FloorPlan set, so
    // hero identity is irrelevant. (Production currently has 0 such rows; this
    // pins the rule rather than the current data.)
    const mallanNonHero = parked({ listing_id: 'SL-0004', listing: MALLAN, order: 4 });
    const mallanHero = row({ listing_id: 'SL-0004', listing: MALLAN, media_key: 'MK-mhero', order: 0 });
    installPool([mallanHero, mallanNonHero]);

    const res = await reevaluateR2PolicyExclusions({ now });
    expect(res.readmitted).toBe(1);
    expect(writtenFor(mallanNonHero.id as bigint)).toEqual({ r2_policy_excluded_at: null });
  });

  it('22. the batch is bounded — the pass never scans more than its limit', async () => {
    const heroRow = row({ media_key: 'MK-hero', order: 0 });
    const many = Array.from({ length: 500 }, (_, i) => legacyParked({ order: i + 10 }));
    installPool([heroRow, ...many]);

    const res = await reevaluateR2PolicyExclusions({ now });

    expect(res.scanned).toBe(R2_POLICY_REEVAL_BATCH_LIMIT);
    const selectCall = mockFindMany.mock.calls.find(
      ([a]) => (a as { take?: number }).take !== undefined,
    )?.[0] as { take: number };
    expect(selectCall.take).toBe(R2_POLICY_REEVAL_BATCH_LIMIT);
  });

  it('23. an explicit batchLimit is honored (caller-bounded)', async () => {
    const heroRow = row({ media_key: 'MK-hero', order: 0 });
    installPool([heroRow, ...Array.from({ length: 30 }, (_, i) => legacyParked({ order: i + 10 }))]);
    const res = await reevaluateR2PolicyExclusions({ now, batchLimit: 5 });
    expect(res.scanned).toBe(5);
  });

  it('24. writes are batched — at most three statements regardless of batch size, and the counters balance', async () => {
    const heroRow = row({ media_key: 'MK-hero', order: 0 });
    const keeps = Array.from({ length: 20 }, (_, i) => legacyParked({ order: i + 10 }));
    const legacyHeroListing = { ...THIRD_PARTY, listing_id: 'RLS20099238' };
    const legacyHero = legacyParked({ listing_id: 'RLS20099238', listing: legacyHeroListing, preferred_photo_yn: true });
    const modernListing = { ...THIRD_PARTY, listing_id: 'RLS20105507' };
    const modernHero = parked({ listing_id: 'RLS20105507', listing: modernListing, preferred_photo_yn: true, r2_attempts: 2 });
    installPool([heroRow, ...keeps, legacyHero, modernHero]);

    await reevaluateR2PolicyExclusions({ now });

    // Three groups can be written: explicit re-admit, legacy re-admit,
    // re-stamp. Deferred rows are not written at all, so they add no statement.
    expect(mockUpdateMany.mock.calls.length).toBeLessThanOrEqual(3);
    expect(writes().reduce((n, w) => n + w.ids.length, 0)).toBe(22);
  });

  it('24b. the counter invariant holds: scanned = readmitted + kept_parked + deferred + write_failed', async () => {
    const heroRow = row({ media_key: 'MK-hero', order: 0 });
    const keeps = Array.from({ length: 6 }, (_, i) => legacyParked({ order: i + 10 }));
    const heroListing = { ...THIRD_PARTY, listing_id: 'RLS20099238' };
    const readmit = legacyParked({ listing_id: 'RLS20099238', listing: heroListing, preferred_photo_yn: true });
    installPool([heroRow, ...keeps, readmit]);

    const r = await reevaluateR2PolicyExclusions({ now });

    expect(r.scanned).toBe(r.readmitted + r.kept_parked + r.deferred + r.write_failed);
    expect(r.selector_failed).toBe(false);
  });

  it('25. no rows due ⇒ no writes at all', async () => {
    installPool([row(), parked({ r2_policy_excluded_at: FRESH })]);
    const res = await reevaluateR2PolicyExclusions({ now });
    expect(res).toEqual({ scanned: 0, readmitted: 0, kept_parked: 0, deferred: 0, write_failed: 0, selector_failed: false });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('26. re-admission never writes to R2 and never fabricates an attempt', async () => {
    const hero = legacyParked({ preferred_photo_yn: true });
    installPool([hero]);
    await reevaluateR2PolicyExclusions({ now });
    for (const w of writes()) {
      expect(w.data).not.toHaveProperty('r2_key');
      expect(w.data).not.toHaveProperty('media_url_cached');
      expect(w.data).not.toHaveProperty('r2_last_attempt_at');
    }
  });

  // Superseded by 35 / 36, which pin the no-write decision and the separate
  // counter. Kept as the original regression anchor for the sweep advancing.
  it('27. a hero lookup failure defers the row instead of stranding the sweep', async () => {
    const stuck = legacyParked({ listing_id: 'RLS-BROKEN', listing: { ...THIRD_PARTY, listing_id: 'RLS-BROKEN' } });
    installPool([stuck]);
    const passthrough = mockFindMany.getMockImplementation()!;
    mockFindMany.mockImplementation(async (args) => {
      const a = args as { where: Record<string, unknown> };
      if (a.where?.listing_id === 'RLS-BROKEN' && !('status' in a.where)) throw new Error('db blip');
      return passthrough(args);
    });

    const res = await reevaluateR2PolicyExclusions({ now });

    // Every scanned row is written exactly once, so the sweep always advances
    // and one failing listing can never starve the rest.
    expect(res.deferred).toBe(1);
    expect(res.readmitted).toBe(0);
    // The sweep advances by NOT stranding on the failing listing; the row is
    // left untouched (see 35) and retried next firing.
    expect(writtenFor(stuck.id as bigint)).toBeUndefined();
  });

  it('28. one hero read per listing, not per row', async () => {
    const heroRow = row({ media_key: 'MK-hero', order: 0 });
    installPool([heroRow, ...Array.from({ length: 10 }, (_, i) => legacyParked({ order: i + 10 }))]);
    await reevaluateR2PolicyExclusions({ now });
    const heroReads = mockFindMany.mock.calls.filter(
      ([a]) => typeof (a as { where: Record<string, unknown> }).where?.listing_id === 'string',
    );
    expect(heroReads).toHaveLength(1);
  });

  it('29. a selector failure is contained — the pass reports zero, never throws', async () => {
    mockFindMany.mockRejectedValue(new Error('db down'));
    await expect(reevaluateR2PolicyExclusions({ now })).resolves.toEqual({
      scanned: 0, readmitted: 0, kept_parked: 0, deferred: 0, write_failed: 0,
      selector_failed: true,
    });
  });

  it('34. "nothing due" and "the query failed" are DISTINCT outcomes', async () => {
    // Both used to return an identical all-zero result, so a sweep that had
    // stopped running entirely was indistinguishable from a converged one —
    // and converged is the expected steady state, so the failure would never
    // be noticed.
    installPool([row(), parked({ r2_policy_excluded_at: FRESH })]);
    const quiet = await reevaluateR2PolicyExclusions({ now });
    expect(quiet).toEqual({
      scanned: 0, readmitted: 0, kept_parked: 0, deferred: 0, write_failed: 0,
      selector_failed: false,
    });

    mockFindMany.mockRejectedValue(new Error('statement timeout'));
    const broken = await reevaluateR2PolicyExclusions({ now });
    expect(broken.selector_failed).toBe(true);
    expect(broken).not.toEqual(quiet);
  });

  it('35. a deferred row is NOT written — no fabricated park timestamp', async () => {
    // A hero read only fails on a transient DB fault, and that fault carries no
    // information about the row's policy state. Re-stamping it would invent a
    // park time the system never decided and silently cost the row a full
    // re-evaluation interval. It is left untouched and retried next firing;
    // the batch cap bounds the cost of doing so.
    const stuck = legacyParked({ listing_id: 'RLS-BROKEN', listing: { ...THIRD_PARTY, listing_id: 'RLS-BROKEN' } });
    installPool([stuck]);
    const passthrough = mockFindMany.getMockImplementation()!;
    mockFindMany.mockImplementation(async (args) => {
      const a = args as { where: Record<string, unknown> };
      if (a.where?.listing_id === 'RLS-BROKEN' && !('status' in a.where)) throw new Error('db blip');
      return passthrough(args);
    });

    const res = await reevaluateR2PolicyExclusions({ now });

    expect(res.deferred).toBe(1);
    expect(res.kept_parked).toBe(0);
    expect(res.write_failed).toBe(0); // not a failure — a deliberate no-write
    expect(mockUpdateMany).not.toHaveBeenCalled();
    // Still due, so the next firing retries it rather than waiting an interval.
    expect(selectable(stuck)).toBe(true);
  });

  it('36. deferred is reported SEPARATELY from kept_parked', async () => {
    const okListing = { ...THIRD_PARTY, listing_id: 'RLS20099238' };
    const heroOk = row({ listing_id: 'RLS20099238', listing: okListing, media_key: 'MK-hero', order: 0 });
    const keptOk = legacyParked({ listing_id: 'RLS20099238', listing: okListing, order: 7 });
    const stuck = legacyParked({ listing_id: 'RLS-BROKEN', listing: { ...THIRD_PARTY, listing_id: 'RLS-BROKEN' } });
    installPool([heroOk, keptOk, stuck]);
    const passthrough = mockFindMany.getMockImplementation()!;
    mockFindMany.mockImplementation(async (args) => {
      const a = args as { where: Record<string, unknown> };
      if (a.where?.listing_id === 'RLS-BROKEN' && !('status' in a.where)) throw new Error('db blip');
      return passthrough(args);
    });

    const res = await reevaluateR2PolicyExclusions({ now });

    expect(res.scanned).toBe(2);
    expect(res.kept_parked).toBe(1);
    expect(res.deferred).toBe(1);
  });

  it('37. writes are STATE-SAFE — each statement re-asserts the state it selected on', async () => {
    // Selection and persistence are separate statements, and another
    // invocation can mirror or re-admit a row in between. Writing by id alone
    // would let this pass re-park a row someone else just re-admitted, or clear
    // a sentinel that is no longer there.
    const heroListing = { ...THIRD_PARTY, listing_id: 'RLS20099238' };
    const legacyHero = legacyParked({ listing_id: 'RLS20099238', listing: heroListing, preferred_photo_yn: true });
    const modernListing = { ...THIRD_PARTY, listing_id: 'RLS20105507' };
    const modernHero = parked({ listing_id: 'RLS20105507', listing: modernListing, preferred_photo_yn: true, r2_attempts: 2 });
    const heroRow = row({ media_key: 'MK-hero', order: 0 });
    const kept = legacyParked({ order: 11 });
    installPool([heroRow, kept, legacyHero, modernHero]);

    await reevaluateR2PolicyExclusions({ now });

    expect(mockUpdateMany.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const call of mockUpdateMany.mock.calls) {
      const a = call[0] as { where: Record<string, unknown>; data: Record<string, unknown> };
      // Every statement is id-scoped AND carries at least one state predicate.
      expect(Object.keys(a.where)).toContain('id');
      const guardKeys = Object.keys(a.where).filter((k) => k !== 'id');
      expect(guardKeys.length).toBeGreaterThan(0);

      if (a.data.r2_policy_excluded_at === null && 'r2_attempts' in a.data) {
        // Legacy re-admission — only if the sentinel is still exactly 9.
        expect(a.where.r2_attempts).toBe(R2_POLICY_PARKED_ATTEMPTS);
      } else if (a.data.r2_policy_excluded_at === null) {
        // Explicit-column re-admission — only if the column is still set.
        expect(a.where.r2_policy_excluded_at).toEqual({ not: null });
      } else {
        // Re-stamp — only a row still parked under EITHER encoding.
        const or = a.where.OR as Array<Record<string, unknown>>;
        expect(or).toEqual([
          { r2_policy_excluded_at: { not: null } },
          { r2_attempts: R2_POLICY_PARKED_ATTEMPTS },
        ]);
      }
    }
  });

  it('38. a row re-admitted concurrently is not re-parked, and the miss is reported', async () => {
    const heroRow = row({ media_key: 'MK-hero', order: 0 });
    const kept = legacyParked({ order: 11 });
    installPool([heroRow, kept]);
    // The conditional write matches nothing: another invocation cleared the
    // park between select and write.
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const res = await reevaluateR2PolicyExclusions({ now });

    expect(res.scanned).toBe(1);
    expect(res.kept_parked).toBe(0);
    expect(res.write_failed).toBe(1);
  });

  it('31. counters report PERSISTED state — a rejected write is reported as failed, not done', async () => {
    // Codex P2. The counters previously came from the decision loop, so a
    // rejected updateMany left the run reporting rows as re-admitted or
    // re-stamped that were never written — and `runMediaSync` still returned
    // "ok". A silently-wrong counter on THIS pass is especially bad because it
    // is the only observable for the re-admission sweep in Production.
    const heroRow = row({ media_key: 'MK-hero', order: 0 });
    const keeps = Array.from({ length: 4 }, (_, i) => legacyParked({ order: i + 10 }));
    installPool([heroRow, ...keeps]);
    mockUpdateMany.mockRejectedValue(new Error('write rejected'));

    const res = await reevaluateR2PolicyExclusions({ now });

    expect(res.scanned).toBe(4);
    expect(res.kept_parked).toBe(0);
    expect(res.readmitted).toBe(0);
    expect(res.write_failed).toBe(4);
  });

  it('32. a PARTIAL write failure is attributed correctly, not rounded up', async () => {
    // The re-admit statement succeeds and the re-stamp statement fails: the
    // run must report one re-admitted, zero kept-parked, one failed.
    const listingB = { ...THIRD_PARTY, listing_id: 'RLS20099238' };
    const hero = legacyParked({ listing_id: 'RLS20099238', listing: listingB, preferred_photo_yn: true });
    const heroRow = row({ media_key: 'MK-hero', order: 0 });
    const keep = legacyParked({ order: 11 });
    installPool([heroRow, keep, hero]);
    mockUpdateMany.mockImplementation(async (args) => {
      const a = args as { data: Record<string, unknown>; where: { id: { in: unknown[] } } };
      if (a.data.r2_policy_excluded_at instanceof Date) throw new Error('re-stamp rejected');
      return { count: a.where.id.in.length };
    });

    const res = await reevaluateR2PolicyExclusions({ now });

    expect(res.scanned).toBe(2);
    expect(res.readmitted).toBe(1);
    expect(res.kept_parked).toBe(0);
    expect(res.write_failed).toBe(1);
  });

  it('33. a short updateMany count (rows vanished) is reported honestly', async () => {
    const heroRow = row({ media_key: 'MK-hero', order: 0 });
    installPool([heroRow, ...Array.from({ length: 3 }, (_, i) => legacyParked({ order: i + 10 }))]);
    mockUpdateMany.mockImplementation(async () => ({ count: 1 })); // 2 rows disappeared

    const res = await reevaluateR2PolicyExclusions({ now });

    expect(res.scanned).toBe(3);
    expect(res.kept_parked).toBe(1);
    expect(res.write_failed).toBe(2);
  });

  it('30. the CRM hero-authority rule is respected on re-admission', async () => {
    // A `crm:` set-main outranks a feed PreferredPhotoYN, so a feed photo that
    // looks preferred must NOT be re-admitted when a CRM choice exists.
    const crmHero = row({ media_key: 'crm:abc', preferred_photo_yn: true, order: 99 });
    const feedPreferred = legacyParked({ media_key: 'MK-feed', preferred_photo_yn: true, order: 0 });
    installPool([crmHero, feedPreferred]);

    const res = await reevaluateR2PolicyExclusions({ now });

    expect(res.readmitted).toBe(0);
    expect(res.kept_parked).toBe(1);
  });
});

export {};
