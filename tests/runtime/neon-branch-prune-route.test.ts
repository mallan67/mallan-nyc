/// <reference types="jest" />
/**
 * neon-branch-prune cron route — observability contract tests.
 *
 * Added 2026-05-10 alongside the route's audit-event + 503-on-missing-env
 * patch. The prior silent-skip behavior (return 200 + no audit event)
 * was invisible to every observation surface, which let a missing
 * NEON_API_KEY / NEON_PROJECT_ID Vercel Production env-var
 * misconfiguration persist undetected for 2+ weeks until preview
 * branches accumulated past the integration's branch cap.
 *
 * Cases proven here:
 *   1. Missing NEON_API_KEY  → 503 + audit-event status=skipped, missing=[NEON_API_KEY]
 *   2. Missing NEON_PROJECT_ID → 503 + audit-event status=skipped, missing=[NEON_PROJECT_ID]
 *   3. Missing both → 503 + audit-event lists both names
 *   4. Successful prune → 200 + audit-event status=ok with counts
 *   5. Partial prune (some delete errors) → 500 + audit-event status=partial
 *   6. Audit-event write failure does NOT mask response (skipped path)
 *   7. Audit-event write failure does NOT mask response (success path)
 *   8. Wrong CRON_SECRET → 401 + NO audit event written
 */

import { NextRequest } from 'next/server';

// ─── Hand-rolled prisma mock ────────────────────────────────────────────
const auditEventCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({ id: 1n }));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    auditEvent: { create: auditEventCreateMock },
  },
}));

// ─── pruneBranches mock ─────────────────────────────────────────────────
const pruneBranchesMock = jest.fn();
jest.mock('@/lib/neon/branches', () => ({
  __esModule: true,
  pruneBranches: pruneBranchesMock,
}));

// ─── Test helpers ───────────────────────────────────────────────────────
const ORIGINAL_ENV = {
  CRON_SECRET: process.env.CRON_SECRET,
  NEON_API_KEY: process.env.NEON_API_KEY,
  NEON_PROJECT_ID: process.env.NEON_PROJECT_ID,
};

function makeAuthedRequest(secretOverride?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secretOverride !== undefined) {
    headers['authorization'] = `Bearer ${secretOverride}`;
  } else if (process.env.CRON_SECRET) {
    headers['authorization'] = `Bearer ${process.env.CRON_SECRET}`;
  }
  return new Request('http://localhost/api/cron/neon-branch-prune', {
    method: 'GET',
    headers,
  }) as unknown as NextRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = 'test-cron-secret';
  // Default: both env vars present; individual tests override.
  process.env.NEON_API_KEY = 'fake-neon-key';
  process.env.NEON_PROJECT_ID = 'fake-project-id';
});

afterAll(() => {
  process.env.CRON_SECRET = ORIGINAL_ENV.CRON_SECRET;
  process.env.NEON_API_KEY = ORIGINAL_ENV.NEON_API_KEY;
  process.env.NEON_PROJECT_ID = ORIGINAL_ENV.NEON_PROJECT_ID;
});

