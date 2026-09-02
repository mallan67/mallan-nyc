/// <reference types="jest" />
/**
 * lib/neon/branches.ts — PRODUCTION-SAFETY GUARD contract.
 *
 * ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────
 * `app/api/cron/neon-branch-prune` runs DAILY (vercel.json `0 4 * * *`) with
 * Neon DELETE rights, and `isCanonicalNeonProject` correctly restricts it to
 * `hidden-mountain-87248164` — the project that HOLDS PRODUCTION. Preview
 * branches and production `main` live in that SAME project, so the cron
 * iterates production every night.
 *
 * Before 2026-08-20, `isPrunable()` decided deletion from ONLY
 * `branch.primary`, `branch.protected` and age. Executed against the real
 * module (not read), the pre-fix behaviour was:
 *
 *   refused      :: live production main (primary=true)          :: "primary branch (production)"
 *   WOULD DELETE :: production main with `primary` field ABSENT  :: "idle for 100.0h"
 *   WOULD DELETE :: branch NAMED main, primary=false             :: "idle for 100.0h"
 *   WOULD DELETE :: non-primary non-preview branch (vercel-dev)  :: "idle for 100.0h"
 *   WOULD DELETE :: production branch id renamed to preview/x    :: "idle for 100.0h"
 *
 * `NeonBranch.primary` is a COMPILE-TIME-ONLY boolean; an absent field is
 * falsy at runtime, so production became prunable. `protected` excluded
 * nothing — live control plane (read-only, 2026-08-20) reports production
 * `main` = br-crimson-frog-adr7g9gt with primary=true, default=true,
 * **protected=FALSE**. Production survived on ONE provider-supplied boolean.
 *
 * NOTE: the two pre-existing prune tests (`neon-branch-prune-route.test.ts`,
 * `neon-prune-cli.test.ts`) BOTH `jest.mock('@/lib/neon/branches')`, so the
 * decision function itself had zero executed coverage. This file imports the
 * REAL module and mocks nothing but `global.fetch`.
 *
 * ─── MUTATION-TESTED ─────────────────────────────────────────────────────
 * Each new predicate has a fixture that ONLY that predicate can refuse
 * (§B). Deleting the predicate from lib/neon/branches.ts turns its §B test
 * RED. A guard that cannot fail on the defect it exists to prevent is
 * worthless, so the isolation in §B is load-bearing: do not "simplify" a §B
 * fixture by giving it a second disqualifying property.
 */

import {
  isPrunable,
  isProductionBranchId,
  assertDeletable,
  productionSafetyRefusal,
  deleteBranch,
  pruneBranches,
  PRODUCTION_NEON_BRANCH_IDS,
  PROTECTED_NEON_BRANCH_NAMES,
  DELETABLE_BRANCH_NAME_PREFIX,
  type NeonBranch,
} from '@/lib/neon/branches';

// Fixed clock so every age is deterministic.
const NOW = new Date('2026-08-20T12:00:00.000Z');
const STALE = new Date(NOW.getTime() - 100 * 3600 * 1000).toISOString(); // 100h idle
const FRESH = new Date(NOW.getTime() - 1 * 3600 * 1000).toISOString(); //   1h idle
const RETENTION = 24;

/** Live production identity — Neon control plane, read-only, 2026-08-20. */
const PROD_ID = 'br-crimson-frog-adr7g9gt';

/** Build a branch record; `undefined` values are DELETED, not set. */
function branch(over: Record<string, unknown>): NeonBranch {
  const base: Record<string, unknown> = {
    id: 'br-preview-generic-000',
    name: 'preview/some-feature',
    primary: false,
    protected: false,
    default: false,
    created_at: STALE,
    updated_at: STALE,
  };
  const out = { ...base, ...over };
  for (const k of Object.keys(over)) {
    if (over[k] === undefined) delete out[k];
  }
  return out as unknown as NeonBranch;
}

