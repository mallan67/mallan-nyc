// lib/listings/revalidate-listing.ts
//
// Change-driven ISR invalidation for the public listing detail page (crawl-cache P0).
//
// The detail route uses a LONG safety TTL (see app/listing/[...slug]/page.tsx `revalidate`)
// instead of the old blanket 5-minute rerender. This helper revalidates ONLY one listing's
// canonical path so exactly the changed page is re-rendered on its next request (not the
// whole catalog, not on a timer).
//
// WIRING STATUS (crawl-cache P0, honest scope): currently called ONLY from feed-reconcile
// on a ghost/terminal withdrawal (the §2.05-critical path). Change-driven revalidation from
// the MAIN IDX sync (lib/idx/sync.ts) and the MEDIA sync (lib/idx/media-sync.ts) is DEFERRED
// to a follow-up: those seams only have the mapped Cotality record, which does not carry
// rls_eligible, so revalidating from it would require an assumption — the correct fix reads
// the persisted row. Until then, delta-sync freshness relies on the safety TTL.
//
// BEST-EFFORT: revalidation must NEVER break the DB write that preceded it. If
// `revalidatePath` is unavailable (e.g. invoked outside a request context, such as a CLI
// script) or the row is malformed, the failure is swallowed and logged.

import { revalidatePath } from "next/cache";
import { canonicalPathForRow, type CanonicalSlugInput } from "@/lib/listings/listing-canonical-target";

/**
 * Revalidate the canonical detail path for one changed listing. Accepts any object
 * carrying the address parts + address gate columns + identity (a mapped sync listing
 * qualifies). Returns the path it revalidated, or null if it was skipped.
 */
export function revalidateListingCanonical(row: CanonicalSlugInput): string | null {
  try {
    const path = canonicalPathForRow(row);
    if (!path) return null;
    revalidatePath(path);
    return path;
  } catch (err) {
    console.warn(
      "[revalidate-listing] skipped (write already committed):",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Revalidate many changed listings; de-dupes paths so each is revalidated once. */
export function revalidateListingsCanonical(rows: CanonicalSlugInput[]): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const path = revalidateListingCanonical(row);
    if (path) seen.add(path);
  }
  return seen.size;
}