describe('neon-branch-prune cron route — observability contract', () => {
  it('case 1: missing NEON_API_KEY → 503 + audit event status=skipped, missing=[NEON_API_KEY]', async () => {
    delete process.env.NEON_API_KEY;
    const route = await import('@/app/api/cron/neon-branch-prune/route');
    const res = await route.GET(makeAuthedRequest());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.missing).toEqual(['NEON_API_KEY']);

    expect(auditEventCreateMock).toHaveBeenCalledTimes(1);
    const auditArgs = auditEventCreateMock.mock.calls[0][0] as { data: { action: string; changes: Record<string, unknown> } };
    expect(auditArgs.data.action).toBe('neon_branch_prune_cron');
    expect(auditArgs.data.changes.status).toBe('skipped');
    expect(auditArgs.data.changes.reason).toBe('missing_env');
    expect(auditArgs.data.changes.missing).toEqual(['NEON_API_KEY']);

    expect(pruneBranchesMock).not.toHaveBeenCalled();
  });

  it('case 2: missing NEON_PROJECT_ID → 503 + audit event status=skipped, missing=[NEON_PROJECT_ID]', async () => {
    delete process.env.NEON_PROJECT_ID;
    const route = await import('@/app/api/cron/neon-branch-prune/route');
    const res = await route.GET(makeAuthedRequest());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.missing).toEqual(['NEON_PROJECT_ID']);

    expect(auditEventCreateMock).toHaveBeenCalledTimes(1);
    const auditArgs = auditEventCreateMock.mock.calls[0][0] as { data: { changes: Record<string, unknown> } };
    expect(auditArgs.data.changes.missing).toEqual(['NEON_PROJECT_ID']);
    expect(pruneBranchesMock).not.toHaveBeenCalled();
  });

  it('case 3: missing both → 503 + audit event lists both names', async () => {
    delete process.env.NEON_API_KEY;
    delete process.env.NEON_PROJECT_ID;
    const route = await import('@/app/api/cron/neon-branch-prune/route');
    const res = await route.GET(makeAuthedRequest());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.missing).toEqual(['NEON_API_KEY', 'NEON_PROJECT_ID']);

    expect(auditEventCreateMock).toHaveBeenCalledTimes(1);
    const auditArgs = auditEventCreateMock.mock.calls[0][0] as { data: { changes: Record<string, unknown> } };
    expect(auditArgs.data.changes.missing).toEqual(['NEON_API_KEY', 'NEON_PROJECT_ID']);
  });

  it('case 4: successful prune → 200 + audit event status=ok with counts', async () => {
    pruneBranchesMock.mockResolvedValueOnce({
      examined: 5,
      protected_count: 0,
      primary_count: 1,
      too_recent_count: 2,
      pruned: [
        { id: 'br-1', name: 'preview/old-1', updated_at: '2026-05-08T00:00:00Z' },
        { id: 'br-2', name: 'preview/old-2', updated_at: '2026-05-07T00:00:00Z' },
      ],
      errors: [],
    });
    const route = await import('@/app/api/cron/neon-branch-prune/route');
    const res = await route.GET(makeAuthedRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.examined).toBe(5);
    expect(body.pruned).toBe(2);
    expect(body.pruned_branches).toEqual(['preview/old-1', 'preview/old-2']);

    expect(auditEventCreateMock).toHaveBeenCalledTimes(1);
    const auditArgs = auditEventCreateMock.mock.calls[0][0] as { data: { changes: Record<string, unknown> } };
    expect(auditArgs.data.changes.status).toBe('ok');
    expect(auditArgs.data.changes.examined).toBe(5);
    expect(auditArgs.data.changes.pruned_count).toBe(2);
    expect(auditArgs.data.changes.errors_count).toBe(0);
    expect(auditArgs.data.changes.kept).toMatchObject({ primary: 1, protected: 0, within_retention: 2 });
  });

  it('case 5: partial prune (some delete errors) → 500 + audit event status=partial', async () => {
    pruneBranchesMock.mockResolvedValueOnce({
      examined: 4,
      protected_count: 0,
      primary_count: 1,
      too_recent_count: 1,
      pruned: [
        { id: 'br-3', name: 'preview/old-3', updated_at: '2026-05-08T00:00:00Z' },
      ],
      errors: [
        { id: 'br-bad', name: 'preview/locked', message: 'HTTP 423 — branch is being modified' },
      ],
    });
    const route = await import('@/app/api/cron/neon-branch-prune/route');
    const res = await route.GET(makeAuthedRequest());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errors).toHaveLength(1);

    expect(auditEventCreateMock).toHaveBeenCalledTimes(1);
    const auditArgs = auditEventCreateMock.mock.calls[0][0] as { data: { changes: Record<string, unknown> } };
    expect(auditArgs.data.changes.status).toBe('partial');
    expect(auditArgs.data.changes.errors_count).toBe(1);
    expect(auditArgs.data.changes.pruned_count).toBe(1);
  });

  it('case 6: audit-event write failure does NOT mask the 503 skipped response', async () => {
    delete process.env.NEON_API_KEY;
    auditEventCreateMock.mockRejectedValueOnce(new Error('DB unavailable'));
    const route = await import('@/app/api/cron/neon-branch-prune/route');
    const res = await route.GET(makeAuthedRequest());

    // Audit failed but the cron response shape is intact.
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.missing).toEqual(['NEON_API_KEY']);

    // Audit was attempted exactly once (it threw, so no retry).
    expect(auditEventCreateMock).toHaveBeenCalledTimes(1);
  });

  it('case 7: audit-event write failure does NOT mask the success-path 200 response', async () => {
    auditEventCreateMock.mockRejectedValueOnce(new Error('DB unavailable'));
    pruneBranchesMock.mockResolvedValueOnce({
      examined: 3,
      protected_count: 0,
      primary_count: 1,
      too_recent_count: 2,
      pruned: [],
      errors: [],
    });
    const route = await import('@/app/api/cron/neon-branch-prune/route');
    const res = await route.GET(makeAuthedRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.examined).toBe(3);
  });

  it('case 9: pruneBranches throws → 500 + audit event status=error with truncated message', async () => {
    pruneBranchesMock.mockRejectedValueOnce(
      new Error('Neon listBranches failed: HTTP 500 Internal Server Error — upstream timeout')
    );
    const route = await import('@/app/api/cron/neon-branch-prune/route');
    const res = await route.GET(makeAuthedRequest());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe('string');

    expect(auditEventCreateMock).toHaveBeenCalledTimes(1);
    const auditArgs = auditEventCreateMock.mock.calls[0][0] as { data: { changes: Record<string, unknown> } };
    expect(auditArgs.data.changes.status).toBe('error');
    expect(auditArgs.data.changes.reason).toBe('exception');
    // The error message is recorded so ops:health can flag it as critical.
    expect(typeof auditArgs.data.changes.error).toBe('string');
    expect((auditArgs.data.changes.error as string)).toContain('Neon listBranches failed');
  });

  it('case 8: wrong CRON_SECRET → 401 + NO audit event written', async () => {
    const route = await import('@/app/api/cron/neon-branch-prune/route');
    const res = await route.GET(makeAuthedRequest('wrong-secret'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');

    // Auth failure must NOT write to the audit log (would let
    // unauthenticated callers spam it).
    expect(auditEventCreateMock).not.toHaveBeenCalled();
    expect(pruneBranchesMock).not.toHaveBeenCalled();
  });
});