describe('§A — the recorded RED: every pre-fix "WOULD DELETE" is now refused', () => {
  it('A1: live production main (primary=true) — refused (unchanged behaviour)', () => {
    const d = isPrunable(
      branch({ id: PROD_ID, name: 'main', primary: true, default: true, protected: false }),
      RETENTION,
      NOW,
    );
    expect(d.prunable).toBe(false);
    // The original reason string is preserved — nothing was subtracted.
    expect(d.reason).toBe('primary branch (production)');
    expect(d.code).toBe('primary');
  });

  it('A2: production main with the `primary` field ABSENT — was WOULD DELETE, now refused', () => {
    const b = branch({ id: PROD_ID, name: 'main', primary: undefined, default: true });
    expect('primary' in (b as unknown as Record<string, unknown>)).toBe(false); // the real defect shape
    const d = isPrunable(b, RETENTION, NOW);
    expect(d.prunable).toBe(false);
    expect(d.code).toBe('identity_unverifiable');
  });

  it('A3: branch NAMED main, primary=false — was WOULD DELETE, now refused', () => {
    const d = isPrunable(
      branch({ id: 'br-not-production-999', name: 'main', primary: false }),
      RETENTION,
      NOW,
    );
    expect(d.prunable).toBe(false);
    expect(d.code).toBe('protected_branch_name');
  });

  it('A4: non-primary non-preview branch (vercel-dev) — was WOULD DELETE, now refused', () => {
    const d = isPrunable(branch({ id: 'br-vercel-dev-111', name: 'vercel-dev' }), RETENTION, NOW);
    expect(d.prunable).toBe(false);
    expect(d.code).toBe('not_preview_prefixed');
  });

  it('A5: production branch ID renamed to preview/x with `primary` absent — was WOULD DELETE, now refused', () => {
    const d = isPrunable(
      branch({ id: PROD_ID, name: 'preview/x', primary: undefined }),
      RETENTION,
      NOW,
    );
    expect(d.prunable).toBe(false);
    // Identity check fires first; the id guard is proven in isolation in §B.
    expect(d.code).toBe('identity_unverifiable');
  });

  it('A6: NO input at all produces a delete decision for the production branch id', () => {
    const shapes: Record<string, unknown>[] = [
      { id: PROD_ID, name: 'main', primary: true, default: true },
      { id: PROD_ID, name: 'main', primary: false, default: false },
      { id: PROD_ID, name: 'preview/renamed', primary: false, default: false },
      { id: PROD_ID, name: 'main', primary: undefined },
      { id: PROD_ID.toUpperCase(), name: 'preview/renamed', primary: false },
      { id: `  ${PROD_ID}  `, name: 'preview/renamed', primary: false },
    ];
    for (const s of shapes) {
      const d = isPrunable(branch(s), RETENTION, NOW);
      expect({ shape: JSON.stringify(s), prunable: d.prunable }).toEqual({
        shape: JSON.stringify(s),
        prunable: false,
      });
    }
  });
});

