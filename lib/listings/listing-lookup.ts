// lib/listings/listing-lookup.ts
//
// Shared listing-row finder for the public detail route (crawl-cache P0).
//
// ONE matching implementation, used by BOTH:
//   - the minimal canonical-redirect resolver (lib/listings/listing-canonical-target.ts),
//     which passes a NARROW `select` (no listing_media join, no raw_data/features JSON),
//   - the full detail render (app/listing/[...slug]/page.tsx fetchFromDB), which passes
//     `include: LISTING_MEDIA_INCLUDE`.
//
// Keeping the strategies in one place guarantees an alias resolves to the SAME row for
// the redirect decision as it would for the render — the two can never diverge.
//
// Strategies (in order), ported verbatim from the pre-refactor fetchFromDB:
//   1  key override / MLS-ID slug   → findUnique(listing_id, uppercased)
//   1b embedded Option-D id suffix  → findUnique(listing_id)
//   2  address slug parse           → findMany(postal_code + StreetNumber) then validate;
//                                      broad postal-code fallback re-applying the validator
//   3  raw slug as listing_id       → findUnique(listing_id, uppercased)
//
// ERROR SEMANTICS: this module NEVER catches. A confirmed miss returns null; a Prisma/Neon
// infrastructure error PROPAGATES so the caller can fail the render (never a cached 404).

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  isMlsIdSlug,
  extractMlsIdFromSlug,
  extractListingIdFromSlug,
  parseAddressSlug,
} from "@/lib/listing-slug";

/** Query shape — the caller decides how much of the row to pull. */
export type ListingQueryArgs =
  | { select: Prisma.ListingSelect }
  | { include: Prisma.ListingInclude };

type ParsedAddressSlug = NonNullable<ReturnType<typeof parseAddressSlug>>;

/**
 * Validate a candidate DB row against a parsed address slug. Reads ONLY `address`
 * (present in every select/include used here). NEVER short-circuits on a sole
 * candidate — even one candidate must pass the parsed StreetDir/StreetName/Unit
 * when those were provided (Maya's audit: a lone wrong-unit row must not render).
 */
export function matchesParsedAddress(
  parsed: ParsedAddressSlug,
  candidate: { address: unknown },
): boolean {
  const addr = candidate.address as Record<string, string> | null;
  if (!addr) return false;
  const dbSn = (addr.StreetNumber || "").toLowerCase();
  const dbStreetName = (addr.StreetName || "").toLowerCase();
  const dbDirPrefix = (addr.StreetDirPrefix || "").toLowerCase();
  const dbUnit = (addr.UnitNumber || "").toLowerCase().replace(/[\s-]/g, "");
  const parsedSn = parsed.streetNumber.toLowerCase();
  const parsedStreet = (parsed.streetName || "").toLowerCase();
  const parsedDir = (parsed.streetDirPrefix || "").toLowerCase();
  const parsedUnit = (parsed.unitNumber || "").toLowerCase().replace(/[\s-]/g, "");

  if (dbSn !== parsedSn) return false;

  if (parsedDir) {
    const dirMatch = dbDirPrefix === parsedDir || dbStreetName.startsWith(parsedDir + " ");
    if (!dirMatch) return false;
  }

  if (parsedStreet) {
    const composite = [dbDirPrefix, dbStreetName].filter(Boolean).join(" ");
    const streetMatch =
      dbStreetName.includes(parsedStreet) ||
      parsedStreet.includes(dbStreetName) ||
      composite.includes(parsedStreet);
    if (!streetMatch) return false;
  }

  if (parsedUnit && dbUnit !== parsedUnit) return false;

  return true;
}

/**
 * Resolve a slug/id to the single matching Listing row, pulling only the columns
 * the caller asked for. Returns null on a CONFIRMED miss; PROPAGATES infra errors.
 *
 * `slug` is the collapsed lookup key (what `resolveLookupKey` produced) — an id, an
 * embedded-id hybrid slug, a `listing-xxx` MLS-ID slug, or an address slug.
 */
export async function findListingRow<T = Record<string, unknown>>(
  slug: string,
  keyOverride: string | undefined,
  args: ListingQueryArgs,
): Promise<T | null> {
  let dbListing: unknown = null;

  // Strategy 1 — key override or MLS-ID slug (findUnique, id uppercased/case-restored)
  const lookupId = keyOverride || (isMlsIdSlug(slug) ? extractMlsIdFromSlug(slug) : null);
  if (lookupId) {
    dbListing = await prisma.listing.findUnique({
      where: { listing_id: lookupId.toUpperCase() },
      ...args,
    } as Prisma.ListingFindUniqueArgs);
  }

  // Strategy 1b — Option-D embedded listing_id suffix on an address slug
  if (!dbListing && !isMlsIdSlug(slug)) {
    const embeddedId = extractListingIdFromSlug(slug);
    if (embeddedId) {
      dbListing = await prisma.listing.findUnique({
        where: { listing_id: embeddedId },
        ...args,
      } as Prisma.ListingFindUniqueArgs);
    }
  }

  // Strategy 2 — address slug → query by address components + validate
  if (!dbListing && !isMlsIdSlug(slug)) {
    const parsed = parseAddressSlug(slug);
    if (parsed && parsed.streetNumber && parsed.postalCode) {
      const candidates = (await prisma.listing.findMany({
        where: {
          postal_code: parsed.postalCode,
          address: { path: ["StreetNumber"], equals: parsed.streetNumber },
        },
        take: 50,
        ...args,
      } as Prisma.ListingFindManyArgs)) as { address: unknown }[];

      dbListing = candidates.find((c) => matchesParsedAddress(parsed, c)) || null;

      // Broad fallback: drop the JSON StreetNumber filter, re-apply the same validator.
      if (!dbListing && parsed.streetName) {
        const broadCandidates = (await prisma.listing.findMany({
          where: { postal_code: parsed.postalCode },
          take: 50,
          ...args,
        } as Prisma.ListingFindManyArgs)) as { address: unknown }[];
        dbListing = broadCandidates.find((c) => matchesParsedAddress(parsed, c)) || null;
      }
    }
  }

  // Strategy 3 — treat the slug itself as a listing_id (uppercased)
  if (!dbListing) {
    dbListing = await prisma.listing.findUnique({
      where: { listing_id: slug.toUpperCase() },
      ...args,
    } as Prisma.ListingFindUniqueArgs);
  }

  return (dbListing as T) ?? null;
}
