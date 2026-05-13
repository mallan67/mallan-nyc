'use client';

import { useCallback, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { portalFetchJson, PortalSessionExpiredError } from './portal-fetch';

/**
 * React hook returned by every portal page. Provides a `portalFetch`
 * wrapper that automatically redirects to `/sign-in` on 401 and exposes
 * a `sessionExpired` flag for any UI that wants to render a banner
 * before the redirect lands.
 *
 * Audit B2 fix (2026-05-13). The old pattern across all 4 portal pages
 * collapsed every error into `setState([])`. This hook lets the call
 * sites preserve genuine empty-state semantics while routing 401 to a
 * proper session-expired UX.
 *
 * Call-site pattern:
 *
 *   const { portalFetch, sessionExpired } = usePortalSession();
 *
 *   const fetchListings = useCallback(async () => {
 *     try {
 *       const data = await portalFetch<{ listings: Listing[] }>('/api/portal/listings');
 *       setListings(data.listings || []);
 *     } catch (err) {
 *       if (err instanceof PortalSessionExpiredError) return; // redirect in flight
 *       setListings([]); // genuine empty / non-401 error
 *     }
 *   }, [portalFetch]);
 *
 * The hook deliberately fires `router.replace` only once per
 * session-expiry event (guarded by the local `sessionExpired` state) so
 * parallel fetchers don't stack redirects.
 */

export interface UsePortalSession {
  /**
   * Wrapped fetch. Resolves to parsed JSON. Throws
   * {@link PortalSessionExpiredError} on 401 (after triggering the
   * redirect). Throws regular Error on any other non-2xx, and
   * propagates network errors from `fetch` unchanged.
   */
  portalFetch: <T = unknown>(url: string, init?: RequestInit) => Promise<T>;
  /**
   * True once a 401 has been observed on this hook instance. Lets UI
   * render a "Your session expired — signing you out…" banner during
   * the moment between the 401 and the router.replace completing.
   */
  sessionExpired: boolean;
}

export function usePortalSession(): UsePortalSession {
  const router = useRouter();
  const pathname = usePathname();
  const [sessionExpired, setSessionExpired] = useState(false);

  const portalFetch = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T> => {
      try {
        return await portalFetchJson<T>(url, init);
      } catch (err) {
        if (err instanceof PortalSessionExpiredError) {
          // Idempotent: only emit one redirect per session-expiry event.
          // Multiple parallel fetchers can land 401 back-to-back; without
          // this guard we'd push multiple `/sign-in` entries onto history.
          if (!sessionExpired) {
            setSessionExpired(true);
            const returnTo = pathname
              ? `?reason=session_expired&return_to=${encodeURIComponent(pathname)}`
              : '?reason=session_expired';
            router.replace(`/sign-in${returnTo}`);
          }
        }
        throw err;
      }
    },
    [router, pathname, sessionExpired],
  );

  return { portalFetch, sessionExpired };
}
