// lib/listings/revalidate-listing.ts
//
// Change-driven ISR invalidation for the public listing detail page (crawl-cache P0).
//
// The detail route uses a LONG safety TTL (see app/listing/[...slug]/page.tsx `revalidate`)
// instead of the old blanket 5-minute rerender. To keep listings fresh without that
// short TTL, the sync/reconcile jobs call this after a listing actually changes: it
// revalidates ONLY that listing's canonical path, so exactly the changed page is
// re-rendered on its next request (not the whole catalog, and not on a timer).
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