describe('§B — per-predicate isolation (the mutation targets)', () => {
  // Each fixture below is refused by EXACTLY ONE new predicate. Remove that
  // predicate from lib/neon/branches.ts and the corresponding test goes RED.

  it('B1 [production_branch_id]: production id, but primary=false, protected=false, default=false, preview/-prefixed', () => {
    const b = branch({
      id: PROD_ID,
      name: 'preview/renamed-by-someone',
      primary: false,
      protected: false,
      default: false,
    });
    // Prove the isolation: no OTHER guard could catch this fixture.
    expect(b.primary).toBe(false);
    expect(b.protected).toBe(false);
    expect((b as unknown as Record<string, unknown>).default).toBe(false);
    expect(b.name.startsWith(DELETABLE_BRANCH_NAME_PREFIX)).toBe(true);
    expect(PROTECTED_NEON_BRANCH_NAMES).not.toContain(b.name);

    const d = isPrunable(b, RETENTION, NOW);
    expect(d.prunable).toBe(false);
    expect(d.code).toBe('production_branch_id');
  });

  it('B2 [protected_branch_name]: name `preview/main`, non-production id, all flags false', () => {
    const b = branch({ id: 'br-innocent-looking-777', name: 'preview/main', primary: false });
    // Isolation: preview/-prefixed, not the production id, no flag set.
    expect(b.name.startsWith(DELETABLE_BRANCH_NAME_PREFIX)).toBe(true);
    expect(PRODUCTION_NEON_BRANCH_IDS).not.toContain(b.id);
    expect(b.primary).toBe(false);
    expect(b.protected).toBe(false);

    const d = isPrunable(b, RETENTION, NOW);
    expect(d.prunable).toBe(false);
    expect(d.code).toBe('protected_branch_name');
  });

  it('B2b [protected_branch_name]: bare `main` is refused by name even with a harmless id', () => {
    const d = isPrunable(branch({ id: 'br-harmless-123', name: 'main' }), RETENTION, NOW);
    expect(d.prunable).toBe(false);
    expect(d.code).toBe('protected_branch_name');
  });

  it('B3 [not_preview_prefixed]: `vercel-dev`, non-production id, no protected name, all flags false', () => {
    const b = branch({ id: 'br-vercel-dev-111', name: 'vercel-dev' });
    // Isolation: not the production id, not a protected name, no flag set.
    expect(PRODUCTION_NEON_BRANCH_IDS).not.toContain(b.id);
    expect(PROTECTED_NEON_BRANCH_NAMES).not.toContain(b.name);
    expect(b.primary).toBe(false);
    expect(b.protected).toBe(false);

    const d = isPrunable(b, RETENTION, NOW);
    expect(d.prunable).toBe(false);
    expect(d.code).toBe('not_preview_prefixed');
  });

  it('B3b [not_preview_prefixed]: a bare `preview/` with nothing after it is ambiguous → refused', () => {
    const d = isPrunable(branch({ id: 'br-amb-1', name: 'preview/' }), RETENTION, NOW);
    expect(d.prunable).toBe(false);
    expect(d.code).toBe('not_preview_prefixed');
  });

  it('B3c [not_preview_prefixed]: a name that merely CONTAINS preview/ is refused (prefix, not substring)', () => {
    const d = isPrunable(branch({ id: 'br-sneaky-1', name: 'main-preview/x' }), RETENTION, NOW);
    expect(d.prunable).toBe(false);
    expect(d.code).toBe('not_preview_prefixed');
  });

  it('B4 [identity_unverifiable]: `primary` ABSENT — an absent flag must never mean "safe to delete"', () => {
    const b = branch({ id: 'br-ordinary-1', name: 'preview/pr-42', primary: undefined });
    // Isolation: everything else about this branch is deletable.
    expect(PRODUCTION_NEON_BRANCH_IDS).not.toContain(b.id);
    expect(PROTECTED_NEON_BRANCH_NAMES).not.toContain(b.name);
    expect(b.name.startsWith(DELETABLE_BRANCH_NAME_PREFIX)).toBe(true);
    expect(b.protected).toBe(false);

    const d = isPrunable(b, RETENTION, NOW);
    expect(d.prunable).toBe(false);
    expect(d.code).toBe('identity_unverifiable');
    expect(d.reason).toMatch(/primary/);
  });

  it('B4b [identity_unverifiable]: `primary` present but not a boolean (e.g. "false" / null / 0)', () => {
    for (const bad of ['false', 'true', null, 0, 1, {}]) {
      const d = isPrunable(
        branch({ id: 'br-ordinary-1', name: 'preview/pr-42', primary: bad }),
        RETENTION,
        NOW,
      );
      expect({ bad: JSON.stringify(bad), prunable: d.prunable, code: d.code }).toEqual({
        bad: JSON.stringify(bad),
        prunable: false,
        code: 'identity_unverifiable',
      });
    }
  });

  it('B5 [identity_unverifiable]: `protected` ABSENT — refused', () => {
    const d = isPrunable(
      branch({ id: 'br-ordinary-1', name: 'preview/pr-42', protected: undefined }),
      RETENTION,
      NOW,
    );
    expect(d.prunable).toBe(false);
    expect(d.code).toBe('identity_unverifiable');
    expect(d.reason).toMatch(/protected/);
  });

  it('B6 [identity_unverifiable]: missing / blank / non-string id and name', () => {
    const cases: Record<string, unknown>[] = [
      { id: undefined },
      { id: '' },
      { id: '   ' },
      { id: 123 },
      { name: undefined },
      { name: '' },
      { name: '   ' },
      { name: 123 },
    ];
    for (const c of cases) {
      const d = isPrunable(branch(c), RETENTION, NOW);
      expect({ c: JSON.stringify(c), prunable: d.prunable, code: d.code }).toEqual({
        c: JSON.stringify(c),
        prunable: false,
        code: 'identity_unverifiable',
      });
    }
  });

  it('B7 [identity_unverifiable]: null / undefined / non-object branch record', () => {
    for (const bad of [null, undefined, 'main', 42]) {
      const d = isPrunable(bad as unknown as NeonBranch, RETENTION, NOW);
      expect({ bad: String(bad), prunable: d.prunable, code: d.code }).toEqual({
        bad: String(bad),
        prunable: false,
        code: 'identity_unverifiable',
      });
    }
  });

  it('B8 [identity_unverifiable]: unparseable / missing updated_at is NOT treated as infinitely idle', () => {
    for (const bad of [undefined, '', 'not-a-date', null, {}]) {
      const d = isPrunable(
        branch({ id: 'br-ordinary-1', name: 'preview/pr-42', updated_at: bad }),
        RETENTION,
        NOW,
      );
      expect({ bad: JSON.stringify(bad), prunable: d.prunable }).toEqual({
        bad: JSON.stringify(bad),
        prunable: false,
      });
      expect(d.code).toBe('identity_unverifiable');
    }
  });

  it('B9 [default_branch]: Neon `default: true` is refused even with primary=false', () => {
    const b = branch({ id: 'br-ordinary-1', name: 'preview/pr-42', primary: false, default: true });
    // Isolation: nothing else about this branch is disqualifying.
    expect(PRODUCTION_NEON_BRANCH_IDS).not.toContain(b.id);
    expect(PROTECTED_NEON_BRANCH_NAMES).not.toContain(b.name);
    expect(b.name.startsWith(DELETABLE_BRANCH_NAME_PREFIX)).toBe(true);
    expect(b.primary).toBe(false);
    expect(b.protected).toBe(false);

    const d = isPrunable(b, RETENTION, NOW);
    expect(d.prunable).toBe(false);
    expect(d.code).toBe('default_branch');
  });

  it('B10 [invalid_retention]: NaN / 0 / negative / Infinity retention cannot make everything look idle', () => {
    for (const bad of [NaN, 0, -1, Infinity, -Infinity]) {
      const d = isPrunable(branch({ id: 'br-ordinary-1', name: 'preview/pr-42' }), bad, NOW);
      expect({ bad: String(bad), prunable: d.prunable, code: d.code }).toEqual({
        bad: String(bad),
        prunable: false,
        code: 'invalid_retention',
      });
    }
  });

  it('B11 [identity_unverifiable]: an invalid `now` cannot produce a delete decision', () => {
    const d = isPrunable(
      branch({ id: 'br-ordinary-1', name: 'preview/pr-42' }),
      RETENTION,
      new Date('nonsense'),
    );
    expect(d.prunable).toBe(false);
    expect(d.code).toBe('identity_unverifiable');
  });
});

