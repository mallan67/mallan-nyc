/**
 * DETAIL CANONICALIZATION for a Mallan RLS return-copy.
 *
 * Public suppression (lib/listings/mallan-source-identity.ts) keeps the returned
 * Cotality twin out of search, sitemap, agent pages, comps, autocomplete and the
 * building manifest. A DIRECT hit on the twin's own `/listing/...` URL bypasses
 * all of that, so the same physical unit stayed publicly reachable at two URLs —
 * duplicate content, plus the wrong attribution and editorial copy, since the
 * LOCAL row is canonical (CHARTER Section 1A).
 *
 * THE RULE:
 *   exactly one PROVEN local physical-unit twin -> redirect to its canonical URL
 *   zero, or more than one                      -> FAIL CLOSED (404)
 *
 * "Proven" reuses `buildAddressKeyFromDbRow` — the repo's existing physical-unit
 * key, already used by `preferCrmExclusiveOverIdxDuplicate`. It REQUIRES a
 * UnitNumber and returns null without one, so different units, address-suppressed
 * rows and partial addresses can never be merged. A second, looser identity is
 * deliberately NOT introduced here: sending a visitor to a different apartment in
 * the same building would be worse than a 404.
 *
 * The stored return-copy row is never mutated or deleted — it remains source
 * evidence for reconciliation and audit.
 */

import {
  isMallanLocalListing,
  isMallanRlsReturnCopy,
  type MallanSourceIdentityRow,
} from '@/lib/listings/mallan-source-identity';
import { buildAddressKeyFromDbRow } from '@/lib/listings/dedupe-crm-vs-idx';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';

/** The row shape this decision needs. `address` is the raw Prisma JSON column. */
export interface ReturnCopyCandidateRow extends MallanSourceIdentityRow {
  address?: unknown;
  slug?: string | null;
}

export type ReturnCopyCanonicalTarget =
  /** The requested row is not a return-copy — render it normally. */
  | { kind: 'not-applicable' }
  /** Exactly one proven local twin: send the visitor to the canonical listing. */
  | { kind: 'redirect'; path: string; listingId: string }
  /** Identity could not be proven — 404 rather than guess. */
  | {
      kind: 'fail-closed';
      reason: 'no-address-key' | 'no-local-twin' | 'ambiguous-local-twins' | 'no-canonical-url';
    };

/**
 * Decide what a direct request for `requested` should do.
 *
 * PURE — takes the already-fetched local candidate rows so the decision is unit
 * testable and so the caller controls the query. `candidates` may contain any
 * rows; non-local ones are ignored.
 */
export function resolveReturnCopyCanonicalTarget(
  requested: ReturnCopyCandidateRow,
  candidates: ReadonlyArray<ReturnCopyCandidateRow>,
): ReturnCopyCanonicalTarget {
  // Only a VERIFIED return-copy is canonicalized. A third-party row, a local
  // row, and a row of unknown provenance all render normally — suppression must
  // never be the default for unclassifiable data.
  if (!isMallanRlsReturnCopy(requested)) return { kind: 'not-applicable' };

  const key = buildAddressKeyFromDbRow({ address: requested.address });
  if (!key) return { kind: 'fail-closed', reason: 'no-address-key' };

  const twins = candidates.filter(
    (c) => isMallanLocalListing(c) && buildAddressKeyFromDbRow({ address: c.address }) === key,
  );

  if (twins.length === 0) return { kind: 'fail-closed', reason: 'no-local-twin' };
  if (twins.length > 1) {
    // Two local rows claiming one physical unit is a data problem to resolve in
    // the CRM, not something to resolve by picking one for the public.
    return { kind: 'fail-closed', reason: 'ambiguous-local-twins' };
  }

  const twin = twins[0];
  const listingId = String(twin.listing_id ?? '').trim();
  const slug = String(twin.slug ?? '').trim();
  // A slug is REQUIRED. With an empty slug `buildCanonicalListingPath` emits the
  // double-slash form `/listing//sl-0004`, so redirecting there would trade one
  // bad public URL for another. UCBA-suppressed rows still carry a slug
  // (`listing-XXX`), so this only rejects genuinely unusable rows.
  if (!slug || !listingId) return { kind: 'fail-closed', reason: 'no-canonical-url' };

  const path = buildCanonicalListingPath({ slug, id: listingId });
  if (!path || path.includes('//listing') || path === '/listing/') {
    return { kind: 'fail-closed', reason: 'no-canonical-url' };
  }

  return { kind: 'redirect', path, listingId };
}
