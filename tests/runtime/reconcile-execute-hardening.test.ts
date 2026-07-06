/// <reference types="jest" />
/**
 * reconcile-execute.ts hardening (2026-07-06) — fail-closed at the re-verify boundary
 * and robust projection dual-write.
 *
 * The executor is a manual ops script; `main()` is guarded off under NODE_ENV=test so we can
 * import and exercise its testable units directly.
 *   - liveStatusOf: a failed re-verify fetch marks ids UNRESOLVED (never absent); 401 refreshes.
 *   - applyCorrection: a projection dual-write failure is COUNTED, not thrown (no mid-batch halt).
 */
const projectionMock = jest.fn(async () => undefined);
jest.mock('@/lib/search/listing-search-projection', () => ({
  __esModule: true,
  dualWriteProjectionForListingId: projectionMock,
}));

import { liveStatusOf, applyCorrection } from '@/scripts/audit/reconcile-execute';
import type { ReconcileDecision } from '@/lib/idx/reconcile-decision';

beforeEach(() => {
  projectionMock.mockReset();
  projectionMock.mockResolvedValue(undefined);
  process.env.IDX_CLIENT_ID = 'test-id';
  process.env.IDX_CLIENT_SECRET = 'test-secret';
});

const prop = (value: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ value }) }) as unknown as Response;
const httpErr = (status: number) =>
  ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

describe('liveStatusOf — a failed re-verify is NEVER inferred as "gone"', () => {
  it('non-retryable 4xx → id is UNRESOLVED (skip), not absent', async () => {
    global.fetch = jest.fn(async () => httpErr(400)) as unknown as typeof fetch;
    const { resolved, unresolved } = await liveStatusOf('tok', ['RLS-A']);
    expect(unresolved.has('RLS-A')).toBe(true); // caller will SKIP, not withdraw
    expect(resolved.has('RLS-A')).toBe(false);
  });

  it('401 → refreshes token and retries the batch → resolves', async () => {
    let call = 0;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oidc/connect/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'fresh' }) } as unknown as Response;
      }
      call++;
      if (call === 1) return httpErr(401); // first Property call is unauthorized
      return prop([{ ListingId: 'RLS-B', StandardStatus: 'Active' }]); // after refresh
    }) as unknown as typeof fetch;
    const { resolved, unresolved } = await liveStatusOf('stale-tok', ['RLS-B']);
    expect(resolved.get('RLS-B')).toBe('Active');
    expect(unresolved.size).toBe(0);
  });

  it('200 but id omitted → genuinely absent (in neither map)', async () => {
    global.fetch = jest.fn(async () => prop([])) as unknown as typeof fetch;
    const { resolved, unresolved } = await liveStatusOf('tok', ['RLS-C']);
    expect(resolved.has('RLS-C')).toBe(false);
    expect(unresolved.has('RLS-C')).toBe(false); // absent, not unresolved
  });
});

describe('applyCorrection — projection failure is counted, not thrown', () => {
  const decision: ReconcileDecision = {
    action: 'update',
    targetStatus: 'Withdrawn',
    targetIsTerminal: true,
    className: 'stale_to_departed',
    reason: 'test',
  };
  const row = { listing_id: 'RLS-X', status: 'Active' };
  const makePrisma = () => ({
    $transaction: jest.fn(async (ops: unknown[]) => ops),
    listing: { update: jest.fn(() => ({})) },
    auditEvent: { create: jest.fn(() => ({})) },
  });

  it('projection throws → returns projectionFailed:true, does NOT throw, listings write still committed', async () => {
    projectionMock.mockRejectedValue(new Error('projection boom'));
    const prisma = makePrisma();
    const result = await applyCorrection(prisma, row, decision, false, new Date(), true);
    expect(result.projectionFailed).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1); // listings+audit still written
  });

  it('projection succeeds → projectionFailed:false', async () => {
    const prisma = makePrisma();
    const result = await applyCorrection(prisma, row, decision, false, new Date(), true);
    expect(result.projectionFailed).toBe(false);
    expect(projectionMock).toHaveBeenCalledTimes(1);
  });

  it('dry-run (execute=false) → no writes at all', async () => {
    const prisma = makePrisma();
    const result = await applyCorrection(prisma, row, decision, false, new Date(), false);
    expect(result.projectionFailed).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(projectionMock).not.toHaveBeenCalled();
  });
});