describe('§C — negative tests: the guard is NOT vacuous, hygiene still works', () => {
  it('C1: a genuine idle preview branch IS still prunable', () => {
    const d = isPrunable(
      branch({ id: 'br-spring-mouse-adfywa55', name: 'preview/fix/some-pr', updated_at: STALE }),
      RETENTION,
      NOW,
    );
    expect(d.prunable).toBe(true);
    expect(d.code).toBe('prunable');
    expect(d.reason).toBe('idle for 100.0h');
  });

  it('C2: the real live preview branch name shape is prunable when idle', () => {
    const d = isPrunable(
      branch({
        id: 'br-spring-mouse-adfywa55',
        name: 'preview/fix/neon-p0-event-driven-wake-2026-08-16',
      }),
      RETENTION,
      NOW,
    );
    expect(d.prunable).toBe(true);
  });

  it('C3: existing protections are PRESERVED — primary, protected, retention window', () => {
    expect(isPrunable(branch({ primary: true }), RETENTION, NOW)).toMatchObject({
      prunable: false,
      reason: 'primary branch (production)',
    });
    expect(isPrunable(branch({ protected: true }), RETENTION, NOW)).toMatchObject({
      prunable: false,
      reason: 'operator-protected',
    });
    const fresh = isPrunable(branch({ updated_at: FRESH }), RETENTION, NOW);
    expect(fresh.prunable).toBe(false);
    expect(fresh.code).toBe('within_retention');
    expect(fresh.reason).toBe('inside retention window (1.0h < 24h)');
  });

  it('C4: exactly at the retention boundary the branch is prunable (behaviour unchanged)', () => {
    const exactly24h = new Date(NOW.getTime() - 24 * 3600 * 1000).toISOString();
    expect(isPrunable(branch({ updated_at: exactly24h }), RETENTION, NOW).prunable).toBe(true);
  });
});

