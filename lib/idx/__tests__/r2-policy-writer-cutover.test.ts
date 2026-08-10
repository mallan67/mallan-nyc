/**
 * COMMIT 11 — WRITER CUTOVER off the `r2_attempts = 9` sentinel.
 *
 * Commit 9 made every READER correct while the durable column was still held;
 * it explicitly did NOT stop the writer, because there was nowhere durable to
 * write. `listing_media.r2_policy_excluded_at` now exists, so a NEW policy
 * exclusion records itself in its own column instead of overloading the failure
 * counter.
 *
 * THE PAIRED CHANGE THAT MAKES IT SAFE
 * ------------------------------------
 * The sentinel was doing double duty: it also removed the row from the backlog
 * SELECT (`r2_attempts < 8`). If the writer stops assigning 9 without the
 * selector learning the new column, every parked row re-surfaces on the next
 * firing, gets re-fetched, re-rejected and re-parked forever — a worse defect
 * than the overload. So the selector must exclude on the explicit column in the
 * SAME change.
 *
 * LEGACY EXACT-9 ROWS STAY EXCLUDED by the untouched retry-exhaustion clause.
 * No backfill, no sentinel conversion.
 */

import {
  buildR2BacklogWhere,
  R2_RETRY_EXHAUSTED_THRESHOLD,
  R2_POLICY_PARKED_ATTEMPTS,
} from '../media-sync';

const COOLDOWN = new Date('2026-08-08T00:00:00.000Z');

/** Pull the AND[] clauses so we can assert on them structurally. */
function andClauses(): Record<string, unknown>[] {
  const where = buildR2BacklogWhere(COOLDOWN, []) as Record<string, unknown>;
  return (where.AND ?? []) as Record<string, unknown>[];
}

describe('the backlog selector excludes rows on the EXPLICIT policy column', () => {
  it('requires r2_policy_excluded_at to be null', () => {
    // Without this, dropping the sentinel write would resurrect every parked
    // row into the backlog on the very next firing.
    const clauses = andClauses();
    const hasPolicyExclusion = clauses.some(
      (c) => (c as { r2_policy_excluded_at?: unknown }).r2_policy_excluded_at === null,
    );
    expect(hasPolicyExclusion).toBe(true);
  });

  it('STILL excludes legacy exact-9 rows via the untouched retry clause', () => {
    // Legacy compatibility: no backfill is performed, so rows parked at 9 by the
    // old writer must remain out of the backlog on their own.
    const clauses = andClauses();
    const retryClause = clauses.find((c) => Array.isArray((c as { OR?: unknown }).OR)
      && ((c as { OR: Record<string, unknown>[] }).OR).some((o) => 'r2_attempts' in o));
    expect(retryClause).toBeDefined();
    const or = (retryClause as { OR: Record<string, unknown>[] }).OR;
    expect(or).toEqual(
      expect.arrayContaining([
        { r2_attempts: null },
        { r2_attempts: { lt: R2_RETRY_EXHAUSTED_THRESHOLD } },
      ]),
    );
    // 9 is NOT < 8, so a legacy parked row cannot satisfy the clause.
    expect(R2_POLICY_PARKED_ATTEMPTS).toBeGreaterThanOrEqual(R2_RETRY_EXHAUSTED_THRESHOLD);
  });

  it('keeps the cooldown, active-status and policy-admission conditions intact', () => {
    const where = buildR2BacklogWhere(COOLDOWN, []) as Record<string, unknown>;
    expect(where.status).toBe('active');
    expect(where.media_key).toEqual({ not: null });
    const clauses = andClauses();
    const cooldown = clauses.find((c) => Array.isArray((c as { OR?: unknown }).OR)
      && ((c as { OR: Record<string, unknown>[] }).OR).some((o) => 'r2_last_attempt_at' in o));
    expect(cooldown).toBeDefined();
  });
});

describe('the parking writer no longer overloads the failure counter', () => {
  it('writes ONLY the explicit policy column — never r2_attempts, never a fake cooldown', () => {
    // The Phase-3 policy flush is an updateMany deep inside runMediaSync, so the
    // durable proof is the real-Postgres suite. This pins the SOURCE of that one
    // statement so a regression cannot silently reintroduce the overload.
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../media-sync.ts'),
      'utf8',
    ) as string;

    const flush = src.slice(
      src.indexOf('if (policyParkIds.length > 0)'),
      src.indexOf('// ── PHASE 4'),
    );
    expect(flush.length).toBeGreaterThan(0);

    // Strip comments so prose about the old behaviour cannot pass the assertion
    // (a comment sitting inside the block previously produced a false green).
    const code = flush
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).toContain('r2_policy_excluded_at');
    // The whole point: a policy decision must not touch the failure counter...
    expect(code).not.toContain('R2_POLICY_PARKED_ATTEMPTS');
    expect(code).not.toMatch(/r2_attempts\s*:/);
    // ...nor stamp a cooldown for an attempt that was never made.
    expect(code).not.toMatch(/r2_last_attempt_at\s*:/);
  });
});
