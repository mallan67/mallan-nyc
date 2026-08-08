/**
 * THE SINGLE DEFINITION OF ODATA MEDIA COMPLETENESS.
 *
 * All three callers delegate here — `media-sync.ts` (`defaultFetchMedia`),
 * `sync.ts` (batch-media), and `fetch.ts` (`fetchListingMedia`) — so there is
 * exactly one page follower and no copy that can drift.
 *
 * WHY ITS OWN MODULE AND NOT `fetch.ts`
 * -------------------------------------
 * `lib/idx/fetch.ts` is the PROVIDER-I/O MOCK BOUNDARY: suites routinely do
 * `jest.mock("@/lib/idx/fetch", ...)` to stub network access. This function is
 * a PURE ALGORITHM, not I/O. Housing it behind that boundary means any test
 * stubbing provider I/O would silently stub the completeness loop as well, and
 * a truncated result would look complete — precisely the false-green this code
 * exists to prevent. (Observed: two runtime suites went red for exactly that
 * reason when it briefly lived in `fetch.ts`.)
 *
 * It is also deliberately NOT in `media-sync.ts`, which imports Prisma: the
 * public read path must be able to share the follower without pulling a
 * Prisma-backed module in, keeping the pre-Neon skip boundary intact.
 *
 * No I/O, no Prisma, no provider knowledge — just the loop.
 */

/** One page of an OData Media response. `nextLink` is `@odata.nextLink` or null. */
export interface MediaPage {
  value: unknown[];
  nextLink: string | null;
}

/**
 * Follow `@odata.nextLink` until the Media response is exhausted, so a caller
 * has the COMPLETE current media set before it writes, tombstones, or renders.
 *
 * Returns `complete: false` (with whatever rows were gathered) when any page
 * fetch fails OR the page count exceeds `maxPages` (runaway guard). A caller
 * MUST treat `complete: false` as UNKNOWN, never as an authoritative result: a
 * key missing from an incomplete response is not proven absent at source.
 *
 * `$top` is a PER-PAGE SIZE ONLY. It is not a cap on the total result, and a
 * first page that comes back non-empty is not evidence the set is exhausted —
 * that confusion truncated `fetchListingMedia` to 50 of RLS20105333's 68 media
 * rows on live data.
 *
 * Pure over an injected `fetchPage`, so the loop stays unit-testable offline.
 */
export async function paginateMedia<T = unknown>(
  firstUrl: string,
  fetchPage: (url: string) => Promise<MediaPage>,
  maxPages = 50,
): Promise<{ rows: T[]; complete: boolean }> {
  const rows: T[] = [];
  let url: string | null = firstUrl;
  let pages = 0;
  while (url) {
    if (pages >= maxPages) return { rows, complete: false }; // fail closed on runaway
    let page: MediaPage;
    try {
      page = await fetchPage(url);
    } catch {
      return { rows, complete: false }; // a failed page ⇒ incomplete ⇒ no destructive write
    }
    for (const r of page.value) rows.push(r as T);
    url = page.nextLink;
    pages++;
  }
  return { rows, complete: true };
}