describe('§D — isProductionBranchId is fail-closed on unverifiable input', () => {
  it('D1: the live production id is recognised, case- and whitespace-insensitively', () => {
    expect(isProductionBranchId(PROD_ID)).toBe(true);
    expect(isProductionBranchId(PROD_ID.toUpperCase())).toBe(true);
    expect(isProductionBranchId(`  ${PROD_ID}\n`)).toBe(true);
  });

  it('D2: an unverifiable id is treated AS production (never as safe)', () => {
    for (const bad of [undefined, null, '', '   ', 42, {}]) {
      expect({ bad: String(bad), prod: isProductionBranchId(bad) }).toEqual({
        bad: String(bad),
        prod: true,
      });
    }
  });

  it('D3: an ordinary preview id is not production', () => {
    expect(isProductionBranchId('br-spring-mouse-adfywa55')).toBe(false);
  });
});

describe('§E — deleteBranch: independent last-line guard, no network on refusal', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  it('E1: refuses the production branch id and issues NO HTTP request', async () => {
    await expect(deleteBranch('key', 'hidden-mountain-87248164', PROD_ID)).rejects.toThrow(
      /Refusing to DELETE Neon branch/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('E2: refuses an unverifiable branch id and issues NO HTTP request', async () => {
    for (const bad of ['', '   ', undefined as unknown as string]) {
      await expect(deleteBranch('key', 'hidden-mountain-87248164', bad)).rejects.toThrow(
        /Refusing to DELETE Neon branch/,
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('E3: a legitimate preview id DOES reach the Neon API (guard is not vacuous)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });
    await expect(
      deleteBranch('key', 'hidden-mountain-87248164', 'br-spring-mouse-adfywa55'),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string }];
    expect(url).toContain('/branches/br-spring-mouse-adfywa55');
    expect(init.method).toBe('DELETE');
  });
});

describe('§F — assertDeletable throws for anything isPrunable refuses', () => {
  it('F1: throws on production main, on a renamed production id, and on an absent primary flag', () => {
    expect(() =>
      assertDeletable(branch({ id: PROD_ID, name: 'main', primary: true }), RETENTION, NOW),
    ).toThrow(/Refusing to delete Neon branch/);
    expect(() =>
      assertDeletable(branch({ id: PROD_ID, name: 'preview/x', primary: false }), RETENTION, NOW),
    ).toThrow(/production_branch_id/);
    expect(() =>
      assertDeletable(branch({ name: 'preview/x', primary: undefined }), RETENTION, NOW),
    ).toThrow(/identity_unverifiable/);
  });

  it('F2: does not throw for a genuine idle preview branch', () => {
    expect(() => assertDeletable(branch({ name: 'preview/pr-1' }), RETENTION, NOW)).not.toThrow();
  });
});

describe('§G — pruneBranches integration: production is never DELETEd end-to-end', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  /** Mock the Neon list call, then answer every DELETE with 200. */
  function mockNeon(branches: unknown[]) {
    fetchMock.mockImplementation(async (_url: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE') return { ok: true, status: 200, statusText: 'OK' };
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ branches }) };
    });
  }

  function deletedIds(): string[] {
    return (fetchMock.mock.calls as [string, { method?: string }?][])
      .filter(([, init]) => init?.method === 'DELETE')
      .map(([url]) => url.split('/branches/')[1]);
  }

  it('G1: the live project shape — production main is kept, the idle preview is deleted', async () => {
    mockNeon([
      { id: PROD_ID, name: 'main', primary: true, default: true, protected: false, created_at: STALE, updated_at: STALE },
      { id: 'br-spring-mouse-adfywa55', name: 'preview/fix/old-pr', primary: false, default: false, protected: false, created_at: STALE, updated_at: STALE },
    ]);
    const r = await pruneBranches({
      apiKey: 'k',
      projectId: 'hidden-mountain-87248164',
      retentionHours: RETENTION,
      execute: true,
      now: NOW,
    });
    expect(deletedIds()).toEqual(['br-spring-mouse-adfywa55']);
    expect(deletedIds()).not.toContain(PROD_ID);
    expect(r.pruned.map((b) => b.id)).toEqual(['br-spring-mouse-adfywa55']);
    expect(r.primary_count).toBe(1);
    expect(r.errors).toEqual([]);
  });

  it('G2: production main with `primary` ABSENT in the API response is NOT deleted', async () => {
    mockNeon([
      // No `primary` key at all — the exact runtime shape that made production prunable.
      { id: PROD_ID, name: 'main', protected: false, created_at: STALE, updated_at: STALE },
      { id: 'br-preview-ok', name: 'preview/pr-9', primary: false, default: false, protected: false, created_at: STALE, updated_at: STALE },
    ]);
    const r = await pruneBranches({
      apiKey: 'k',
      projectId: 'hidden-mountain-87248164',
      retentionHours: RETENTION,
      execute: true,
      now: NOW,
    });
    expect(deletedIds()).toEqual(['br-preview-ok']);
    expect(deletedIds()).not.toContain(PROD_ID);
    expect(r.guard_refused_count).toBe(1);
    expect(r.guard_refused[0]).toMatchObject({ id: PROD_ID, code: 'identity_unverifiable' });
  });

  it('G3: a DRY RUN never reports production in "would delete", and issues no DELETE', async () => {
    mockNeon([
      { id: PROD_ID, name: 'main', protected: false, created_at: STALE, updated_at: STALE },
      { id: 'br-other', name: 'vercel-dev', primary: false, default: false, protected: false, created_at: STALE, updated_at: STALE },
      { id: 'br-preview-ok', name: 'preview/pr-9', primary: false, default: false, protected: false, created_at: STALE, updated_at: STALE },
    ]);
    const r = await pruneBranches({
      apiKey: 'k',
      projectId: 'hidden-mountain-87248164',
      retentionHours: RETENTION,
      execute: false,
      now: NOW,
    });
    expect(deletedIds()).toEqual([]);
    expect(r.pruned.map((b) => b.name)).toEqual(['preview/pr-9']);
    expect(r.guard_refused_count).toBe(2);
  });

  it('G4: guard refusals are counted as guard_refused, NOT silently as within_retention', async () => {
    mockNeon([
      { id: 'br-a', name: 'vercel-dev', primary: false, default: false, protected: false, created_at: STALE, updated_at: STALE },
      { id: 'br-b', name: 'preview/fresh', primary: false, default: false, protected: false, created_at: FRESH, updated_at: FRESH },
      { id: 'br-c', name: 'preview/prot', primary: false, default: false, protected: true, created_at: STALE, updated_at: STALE },
      { id: PROD_ID, name: 'main', primary: true, default: true, protected: false, created_at: STALE, updated_at: STALE },
    ]);
    const r = await pruneBranches({
      apiKey: 'k',
      projectId: 'hidden-mountain-87248164',
      retentionHours: RETENTION,
      execute: true,
      now: NOW,
    });
    expect(r.examined).toBe(4);
    expect(r.primary_count).toBe(1);
    expect(r.protected_count).toBe(1);
    expect(r.too_recent_count).toBe(1);
    expect(r.guard_refused_count).toBe(1);
    expect(r.guard_refused[0]).toMatchObject({ name: 'vercel-dev', code: 'not_preview_prefixed' });
    // Every examined branch is accounted for in exactly one bucket.
    expect(
      r.primary_count + r.protected_count + r.too_recent_count + r.guard_refused_count + r.pruned.length + r.errors.length,
    ).toBe(r.examined);
    expect(deletedIds()).toEqual([]);
  });

  it('G5: a whole project of production-shaped branches results in ZERO DELETE calls', async () => {
    mockNeon([
      { id: PROD_ID, name: 'main', primary: true, default: true, protected: false, created_at: STALE, updated_at: STALE },
      { id: PROD_ID, name: 'main', protected: false, created_at: STALE, updated_at: STALE },
      { id: PROD_ID, name: 'preview/renamed', primary: false, default: false, protected: false, created_at: STALE, updated_at: STALE },
      { id: 'br-x1', name: 'main', primary: false, default: false, protected: false, created_at: STALE, updated_at: STALE },
      { id: 'br-x2', name: 'production', primary: false, default: false, protected: false, created_at: STALE, updated_at: STALE },
      { id: 'br-x3', name: 'preview/main', primary: false, default: false, protected: false, created_at: STALE, updated_at: STALE },
    ]);
    const r = await pruneBranches({
      apiKey: 'k',
      projectId: 'hidden-mountain-87248164',
      retentionHours: RETENTION,
      execute: true,
      now: NOW,
    });
    expect(deletedIds()).toEqual([]);
    expect(r.pruned).toEqual([]);
  });
});

