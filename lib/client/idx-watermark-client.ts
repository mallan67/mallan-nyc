/**
 * Shared client-side IDX watermark access — ONE request per full app mount.
 *
 * Neon-quiet (2026-07-23): Footer and every IDXDisclaimer instance previously
 * fired their OWN `fetch('/api/idx/watermark', { cache: 'no-store' })` — a
 * listing page rendering several disclaimer surfaces issued several requests,
 * and `no-store` needlessly defeated the browser cache (the CDN's s-maxage
 * still applied, but each mount re-hit the edge).
 *
 * This module deduplicates: a module-scoped promise memo means any number of
 * consumers on one full app mount share a SINGLE request, with the browser
 * HTTP cache no longer suppressed. Fail-closed: on any error the promise
 * resolves null and consumers render their "updated regularly" fallback —
 * never a fabricated date (UCBA Art. VIII §4).
 *
 * Testable core: `fetchIdxWatermarkOnce` is a plain function over an injected
 * fetch so node tests can prove the dedupe without a DOM.
 */

export interface IdxWatermarkResponse {
  displayAt: string | null;
}

let inflight: Promise<Date | null> | null = null;

/** Reset seam for tests only. */
export function __resetIdxWatermarkMemoForTests(): void {
  inflight = null;
}

/**
 * Fetch the watermark exactly once per app mount (module lifetime); all
 * callers share the same promise. NOTE: deliberately NO `cache: 'no-store'` —
 * the response is CDN-cached (s-maxage=900) and the browser may reuse it.
 */
export function fetchIdxWatermarkOnce(
  fetchImpl: typeof fetch = fetch,
): Promise<Date | null> {
  if (!inflight) {
    inflight = fetchImpl('/api/idx/watermark')
      .then((r) => (r.ok ? (r.json() as Promise<IdxWatermarkResponse>) : null))
      .then((data) => {
        if (!data?.displayAt) return null;
        const d = new Date(data.displayAt);
        return isNaN(d.getTime()) ? null : d;
      })
      .catch(() => null);
  }
  return inflight;
}
