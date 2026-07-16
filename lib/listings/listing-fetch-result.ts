// lib/listings/listing-fetch-result.ts
//
// ISR-safe "not-found vs. error" contract for the public listing detail page.
//
// The listing page must call notFound() ONLY for a CONFIRMED miss or a display-gate
// rejection — NEVER for an infrastructure failure (Prisma/Neon timeout, connection
// reset, or compute-quota error). Under ISR a notFound() is CACHED: converting a
// transient DB error into notFound() would cache a 404 in place of a still-valid
// listing until the next successful revalidation.
//
// Contract: the fetch returns `null` ONLY on a confirmed miss / gate rejection, and
// THROWS on any infrastructure error. `resolveListingResult` enforces this at the page
// boundary — it PROPAGATES any thrown error (so the page's `if (!result) notFound()`
// can never fire on an infra error) while passing a genuine `null` (confirmed miss)
// straight through. Under ISR a propagated error fails the revalidation render, so
// Next serves the last good cached page rather than caching a 404.

export async function resolveListingResult<T>(
  fetchListing: () => Promise<T | null>,
): Promise<T | null> {
  // Intentionally NO try/catch. `null` = confirmed miss (a 404 is correct there);
  // a thrown error = infrastructure failure (MUST propagate, never become a 404).
  return await fetchListing();
}
