// lib/listings/listing-canonical-target.ts
//
// Minimal canonical-redirect resolver for the public listing route (crawl-cache P0).
//
// WHY: a legacy / ID-only / hybrid listing URL used to run the FULL detail query
// (listing.findUnique WITH the listing_media join, the raw_data/features JSON, the
// exclusive agent lookup, then the whole DTO build) only to 308-redirect to the
// canonical `/listing/{address-slug}/{id}` path. Crawlers sweeping many unique + duplicate
// alias URLs turned every hit into a cold full render → sustained Neon compute.
//
// This resolver answers "where does this alias redirect to?" with ONE narrow indexed
// read (CANONICAL_REDIRECT_SELECT — no media join, no big JSON, no agent lookup) and
// reuses the EXACT canonical-slug computation the render uses, so the redirect target can
// never disagree with the page's own canonical (no redirect loop). Address suppression is
// reproduced fail-closed: a suppressed listing's canonical is the address-free
// `listing-{id}` form, so a redirect never leaks a suppressed address.
//
// ERROR SEMANTICS: null = confirmed miss / display-gate rejection (a 404 is correct);
// a thrown Prisma/Neon error PROPAGATES (never becomes a cached 404). Same contract the
// full render uses via resolveListingResult.

import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { findListingRow } from "@/lib/listings/listing-lookup";
import { isMlsIdSlug, generateListingSlug, composeSlugStreetName } from "@/lib/listing-slug";
import { buildCanonicalListingPath } from "@/lib/listing-canonical-url";
import { normalizeStreetCase } from "@/lib/idx/normalize-street-case";
import { canDisplayListingAddress, isListingDisplayable } from "@/lib/search/listing-access-decision";

/**
 * The ONLY columns a redirect decision needs: enough to (a) run the display gates
 * (`isListingDisplayable` / `canDisplayListingAddress`) and (b) build the canonical slug.
 * Deliberately NO `listing_media`, NO `raw_data`/`features`/`compliance` JSON, NO agent.
 */
export const CANONICAL_REDIRECT_SELECT = {
  listing_id: true,
  mls_id: true,
  address: true,
  postal_code: true,
  rls_eligible: true,
  status: true,
  idx_display_yn: true,
  owner_opt_out: true,
  participant_only: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
} satisfies Prisma.ListingSelect;

/**
 * The fields `canonicalPathForRow` actually reads — the address parts + the two address
 * gate columns + identity. Kept narrow so callers that only have a mapped listing (e.g.
 * the IDX sync) can revalidate the canonical path without supplying full gate columns.
 */
export type CanonicalSlugInput = {
  listing_id: string;
  mls_id: string | null;
  address: unknown;
  postal_code: string | null;
  rls_eligible: boolean;
  internet_entire_listing_display_yn: boolean;
  internet_address_display_yn: boolean;
};

type RedirectRow = CanonicalSlugInput & {
  status: string;
  idx_display_yn: boolean;
  owner_opt_out: boolean;
  participant_only: boolean;
};

export type CanonicalTarget = {
  /** The canonical `/listing/...` path this listing should live at. */
  canonicalPath: string;
  /** The exact stored listing_id (pass as keyOverride to the full fetch — direct findUnique). */
  listingId: string;
};

/**
 * Is this incoming path an ALIAS that must redirect (rather than a canonical path that
 * should render)? Canonical shapes are: two-segment `{address}/{id}`, or the single
 * segment `listing-{id}` (the address-suppressed canonical form). Everything else — a
 * bare id, an Option-D hybrid `{address}-{id}`, or a legacy address-only slug — is a
 * single non-`listing-` segment and redirects.
 */
export function isAliasShape(slugParts: string[]): boolean {
  if (slugParts.length >= 2) return false;
  if (slugParts.length === 1 && isMlsIdSlug(slugParts[0])) return false;
  return true;
}

/** Build the canonical path for a minimal row — identical logic to the full render's DTO. */
export function canonicalPathForRow(row: CanonicalSlugInput): string {
  const addr = (row.address as Record<string, string>) || {};
  // Website-only listings (rls_eligible === false) show their address; RLS-backed rows
  // respect the IDX address opt-out (fail-closed).
  const isRlsBacked = row.rls_eligible !== false;
  const suppressAddress = isRlsBacked && !canDisplayListingAddress(row);

  const slug = generateListingSlug({
    address: {
      streetNumber: addr.StreetNumber || "",
      streetName: suppressAddress
        ? "Address Undisclosed"
        : normalizeStreetCase(composeSlugStreetName(addr) || ""),
      unitNumber: addr.UnitNumber || null,
      city: addr.City || "",
      stateOrProvince: addr.StateOrProvince || "NY",
      postalCode: addr.PostalCode || row.postal_code || "",
    },
    id: row.listing_id,
    mlsId: row.mls_id || undefined,
    internetAddressDisplayYN: !suppressAddress,
  });

  return buildCanonicalListingPath({ slug, id: row.listing_id });
}

/**
 * Resolve the canonical redirect target for a lookup key using ONE narrow indexed read.
 * Returns null on a confirmed miss OR a display-gate rejection (→ 404); throws on infra.
 * (Uncached impl — exported for tests; the request-shared export is `resolveCanonicalTarget`.)
 */
export async function resolveCanonicalTargetUncached(
  lookupKey: string,
): Promise<CanonicalTarget | null> {
  const row = await findListingRow<RedirectRow>(lookupKey, undefined, {
    select: CANONICAL_REDIRECT_SELECT,
  });
  if (!row) return null;

  // Same gate the full render applies: RLS-backed rows fail closed on missing permission;
  // website-only (rls_eligible === false) rows bypass the RLS gate.
  const isRlsBacked = row.rls_eligible !== false;
  if (isRlsBacked && !isListingDisplayable(row)) return null;

  return { canonicalPath: canonicalPathForRow(row), listingId: row.listing_id };
}

/**
 * `cache()`-wrapped resolver so generateMetadata + the page share ONE query per request.
 * `cache` is a server-only React API; outside a Next server runtime (e.g. unit tests) it is
 * absent, so fall back to the uncached impl there — the request-dedupe is a perf optimization,
 * not a correctness requirement.
 */
export const resolveCanonicalTarget =
  typeof cache === "function" ? cache(resolveCanonicalTargetUncached) : resolveCanonicalTargetUncached;