describe('§H — layering: the delete path refuses on its own terms, not on isPrunable\u2019s verdict', () => {
  // `deleteBranch` only ever receives an ID, so it can only refuse by id.
  // Mutation evidence (isPrunable regressed to always-permissive) showed the
  // id guard saved the real production branch but branches merely NAMED
  // `main` / `production` / `preview/main` were still deleted. That is why
  // `assertDeletable` re-derives `productionSafetyRefusal` itself instead of
  // trusting the decision `isPrunable` returned.

  it('H1: productionSafetyRefusal refuses every protected shape and passes a genuine preview', () => {
    const refused: [string, Record<string, unknown>, string][] = [
      ['production id', { id: PROD_ID, name: 'preview/renamed' }, 'production_branch_id'],
      ['protected name', { id: 'br-z', name: 'preview/main' }, 'protected_branch_name'],
      ['non-preview name', { id: 'br-z', name: 'vercel-dev' }, 'not_preview_prefixed'],
      ['primary flag', { id: 'br-z', name: 'preview/x', primary: true }, 'primary'],
      ['protected flag', { id: 'br-z', name: 'preview/x', protected: true }, 'operator_protected'],
      ['default flag', { id: 'br-z', name: 'preview/x', default: true }, 'default_branch'],
      ['primary absent', { id: 'br-z', name: 'preview/x', primary: undefined }, 'identity_unverifiable'],
    ];
    for (const [label, shape, code] of refused) {
      const r = productionSafetyRefusal(branch(shape));
      expect({ label, code: r?.code ?? null }).toEqual({ label, code });
    }
    // Not vacuous: a genuine preview branch clears every identity guard.
    expect(productionSafetyRefusal(branch({ id: 'br-ok', name: 'preview/pr-7' }))).toBeNull();
  });

  it('H2: assertDeletable refuses a protected NAME — the refusal deleteBranch structurally cannot make', () => {
    for (const name of ['main', 'production', 'preview/main', 'vercel-dev']) {
      expect(() =>
        assertDeletable(branch({ id: 'br-not-prod-id', name, primary: false }), RETENTION, NOW),
      ).toThrow(/Refusing to delete Neon branch/);
    }
    // deleteBranch, given only those ids, would have allowed the request through.
    expect(isProductionBranchId('br-not-prod-id')).toBe(false);
  });

  it('H3: assertDeletable still permits a genuine idle preview branch', () => {
    expect(() =>
      assertDeletable(branch({ id: 'br-ok', name: 'preview/pr-7' }), RETENTION, NOW),
    ).not.toThrow();
  });
});
