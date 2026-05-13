/**
 * Shared portal-API fetch helper.
 *
 * The audit B2 finding (2026-05-13) flagged that every portal page
 * (`app/portal/{buyer,tenant,seller,landlord}/page.tsx`) used the pattern
 *
 *   try {
 *     const res = await fetch('/api/portal/...');
 *     if (!res.ok) throw new Error();
 *     const data = await res.json();
 *     setListings(data.listings || []);
 *   } catch {
 *     setListings([]);  // ← silent empty
 *   }
 *
 * which collapsed every non-2xx response — including a 401 from an
 * expired `pc_auth` cookie — into an empty array. A signed-in user whose
 * session quietly lapsed would see "0 listings / 0 showings /
 * 0 preferences / 0 family" with no toast, no redirect, no retry. Looked
 * identical to data loss; was actually session expiry.
 *
 * This helper centralises the distinction:
 *   - 2xx        → return parsed JSON
 *   - **401**    → throw {@link PortalSessionExpiredError} so the caller
 *                  can redirect to /sign-in
 *   - other      → throw regular Error so the caller can show error UI
 *                  AND still fall back to an empty state if it wants
 *
 * A true empty response (200 with `{ listings: [] }`) passes through
 * cleanly — the helper does NOT confuse "no data" with "no session".
 */

export class PortalSessionExpiredError extends Error {
  readonly status: number;

  constructor(status: number) {
    super('Portal session expired — please sign in again.');
    this.name = 'PortalSessionExpiredError';
    this.status = status;
    // Preserve the prototype chain so `instanceof` works across the
    // TS-down-emit boundary. Without this, ts-jest's ES5-emit-default
    // can make `err instanceof PortalSessionExpiredError` false in
    // strict-mode runtimes.
    Object.setPrototypeOf(this, PortalSessionExpiredError.prototype);
  }
}

/**
 * Fetch a portal API endpoint and parse JSON.
 *
 * Throws {@link PortalSessionExpiredError} on 401; regular Error on any
 * other non-2xx; propagates network errors from `fetch` unchanged.
 *
 * Callers should:
 *   try {
 *     const data = await portalFetchJson<...>('/api/portal/listings');
 *     setListings(data.listings || []);
 *   } catch (err) {
 *     if (err instanceof PortalSessionExpiredError) return; // redirect handled by hook
 *     setListings([]); // genuine empty / non-401 error
 *   }
 *
 * The {@link usePortalSession} hook (lib/portal/use-portal-session.ts)
 * wires the redirect on the caught session-expired case so call sites
 * stay minimal.
 */
export async function portalFetchJson<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    throw new PortalSessionExpiredError(res.status);
  }
  if (!res.ok) {
    throw new Error(`portalFetchJson(${url}) failed with HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
