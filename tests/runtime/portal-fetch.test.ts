/// <reference types="jest" />
/**
 * Hotfix 2 — portal 401 silent empty-state fix.
 *
 * Audit B2 finding (2026-05-13 6-agent sweep · frontend-flow-verifier):
 *
 *   All 5 fetchers in app/portal/buyer/page.tsx (mirrored in tenant /
 *   seller / landlord) do `if (!res.ok) throw new Error()` and silently
 *   `setState([])` in `catch`. When pc_auth expires mid-session, every
 *   endpoint returns 401, the user sees "0 listings / 0 showings /
 *   0 preferences / 0 family" with no toast, no redirect, no retry —
 *   looks like data loss.
 *
 * This test file pins the shared helper that distinguishes a 401
 * session-expired response from any other error condition, so callers
 * can redirect to /sign-in instead of swallowing into empty state.
 *
 * TDD discipline (per the superpowers:test-driven-development skill):
 *   1. Author this test BEFORE creating lib/portal/portal-fetch.ts.
 *   2. Watch it fail with "Cannot find module" (module doesn't exist).
 *   3. Implement minimal portalFetchJson + PortalSessionExpiredError.
 *   4. Refactor buyer/tenant/seller/landlord pages to use it.
 */

import {
  portalFetchJson,
  PortalSessionExpiredError,
} from '@/lib/portal/portal-fetch';

// ─── Fetch mock helpers ──────────────────────────────────────────────────

const originalFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('portalFetchJson · session vs empty-state distinction', () => {
  it('returns parsed JSON body on 2xx', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { listings: [{ id: 'a' }] }));

    const data = await portalFetchJson<{ listings: { id: string }[] }>('/api/portal/listings');

    expect(data.listings).toEqual([{ id: 'a' }]);
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/listings', undefined);
  });

  it('forwards RequestInit (method/headers/body) to fetch', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true }));

    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 1 }),
    };
    await portalFetchJson('/api/portal/preferences', init);

    expect(fetchMock).toHaveBeenCalledWith('/api/portal/preferences', init);
  });

  it('throws PortalSessionExpiredError on 401 (NOT a generic Error)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }));

    await expect(portalFetchJson('/api/portal/listings')).rejects.toBeInstanceOf(
      PortalSessionExpiredError,
    );
  });

  it('PortalSessionExpiredError carries status=401 and is distinguishable via instanceof', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));

    try {
      await portalFetchJson('/api/portal/listings');
      throw new Error('expected PortalSessionExpiredError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PortalSessionExpiredError);
      expect((err as PortalSessionExpiredError).status).toBe(401);
      // Distinguishable from Error
      expect((err as Error).name).toBe('PortalSessionExpiredError');
    }
  });

  it('throws a regular Error (NOT PortalSessionExpiredError) on 403', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'Forbidden' }));

    try {
      await portalFetchJson('/api/portal/listings');
      throw new Error('expected error to be thrown');
    } catch (err) {
      expect(err).not.toBeInstanceOf(PortalSessionExpiredError);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('403');
    }
  });

  it('throws a regular Error on 404 / 500 / 502 / 503', async () => {
    for (const status of [404, 500, 502, 503]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, {}));
      try {
        await portalFetchJson('/api/portal/listings');
        throw new Error(`expected throw for ${status}`);
      } catch (err) {
        expect(err).not.toBeInstanceOf(PortalSessionExpiredError);
        expect((err as Error).message).toContain(String(status));
      }
    }
  });

  it('propagates network errors (fetch itself throws)', async () => {
    const networkErr = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValueOnce(networkErr);

    await expect(portalFetchJson('/api/portal/listings')).rejects.toBe(networkErr);
  });

  it('a true empty response (200 with empty array) returns [] — NOT confused with 401', async () => {
    // This is the critical distinction the silent-empty bug erased: an
    // empty listings array is a valid empty-state, not a session error.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { listings: [] }));

    const data = await portalFetchJson<{ listings: unknown[] }>('/api/portal/listings');

    expect(data.listings).toEqual([]);
    // No throw — caller's setState([]) on this is the correct empty state.
  });
});

describe('PortalSessionExpiredError shape', () => {
  it('is a proper Error subclass (instanceof Error)', () => {
    const e = new PortalSessionExpiredError(401);
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(PortalSessionExpiredError);
  });

  it('has the canonical name so logs and Sentry tag it correctly', () => {
    const e = new PortalSessionExpiredError(401);
    expect(e.name).toBe('PortalSessionExpiredError');
  });

  it('exposes the originating HTTP status', () => {
    expect(new PortalSessionExpiredError(401).status).toBe(401);
  });

  it('has a stable, human-readable message', () => {
    const e = new PortalSessionExpiredError(401);
    expect(e.message).toMatch(/session/i);
  });
});
