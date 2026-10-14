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
import { tourUrlsForDto } from '@/lib/media/listing-media-resolver';

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

/**
 * Read-only publication refresh for a Mallan-authored listing with ONE
 * independently verified list-office return-copy of the SAME PHYSICAL UNIT.
 *
 * This does not transfer ownership to Cotality, write to the returned record,
 * or change the local listing's persisted business data. It only allows newer,
 * public, unbranded description/video evidence from the owner's RLS submission
 * to appear on the ONE Mallan canonical detail page while the CRM record is stale.
 *
 * No fuzzy names, broker-name guesses, address-only matches, or fallback to
 * third-party inventory. Source display gates fail closed.
 */
export interface MallanPublicRefreshRow extends ReturnCopyCandidateRow {
  modification_timestamp?: Date | string | null;
  status?: string | null;
  idx_display_yn?: boolean | null;
  internet_entire_listing_display_yn?: boolean | null;
  owner_opt_out?: boolean | null;
  participant_only?: boolean | null;
  raw_data?: unknown;
}
export interface MallanPublicRefresh {
  sourceListingId: string;
  publicRemarks?: string;
  videoUrl?: string;
  virtualTourURL?: string;
}

function safePublicRemarkText(input: unknown): string | undefined {
  if (typeof input !== 'string' || !input.trim()) return undefined;
  const value = input
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .trim();
  return value || undefined;
}

/** All candidates must be same-unit, office-verified, Active and public-permitted. */
export function reconcileMallanPublicReturnCopy(
  local: MallanPublicRefreshRow,
  candidates: ReadonlyArray<MallanPublicRefreshRow>,
): MallanPublicRefresh | null {
  if (!isMallanLocalListing(local) || local.rls_eligible === false) return null;
  const key = buildAddressKeyFromDbRow(local);
  if (!key) return null;
  const matching = candidates.filter(
    c => isMallanRlsReturnCopy(c) &&
      c.status === 'Active' &&
      c.idx_display_yn === true &&
      c.internet_entire_listing_display_yn === true &&
      c.owner_opt_out !== true &&
      c.participant_only !== true &&
      buildAddressKeyFromDbRow(c) === key,
  );
  // Multiple return copies for the same unit are an unresolved identity conflict.
  if (matching.length !== 1) return null;
  const source = matching[0];
  const data = source.raw_data && typeof source.raw_data === 'object' && !Array.isArray(source.raw_data)
    ? source.raw_data as Record<string, unknown> : {};
  const tours = tourUrlsForDto(
    [data.VirtualTourURLUnbranded, data.VirtualTourURLUnbranded2, data.VirtualTourURLUnbranded3],
  );
  const sourceTime = source.modification_timestamp ? new Date(source.modification_timestamp).getTime() : NaN;
  const localTime = local.modification_timestamp ? new Date(local.modification_timestamp).getTime() : NaN;
  const remarks = Number.isFinite(sourceTime) && Number.isFinite(localTime) && sourceTime > localTime
    ? safePublicRemarkText(data.PublicRemarks) : undefined;
  if (!remarks && !tours.videoUrl && !tours.virtualTourURL) return null;
  return {
    sourceListingId: String(source.listing_id),
    ...(remarks ? { publicRemarks: remarks } : {}),
    ...(tours.videoUrl ? { videoUrl: tours.videoUrl } : {}),
    ...(tours.virtualTourURL ? { virtualTourURL: tours.virtualTourURL } : {}),
  };
}
