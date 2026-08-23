import { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
// `redirect` (307) is deliberately NOT imported: every redirect this route
// performs is a canonicalization, and canonicalization is permanent (308).
import { notFound, permanentRedirect } from 'next/navigation';
import { isMallanRlsReturnCopy } from '@/lib/listings/mallan-source-identity';
import { resolveReturnCopyCanonicalTarget } from '@/lib/listings/return-copy-canonical';
import AgentAvatar from '@/app/components/AgentAvatar';
import InquiryForm from '@/app/components/InquiryForm';
import PriceWithCalculator from '@/app/components/PriceWithCalculator';
import AuctionBanner from '@/app/components/AuctionBanner';
import InvestorCalculator from '@/app/components/InvestorCalculator';
import RentVsBuyCalculator from '@/app/components/RentVsBuyCalculator';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import ListingMediaGallery from '@/app/components/ListingMediaGallery';
import BackButton from '@/app/components/BackButton';
import MarketSnapshot from '@/app/components/MarketSnapshot';
import ShareButton from '@/app/components/ShareButton';
import DetailFavoriteButton from '@/app/components/DetailFavoriteButton';
import SocialShareBar from '@/app/components/SocialShareBar';
import TransitCommuteTool from '@/app/components/TransitCommuteTool';
import TransitSidebarSummary from '@/app/components/TransitSidebarSummary';
import NeighborhoodExplorer from '@/app/components/NeighborhoodExplorer';
import BuildingUnits from '@/app/components/BuildingUnits';
import PriceHistory from '@/app/components/PriceHistory';
import SimilarListings from '@/app/components/SimilarListings';
import SchoolInfo from '@/app/components/SchoolInfo';
import ListingOpenHouseRSVP from '@/app/components/ListingOpenHouseRSVP';
import { listingPageOpenHouseKey } from '@/lib/open-houses/upcoming-open-houses';
import { MobileStickyCta } from '@/app/components/listing-detail/mobile-sticky-cta';
import { findNeighborhood } from '@/lib/neighborhoods/boroughs';
import { buildAssignedAgentDisplay } from '@/lib/listings/assigned-agent';
import { resolveListingAgentInfo } from '@/lib/listings/agent-info-resolver';
import { resolveListingResult } from '@/lib/listings/listing-fetch-result';
import type { BoroughSlug } from '@/lib/types/neighborhood';
import SubwayBadge from '@/app/components/neighborhoods/SubwayBadge';
// NOTE (compute repair PR #511): the public listing page renders ONLY from the
// synchronized Neon copy (listing + listing_media). It must NEVER call the live
// Cotality/Trestle feed (OAuth, Property, Media) during an ordinary page request —
// that live dependency is what forced the route dynamic (no-store, cache MISS on
// every request). Live Cotality calls live in the sync jobs and operational tools,
// not here. See `docs/audits/compute-reduction-plan-2026-07-06.md`.
import type { PublicListingDTO } from '@/lib/idx/public-dto';
import { isMlsIdSlug, extractMlsIdFromSlug, extractListingIdFromSlug, parseAddressSlug, buildListingSlugFromDbRow } from '@/lib/listing-slug';
import { buildingHref } from '@/lib/buildings/slug';
import { geocodeListings } from '@/lib/geo/geocode';
import { cache } from 'react';
import RecentlyViewedTracker from '@/app/components/RecentlyViewedTracker';
import ListingViewTracker from '@/app/components/ListingViewTracker';
import TrackListingView from '@/app/components/TrackListingView';
import TrackListingSend from '@/app/components/TrackListingSend';

import prisma from '@/lib/prisma';
import { attachListingCacheTags, listingCacheTag } from '@/lib/cache/public-cache';
import { unstable_cache } from 'next/cache';
import { canDisplayListingAddress, decidePublicDetailAccess } from '@/lib/search/listing-access-decision';
// `classifyMediaItem`, `resolveDbListingMedia` and `toDtoMedia` are deliberately
// NOT imported here any more. Composing media — resolving, proxying, classifying,
// ordering, hero selection, dedupe and photo counting — is owned solely by
// `composeDbPublicMedia`. The getters below are read-only VIEWS over an already
// composed result, not a second composition.
import { getPhotoGallery, getFloorplans, getVideos, getVirtualTours, getPrimaryPhoto } from '@/lib/media/listing-media-resolver';
import { toPublicMediaUrl } from '@/lib/media/proxy-url-policy';
// NOTE: `composeDbPublicMedia` is deliberately NOT imported here any more. This page has exactly
// one media owner — `dbListingToPublicDTO` — which performs the composition itself. The direct
// call that used to live here was dead code whose results nothing read, and #612 wired the
// feed-authority signal into that dead call while the live DTO path kept the old behaviour.
import { resolveFeedAuthorityForPage } from '@/lib/media/feed-media-authority';
import { publicListOfficeName } from '@/lib/idx/public-attribution';
import { dbListingToPublicDTO } from '@/lib/idx/db-to-public-dto';
import type { Prisma } from '@prisma/client';
import { formatBathrooms } from '@/lib/format/bathrooms';

// EVENT-DRIVEN CACHE — no periodic regeneration.
//
// A listing detail page is generated on FIRST request and then stays in the Full Route Cache
// indefinitely. Freshness is driven entirely by the existing sync-side
// `revalidateTag('listing:{id}')` mechanism (One Cycle W1), which runs in-line with each write —
// so a page expires precisely when its data actually changes, and never merely because time passed.
//
// WHY THIS CHANGED FROM 600s. The previous value was described as a "staleness fallback", but its
// practical effect on this route was a perpetual regeneration loop: /listing/[...slug] is the
// dominant continuous Neon reader (thousands of unique crawler-driven renders), and a 600s window
// means every crawler revisit past that window re-renders an UNCHANGED listing against Neon. That
// is what kept the database from ever acquiring a real idle window. There is no longer any
// ten-minute regeneration of an unchanged listing.
//
// COLD FILL IS STILL EXPECTED, AND IS FINITE. The Full Route Cache is deployment-scoped, so each
// deployment re-fills listing URLs once on first request. That is a bounded cost per deploy, not a
// standing loop.
//
// Must stay a LITERAL for Next's static analysis.
export const revalidate = false;
export const maxDuration = 60;

// Opt this dynamic catch-all route INTO the static/ISR pipeline (compute repair,
// PR #511). Verified by controlled A/B on the Preview: dynamic-segment routes that
// export generateStaticParams (e.g. /manhattan/[neighborhood]) render as
// PRERENDER→HIT, while /listing/[...slug] — which had NO generateStaticParams —
// rendered fully dynamic (Cache-Control: private,no-store; X-Vercel-Cache: MISS on
// EVERY request) regardless of `revalidate`. That dynamic render, not the (now
// removed) live feed, is what kept Neon ~98% active.
//
// We prerender NOTHING at build (return []): no build-time DB query, and no need to
// compliance-gate a prerendered set. With dynamicParams=true (the default), each
// listing is rendered on-demand on first request and then CDN/ISR-cached for
// `revalidate` seconds (MISS→HIT). Display gates still run per-render in fetchFromDB.
export const dynamicParams = true;
export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  return [];
}

/**
 * Public media URL policy for the detail route.
 *
 * DELEGATES to the canonical `proxyTrestleUrl` — this route no longer owns a
 * second, independent implementation.
 *
 * THE DEFECT THIS REPLACES: the previous local version tested the WHOLE string
 * for `cotality.com` / `corelogic.com`. But `resolveDbListingMedia` has ALREADY
 * proxied every relational Cotality row, so the hostname is still present inside
 * the encoded `url=` parameter of an already-proxied relative URL. It matched,
 * and wrapped a second time:
 *
 *   /api/media/proxy?url=%2Fapi%2Fmedia%2Fproxy%3Furl%3Dhttps%253A%252F%252F...
 *
 * The proxy route requires an ABSOLUTE URL on an approved host. The nested value
 * is relative, so the allowlist rejected it and returned 403 — proven live on
 * production 2026-08-06 (nested -> 403, single-proxied -> 200, 1,356,147 bytes).
 *
 * The R2 hero carries no `cotality.com` substring, so it alone survived. On a
 * post-policy listing (1 R2 hero + N Cotality-only rows, 6.3% mirrored since
 * 2026-07-24) that renders as "67 photos" with exactly one usable image — the
 * reported symptom, with no truncation anywhere in the chain.
 *
 * `proxyTrestleUrl` is idempotent by construction: it parses with `new URL()`,
 * which throws on an already-proxied relative URL, and returns it unchanged.
 */
const proxyDetailMediaUrl = toPublicMediaUrl;

interface LastSaleInfo {
  closePrice: number;
  closeDate: string;
  sqft: number;
  source: 'trestle' | 'acris';
}

// Last-sale enrichment (fetchLastUnitSale via live Trestle + fetchLastSaleFromACRIS
// via NYC ACRIS) was REMOVED in the compute repair (PR #511). On the DB-only render
// path it produced no public output anyway: the Trestle result is blocked for the
// public audience by resolveVisibility, and the ACRIS lookup requires tax block/lot
// that the synchronized DB row does not carry (fetchFromDB returns tax=null). The
// `LastSaleInfo` type is retained because the render still types `lastUnitSale`,
// which is now always null (the "Last Sale" section stays hidden, as before).

type Props = {
  // Catch-all route — params.slug can be:
  //   ['sl-0004']                            (legacy ID-only — redirects)
  //   ['333-east-46th-street-...-sl-0004']   (legacy hybrid — redirects)
  //   ['333-east-46th-street-...', 'sl-0004'] (canonical)
  params: Promise<{ slug: string[] }>;
};

// Canonical URL build + parse — single source of truth at
// lib/listing-canonical-url.ts. `resolveLookupKey` is the inverse of
// `buildCanonicalListingPath`: it collapses the catch-all `[...slug]` segments
// back into a single lookup key and restores the stored uppercase casing of the
// trailing listing id (the canonical URL lowercases it, but Trestle/Prisma
// lookups are case-sensitive — the 2026-06-02 sitewide P0 fix).
import { buildCanonicalListingPath, resolveLookupKey, isBareListingIdSegment } from '@/lib/listing-canonical-url';

/** County → Borough mapping for NYC */
const COUNTY_TO_BOROUGH: Record<string, string> = {
  'new york': 'Manhattan',
  'kings': 'Brooklyn',
  'queens': 'Queens',
  'bronx': 'Bronx',
  'richmond': 'Staten Island',
};

function countyToBorough(county: string): string {
  return COUNTY_TO_BOROUGH[county.toLowerCase()] || county;
}

/** Extra fields from Trestle raw record (not in PublicListingDTO) */
interface TrestleExtraFields {
  taxBlock: string | null;
  taxLot: string | null;
}

// rawToDTO (raw Trestle record → PublicListingDTO) was REMOVED in the compute
// repair (PR #511): it was only used by the live Trestle-direct fallback, which no
// longer exists. The DB path (fetchFromDB) builds the DTO directly from the
// synchronized Neon row, including the FARE move-in fee disclosure via resolveMoveInFees.

/** Combined listing result: DTO + extra fields (tax is null on the DB-only path). */
/**
 * A resolved listing request has exactly TWO shapes, and the type says so.
 *
 * The redirect outcome previously masqueraded as a listing:
 *   `listing: { id } as unknown as PublicListingDTO`
 * `ListingPage` narrowed on `canonicalRedirect` first and worked, but
 * `generateMetadata` consumes the SAME cached result and dereferenced
 * `listing.listPrice` / `listing.address` / `listing.media` before any redirect
 * could run — a hard 500 on every return-copy URL with a proven local twin
 * (production SHA 881182f9).
 *
 * Guarding the one consumer would have left the invalid state in the type
 * system for the next consumer to trip over. A discriminated union removes the
 * lie instead: a redirect result CANNOT expose `.listing`, and a listing result
 * ALWAYS carries a complete DTO. TypeScript now forces every consumer to narrow.
 */
type ListingFetchResult = ListingFetchListing | ListingFetchRedirect;

interface ListingFetchListing {
  kind: 'listing';
  listing: PublicListingDTO;
  tax: TrestleExtraFields;
  rawStreetName?: string;
}

/**
 * The requested row is a Mallan RLS return-copy with exactly one proven local
 * physical-unit twin (CHARTER Section 1A), so the canonical URL is the LOCAL
 * listing's.
 *
 * Carried as DATA rather than by calling a redirect inside `fetchFromDB` on
 * purpose. Next's redirect helpers signal by THROWING, and `fetchFromDB` wraps
 * its body in a try/catch whose contract is "anything thrown here is an
 * infrastructure error"; `fetchListing` then memoizes through React `cache()`,
 * and `generateMetadata` calls the same function. Throwing from in there would
 * produce a misleading infra log and a cached throw on a path that is not the
 * render. The page component performs the redirect.
 *
 * NOTE there is deliberately NO `listing` field: a redirect has no DTO, and the
 * absence is what makes the old 500 unrepresentable.
 */
interface ListingFetchRedirect {
  kind: 'redirect';
  canonicalRedirect: string;
  /**
   * The RETURN-COPY's own listing_id. Retained because the previous fabricated
   * DTO incidentally supplied it to `attachListingCacheTags`, so the source
   * row's cache tag was attached to the render. Dropping it would silently
   * remove that invalidation.
   */
  sourceListingId: string;
}

/**
 * DB-first lookup: check Prisma DB for listing before hitting Trestle.
 * Converts DB record to PublicListingDTO. Returns null if not found.
 */
// PR 4 reader swap: pull the relational `listing_media` rows alongside every
// detail-page DB lookup so the resolver can prefer them over the legacy
// `Listing.media` JSON. Selected columns mirror ListingMediaTableRow exactly
// so we don't over-fetch R2 timestamps, retry counters, or audit fields.
const LISTING_MEDIA_INCLUDE = {
  listing_media: {
    // ACTIVE ROWS ONLY — the gallery payload carries no deleted or replaced
    // media. This page previously fetched EVERY status and let the resolver
    // filter, which transferred soft-deleted and superseded rows on every
    // detail render purely to answer an existence question.
    //
    // Existence is now answered by `_count` below instead. Those two changes
    // are ATOMIC and must never be separated: `_count` supplies the ALL-STATUS
    // signal that the row array can no longer provide. Narrowing this `where`
    // WITHOUT `_count` would make an all-deleted listing look like "no rows
    // ever imported" and resurrect soft-deleted CRM media through the legacy
    // JSON fallback — Codex media P0 finding #2, the exact regression the old
    // all-status fetch existed to prevent.
    //
    // Same contract `/api/listings` already uses (route.ts:393-412).
    where: { status: 'active' as const },
    orderBy: [{ order: 'asc' as const }, { id: 'asc' as const }],
    select: {
      media_url_original: true,
      media_url_cached: true,
      media_type: true,
      media_category: true,
      media_classification: true,
      order: true,
      preferred_photo_yn: true,
      status: true,
      media_key: true, // needed to tell CRM-owned rows (crm: prefix) from Trestle rows
    },
  },
  // ALL-STATUS existence signal. A Prisma aggregate subquery inside the SAME
  // query — not a per-listing round-trip, so no N+1. This is what lets the
  // reader distinguish "no row ever imported" (legacy fallback permitted) from
  // "rows existed but all deleted" (authoritative empty).
  _count: { select: { listing_media: true } },
} satisfies Prisma.ListingInclude;

async function fetchFromDB(slug: string, keyOverride?: string): Promise<ListingFetchResult | null> {
  try {
    let dbListing = null;

    // Strategy 1: Key override or MLS-ID slug
    const lookupId = keyOverride || (isMlsIdSlug(slug) ? extractMlsIdFromSlug(slug) : null);
    if (lookupId) {
      // Canonical URLs lowercase the listing id (e.g. /listing/.../sl-0004 and
      // the `listing-sl-0004` MLS-ID-slug form); listing_id is stored uppercase
      // (SL-0004) and findUnique is case-SENSITIVE. All REBNY/CRM ids are
      // uppercase, so normalizing to upper recovers the exact id and keeps the
      // unique-index lookup. Without this the emitted canonical URL 404s.
      // (Codex review, PR #272.)
      dbListing = await prisma.listing.findUnique({
        where: { listing_id: lookupId.toUpperCase() },
        include: LISTING_MEDIA_INCLUDE,
      });
    }

    // Strategy 1b (PR-FE.2 Option D, 2026-05-15): listing_id appended to
    // address slug (e.g. `400-east-90th-street-...-rls20061539`). When the
    // address-suffixed listing_id resolves to a real DB row, use it
    // directly — this is the path that disambiguates the 3-brokerage
    // co-listing case where every card on Buy search uses an
    // address-derived path but each card needs to open its own
    // distinct listing's detail page.
    //
    // Falls through to Strategy 2 (address parse) when the extracted id
    // isn't in the DB — guards against typos in shared URLs and
    // preserves the existing address-fallback semantics.
    if (!dbListing && !isMlsIdSlug(slug)) {
      const embeddedId = extractListingIdFromSlug(slug);
      if (embeddedId) {
        // A real miss returns null (→ falls through to the address-parse strategy);
        // a Prisma/Neon error PROPAGATES (it must not be swallowed into a not-found,
        // which would become a cached 404 under ISR). No .catch here.
        dbListing = await prisma.listing.findUnique({
          where: { listing_id: embeddedId },
          include: LISTING_MEDIA_INCLUDE,
        });
      }
    }

    // Strategy 2: Address slug → query by address components
    if (!dbListing && !isMlsIdSlug(slug)) {
      const parsed = parseAddressSlug(slug);
      if (parsed && parsed.streetNumber && parsed.postalCode) {
        // First try: exact match on StreetNumber + PostalCode
        const candidates = await prisma.listing.findMany({
          where: {
            postal_code: parsed.postalCode,
            address: {
              path: ['StreetNumber'],
              equals: parsed.streetNumber,
            },
          },
          take: 50,
          include: LISTING_MEDIA_INCLUDE,
        });

        // Single validator used for BOTH the narrow candidate set and the
        // broad postal-code fallback. NEVER short-circuit on candidate.length
        // === 1 — Maya's audit: "even one candidate must pass parsed
        // StreetDirPrefix/StreetName/UnitNumber when provided." Returning the
        // sole candidate without validation would render the wrong listing
        // if a different unit at the same address number lived alone in the
        // result set.
        const matchesParsedAddress = (c: { address: unknown }): boolean => {
          const addr = c.address as Record<string, string> | null;
          if (!addr) return false;
          const dbSn = (addr.StreetNumber || '').toLowerCase();
          const dbStreetName = (addr.StreetName || '').toLowerCase();
          const dbDirPrefix = (addr.StreetDirPrefix || '').toLowerCase();
          const dbUnit = (addr.UnitNumber || '').toLowerCase().replace(/[\s-]/g, '');
          const parsedSn = parsed.streetNumber.toLowerCase();
          const parsedStreet = (parsed.streetName || '').toLowerCase();
          const parsedDir = (parsed.streetDirPrefix || '').toLowerCase();
          const parsedUnit = (parsed.unitNumber || '').toLowerCase().replace(/[\s-]/g, '');

          // StreetNumber must exactly match.
          if (dbSn !== parsedSn) return false;

          // StreetDirPrefix must match (either separate column OR baked into
          // StreetName as "E 46th"). Skip when parsed slug has no direction.
          if (parsedDir) {
            const dirMatch = dbDirPrefix === parsedDir
              || dbStreetName.startsWith(parsedDir + ' ');
            if (!dirMatch) return false;
          }

          // StreetName fuzzy match: either direction-bidirectional inclusion
          // or composite match. Skip when slug has no street name (rare).
          if (parsedStreet) {
            const composite = [dbDirPrefix, dbStreetName].filter(Boolean).join(' ');
            const streetMatch = dbStreetName.includes(parsedStreet)
              || parsedStreet.includes(dbStreetName)
              || composite.includes(parsedStreet);
            if (!streetMatch) return false;
          }

          // UnitNumber must match when the parsed slug has a unit. Same-
          // address, different-unit listings would otherwise collide.
          if (parsedUnit && dbUnit !== parsedUnit) return false;

          return true;
        };

        // Apply validator to the narrow candidate set (including length === 1).
        dbListing = candidates.find(matchesParsedAddress) || null;

        // Broad fallback: drop the JSON StreetNumber filter, scan all rows in
        // the postal code, and re-apply the SAME validator. This catches rows
        // where the address JSON uses an unexpected casing/shape.
        if (!dbListing && parsed.streetName) {
          const broadCandidates = await prisma.listing.findMany({
            where: { postal_code: parsed.postalCode },
            take: 50,
            include: LISTING_MEDIA_INCLUDE,
          });
          dbListing = broadCandidates.find(matchesParsedAddress) || null;
        }
      }
    }

    // Strategy 3: Treat slug as listing_id. The canonical two-segment URL
    // passes the lowercased id as the trailing segment (e.g. `.../sl-0004`),
    // so normalize to uppercase to match the case-sensitive stored listing_id.
    // (An address slug that reaches here simply won't match a listing_id either
    // way, so uppercasing is safe.) (Codex review, PR #272.)
    if (!dbListing) {
      // A real miss returns null (→ not-found); a Prisma/Neon error PROPAGATES rather
      // than being swallowed into a not-found (which would cache a 404 under ISR).
      dbListing = await prisma.listing.findUnique({
        where: { listing_id: slug.toUpperCase() },
        include: LISTING_MEDIA_INCLUDE,
      });
    }

    if (!dbListing) return null;

    // ── ONE PUBLICATION DECISION, SHARED BY EVERY CONSUMER OF THIS FETCH ──
    //
    // Publication eligibility is decided HERE — inside the shared resolution
    // path, on the RAW DB row, BEFORE any PublicListingDTO is built, returned
    // or written to the persistent Data Cache. `generateMetadata`, the page
    // component and the Full Route Cache all consume this one result, so they
    // cannot disagree about whether a listing is public.
    //
    // WHY IT MOVED OFF THE PAGE COMPONENT. The page used to apply the status
    // half by itself, after this function had already returned a complete DTO.
    // `generateMetadata` calls the SAME memoized resolver and runs FIRST, so a
    // Draft still produced a title, description, price, street address, public
    // remarks, canonical URL and OpenGraph/Twitter cards before the page ever
    // reached its own `notFound()`. A visibility rule enforced in one of two
    // consumers is not a rule, it is a race — and under `revalidate = false`
    // the leaked metadata was cacheable.
    //
    // WHY IT COULD NOT STAY SPLIT, EVEN IN PRINCIPLE. The page only holds the
    // DTO, whose `status` is a DISPLAY LABEL (`db-to-public-dto` maps
    // `ActiveUnderContract` → `'Active Under Contract'`). Gating on it meant
    // round-tripping a label back through `normalizeStatus` and depending on
    // that map staying reversible — adding e.g. `Pending: 'In Contract'` would
    // silently 404 every Pending listing. Here the raw `dbListing.status` and
    // every gate column are in hand, so the decision is made on the real values.
    //
    // SOURCE-CLASS AWARE, because the two classes have different contracts:
    // RLS-backed rows must satisfy the REBNY/RLS distribution gates, while
    // website-only rows carry `idx_display_yn: false` BY CONSTRUCTION
    // (`computeGateColumns`: `idx_display_yn = rls_eligible && …`) and are
    // therefore governed by Mallan's own publication contract, which is
    // status-borne. See `decidePublicDetailAccess`.
    //
    // Placed at exactly the point the previous distribution-gate check
    // occupied — before return-copy canonicalization — so a row that may not be
    // served publicly does not even confirm its existence via a redirect. For
    // return-copies this is behaviour-identical: they are Cotality rows, so the
    // RLS gate already decided them here.
    const access = decidePublicDetailAccess(dbListing);
    if (!access.retrievable) {
      return null;
    }
    const isRlsBacked = access.sourceClass === 'rls-backed';

    // MALLAN RLS RETURN-COPY CANONICALIZATION (CHARTER Section 1A).
    //
    // Public suppression keeps the returned Cotality twin out of search,
    // sitemap, agent pages, comps, autocomplete and the building manifest — but
    // a DIRECT hit on its own URL bypassed all of that, leaving one physical
    // unit publicly reachable at two URLs with the wrong attribution.
    //
    // Exactly one PROVEN local twin -> redirect to the local canonical URL.
    // Zero or several -> fail closed (404). Identity comes from the repo's
    // existing physical-unit key, which requires a UnitNumber, so different
    // units are never merged. The stored return-copy row is never touched.
    //
    // The candidate query runs ONLY for a verified return-copy — a rare, already
    // suppressed URL — so it adds no cost to normal detail renders. It is
    // deliberately uncapped: a `take` could hide the very twin being sought and
    // silently downgrade a redirect into a 404.
    if (isMallanRlsReturnCopy(dbListing)) {
      const localCandidates = await prisma.listing.findMany({
        where: {
          OR: [
            { listing_id: { startsWith: 'SL-' } },
            { listing_id: { startsWith: 'RL-' } },
            { rls_eligible: false },
          ],
        },
        select: {
          listing_id: true,
          rls_eligible: true,
          list_office_mls_id: true,
          address: true,
          borough: true,
          // Gate columns `isAddressDisplayable` reads, so the twin's slug obeys
          // the same address-suppression rule the DTO applies.
          internet_address_display_yn: true,
          internet_entire_listing_display_yn: true,
          idx_display_yn: true,
          status: true,
        },
      });
      // `slug` is DERIVED, not a column. Use the shared owner so the redirect
      // target is byte-identical to the URL the DTO/sitemap emit for that row.
      const target = resolveReturnCopyCanonicalTarget(
        dbListing,
        localCandidates.map((c) => ({ ...c, slug: buildListingSlugFromDbRow(c) })),
      );
      if (target.kind === 'fail-closed') return null;
      if (target.kind === 'redirect') {
        // No fabricated DTO — see ListingFetchRedirect. The `sourceListingId`
        // preserves the cache tag the old fake `listing.id` supplied.
        return {
          kind: 'redirect',
          canonicalRedirect: target.path,
          sourceListingId: dbListing.listing_id,
        };
      }
    }

    // Convert DB record to PublicListingDTO
    const addr = (dbListing.address as Record<string, string>) || {};
    const features = (dbListing.features as Record<string, unknown>) || {};
    // PR 4 reader swap: prefer the relational `listing_media` rows fetched
    // alongside this listing. When present, R2-cached URLs are used
    // directly (faster, no Trestle proxy). When absent (un-synced row or
    // mid-sync race), fall back to the legacy `Listing.media` JSON so no
    // detail page renders blank. Both paths flow through the same
    // classify→sort pipeline in `listing-media-resolver`.
    const listingMediaRows = Array.isArray(dbListing.listing_media) ? dbListing.listing_media : [];
    const rawMedia = Array.isArray(dbListing.media) ? (dbListing.media as Record<string, unknown>[]) : [];
    // Media is sourced ONLY from the synchronized Neon copy via the SHARED DB-only
    // policy `resolveDbListingMedia`: resolve the relational `listing_media` rows
    // (R2-cached URLs) first, and fall back to the legacy `Listing.media` JSON ONLY
    // when they yield zero USABLE media. The fallback is keyed on the COTALITYLVED
    // active-media count + listing type — NOT on raw `rows.length`. That closes the
    // 2026-07-16 card/detail P0: a third-party IDX/RLS listing whose relational rows
    // are all deleted/replaced (so they resolve to []) now falls back to its
    // Cotality-sourced JSON photos, exactly as the card does — instead of stranding
    // on the gray placeholder. CRM-exclusive deletion stays authoritative (SL-/RL- /
    // no mls_id / rls_eligible === false → no JSON resurrection).
    //
    // Still DB-ONLY: the former live-Cotality "no photos in DB" fallback
    // (fetchListingMedia) was REMOVED in the compute repair (PR #511) and is NOT
    // reintroduced here — `resolveDbListingMedia` touches only the two synchronized
    // Neon sources. `legacyMapUrl` is identity because proxyDetailMediaUrl is applied
    // downstream (below) so legacy Cotality URLs are proxied exactly once.
    // Media ownership follows the canonical `isMallanExclusiveListing` signal —
    // SL-/RL- listing_id OR rls_eligible === false, NEVER agent_id (syncAgentHistory
    // stamps agent_id on third-party IDX rows).
    //
    // THERE IS EXACTLY ONE MEDIA OWNER ON THIS PAGE: `dbListingToPublicDTO`, below. It computes
    // `hadRelationalRows` itself from the ALL-STATUS `_count` and calls `composeDbPublicMedia`.
    //
    // A second, direct `composeDbPublicMedia` call used to sit here. Its results (`mediaArr`,
    // `canonicalPhotoCount`) were read by NOTHING — dead since before #612, which then added the
    // feed-authority signal to that dead call and left the live DTO path untouched. Production
    // proof on 3a37c170 caught it: RLS20082303 still rendered its 20 stale legacy photos because
    // the page computed the right answer and then handed rendering to a path that never saw it.
    // Removed rather than left as a second media owner — two owners is how they diverged.
    //
    // FEED-authority signal (lib/media/feed-media-authority.ts): a third-party listing whose feed
    // rows were materialized and then tombstoned is authoritatively EMPTY, so replaying its legacy
    // JSON republishes photos the provider deleted. ONE grouped query, only when the decision is
    // genuinely ambiguous — skipped for Mallan-owned listings, for listings already carrying an
    // ACTIVE feed row, and when there is no legacy payload to gate. A failed lookup PROPAGATES; it
    // must never degrade into "no feed history", which would permit the stale replay.
    const feedAuthority = await resolveFeedAuthorityForPage(prisma, [
      {
        ctx: { listingId: dbListing.listing_id, rlsEligible: dbListing.rls_eligible },
        tableRows: listingMediaRows,
        hasLegacyPayload: Array.isArray(rawMedia) && rawMedia.length > 0,
      },
    ]);

    // Phase D step 3: agent_info removed from the Prisma client. Typed columns win for the
    // contact card (typed: dbListing + resolvedAgent below); the legacy JSON base is now empty.
    const agentInfo: Record<string, string> = {};
    // Phase B: typed-first attribution (typed columns win, agent_info JSON fallback).
    // dbListing uses `include` so all typed scalar columns are present.
    const resolvedAgent = resolveListingAgentInfo(dbListing);
    // Mallan-exclusive assigned-agent enrichment. The headshot + license title
    // live on the AGENT record (not in agent_info JSON), so load the listing's
    // OWN linked agent to surface them on the contact card. Generic by
    // agent_id — never hardcoded to a person. Third-party IDX/RLS rows are not
    // SL-/RL-/website-only AND carry agent_id=null, so this never loads or
    // exposes another brokerage's agent data.
    const isMallanExclusiveListing =
      dbListing.listing_id?.startsWith('SL-') ||
      dbListing.listing_id?.startsWith('RL-') ||
      dbListing.rls_eligible === false;
    const assignedAgentRecord =
      isMallanExclusiveListing && dbListing.agent_id != null
        ? await prisma.agent
            .findUnique({
              where: { id: dbListing.agent_id },
              select: {
                full_name: true,
                email: true,
                phone: true,
                photo: true,
                title: true,
                license_type: true,
                public_slug: true,
              },
            })
            .catch(() => null)
        : null;
    // Merge agent_info (manual/display wins) with the Agent record (photo/title/
    // slug) into the contact-card payload. null for third-party IDX/RLS rows.
    const assignedAgentDisplay = buildAssignedAgentDisplay({
      isMallanExclusive: Boolean(isMallanExclusiveListing),
      agentInfo,
      agentRecord: assignedAgentRecord,
      // Phase B: typed columns win over agent_info JSON for the gated exclusive card.
      typed: dbListing,
    });
    // S1 (#415): PublicRemarks now reads features → raw_data. The DB `compliance`
    // column's PublicRemarks is 100% redundant with raw_data (S1 probe:
    // only_in_compliance = 0; raw_data is a superset), and the redundant Trestle
    // `compliance` copy is being retired (the mapper now writes `{}`). Do NOT read
    // the compliance column for render. (CRM/syndication-authored compliance keys
    // are unrelated to render and are written directly by those routes.)
    const rawData = (dbListing.raw_data as Record<string, unknown>) || {};
    // Address suppression (Codex PR #274 — respect seller opt-outs):
    // website-only listings (rls_eligible === false → isRlsBacked false; Mallan's
    // own website-only exclusives like SL-0004) show their address. RLS-backed
    // listings (rls_eligible !== false), INCLUDING any RLS-eligible SL-/RL-
    // exclusive, RESPECT the IDX address opt-out so an explicit seller address
    // suppression is never overridden. (Earlier draft unconditionally bypassed by
    // SL-/RL- prefix — that exposed RLS-eligible opt-out addresses; reverted.)
    const suppressAddress = isRlsBacked && !canDisplayListingAddress(dbListing);

    // ── ONE PUBLIC DTO OWNER ────────────────────────────────────────────
    // The base public DTO now comes from the canonical builder instead of being
    // rebuilt here. The detail query already supplies exactly what it consumes:
    // the full Listing row, ACTIVE listing_media, and the all-status _count.
    //
    // The ~130 lines this replaces had DRIFTED from the canonical owner, and the
    // differences were stale rather than intentional: raw `status` instead of
    // the canonical display status, `originalListPrice` pinned to the CURRENT
    // list price, `closePrice` hardcoded null, contract/modification dates read
    // from the features JSON instead of the typed columns, and a separately
    // composed source/compliance block. Deleting them is the fix; reproducing
    // them would have preserved the drift.
    // THE media owner for this page. The feed-authority signal MUST be threaded here — this is the
    // DTO that drives both rendering and metadata. Passing it only to a separate composition (as
    // #612 did) computes the right answer and then discards it.
    const baseDto = dbListingToPublicDTO(dbListing, {
      hadFeedRelationalRows: feedAuthority.get(dbListing.listing_id),
    });

    const dto: PublicListingDTO = {
      ...baseDto,
      // DETAIL-ONLY enrichment. The page shows a richer Mallan-owned agent card
      // (photo, title, license type, public slug) than the shared builder emits.
      // Exposure stays gated by the CANONICAL base: if the base DTO withheld
      // `_assignedAgent` — as it does for every third-party IDX/RLS row — the
      // detail page may not invent one. One policy owner, not two.
      ...(assignedAgentDisplay && baseDto._assignedAgent
        ? { _assignedAgent: assignedAgentDisplay }
        : {}),
    };

    return {
      kind: 'listing',
      listing: dto,
      tax: { taxBlock: null, taxLot: null },
      rawStreetName: addr.StreetName || '',
    };
  } catch (err) {
    // Infrastructure error (Prisma/Neon timeout, connection reset, compute-quota):
    // PROPAGATE. Converting it to null would let the page render notFound(), and under
    // ISR that 404 would be cached in place of a valid listing until the next good
    // revalidation. A CONFIRMED miss and a display-gate rejection return null ABOVE via
    // explicit `return null`; anything reaching here is an infra/unexpected error.
    // (Log the Prisma code / error name only — never the connection string.)
    console.error(
      '[listing:fetchFromDB] database/infrastructure error — propagating (not a 404):',
      (err as { code?: string })?.code ?? (err instanceof Error ? err.name : 'unknown'),
    );
    throw err;
  }
}

/**
 * Fetch a single listing for the public page — DB-ONLY (compute repair, PR #511).
 *
 * The listing is served EXCLUSIVELY from the synchronized Neon copy (Prisma), via
 * fetchFromDB. There is deliberately NO live Cotality/Trestle fallback: the former
 * Trestle-direct fetch and the /api/listings/:id proxy fallback were removed because
 * ANY live-feed call reachable from the render path forces the route dynamic
 * (Cache-Control: no-store, X-Vercel-Cache: MISS on every request), which kept Neon
 * ~98% active. IDX sync (page revalidate=300) keeps the DB fresh; a listing absent
 * from the DB is treated as not-found → 404, which the route negative-caches.
 *
 * COMPLIANCE: all display gates + address suppression run inside fetchFromDB. Address
 * slugs are NEVER generated for listings where InternetAddressDisplayYN=false (those
 * use MLS-ID slugs), so no address leaks through the URL. `keyOverride` is retained
 * for signature compatibility; the ?key= debug override was already removed upstream.
 *
 * ERROR SEMANTICS: fetchFromDB returns null ONLY on a confirmed miss / display-gate
 * rejection, and THROWS on infrastructure errors (Prisma/Neon timeout, connection,
 * compute-quota). This function does NOT catch — infra errors propagate so a transient
 * DB failure is never mistaken for "listing not found" (which under ISR would cache a
 * 404 over a valid listing). The page resolves through `resolveListingResult` and only
 * calls notFound() on a genuine null.
 */
/**
 * The listing id derivable from the slug WITHOUT touching the database — the persistent Data Cache
 * key.
 *
 * WHY NOT `resolveLookupKey`: that returns the LAST slug segment, which is the id for the canonical
 * two-segment form (`/listing/<address-slug>/<ID>`) but the SLUG ITSELF for hybrid and MLS-ID forms.
 * Keying on it would give the same listing several cache entries and defeat the collapse.
 *
 * These three URL shapes therefore share ONE entry:
 *   /listing/400-east-90th-street/RLS20061539      canonical two-segment
 *   /listing/400-east-90th-street-rls20061539      legacy hybrid (embedded id)
 *   /listing/listing-sl-0004                       MLS-ID slug form
 * Uppercased because `listing_id` is stored uppercase and the unique index is case-sensitive.
 *
 * `null` when NO id is derivable (a pure address-parse slug). Those deliberately bypass the
 * persistent cache and read live: without an id we could neither key them without duplicating
 * entries nor tag them correctly, and an untaggable persistent entry is a stale-forever hazard.
 */
function derivedListingIdFromSlug(slug: string, keyOverride?: string): string | null {
  if (keyOverride) return keyOverride.toUpperCase();
  // BARE ID FIRST — this is the dominant shape and the easiest to miss. The canonical two-segment
  // URL `/listing/<address-slug>/<ID>` is collapsed by resolveLookupKey to just the ID, and
  // `extractListingIdFromSlug` only matches an id as the SUFFIX of a longer slug, so it returns
  // null here. Omitting this check made the most common URL form bypass the cache entirely.
  if (isBareListingIdSegment(slug)) return slug.toUpperCase();
  if (isMlsIdSlug(slug)) {
    const id = extractMlsIdFromSlug(slug);
    return id ? id.toUpperCase() : null;
  }
  const embedded = extractListingIdFromSlug(slug);
  return embedded ? embedded.toUpperCase() : null;
}

const fetchListing = cache(async function fetchListing(slug: string, keyOverride?: string): Promise<ListingFetchResult | null> {
  // PERSISTENT DATA CACHE — the layer that actually removes the dominant Neon read.
  //
  // `revalidate = false` on the route only removes REPEAT renders of the same URL. Production
  // evidence on the #614 deployment: 339 listing executions across 336 DISTINCT paths — ~99% of
  // renders are unique cold URLs, each executing fetchFromDB() once. Killing the repeat clock
  // therefore could not reduce the dominant read; the Full Route Cache is also deployment-scoped,
  // so every deploy re-cold-fills. This entry survives BOTH, keyed by listing id rather than URL.
  //
  // What is cached is the NORMALIZED `ListingFetchResult` — fetchFromDB has already run
  // dbListingToPublicDTO (this file:627), so no Prisma Decimal/Date/BigInt ever enters the cache.
  // That is the #523 -> #528 failure class, and it stays closed: the raw row is never cached.
  //
  // `revalidate: false` + `listingCacheTag(id)` means expiry is EVENT-DRIVEN by the SAME tag the
  // sync already revalidates. No new invalidation system.
  //
  // fetchFromDB THROWS on infrastructure errors and returns null only on a confirmed miss.
  // unstable_cache does not cache a rejected promise, so a transient Neon failure still propagates
  // and is never frozen as a 404 — the invariant fetchFromDB's own contract depends on.
  const dataCacheId = derivedListingIdFromSlug(slug, keyOverride);
  const result = dataCacheId
    ? await unstable_cache(
        () => fetchFromDB(slug, keyOverride),
        ['listing-detail-data-v1', dataCacheId],
        { tags: [listingCacheTag(dataCacheId)], revalidate: false },
      )()
    : await fetchFromDB(slug, keyOverride);

  // One Cycle W1 (Codex P2 fix): attach this listing's cache tags to the
  // CURRENT render, so the sync's revalidateTag('listing:{id}') evicts this
  // page's ISR HTML — for every URL variant that funnels through this seam
  // (id-form, canonical address slug, legacy aliases). The prisma reads
  // above stay LIVE inside the ISR render (no Decimal/Date/BigInt
  // serialization — the #523→#528 lesson); the tag-attach entry alone puts
  // `listing:{id}` (+ building tag when a REAL address is displayable) on
  // the route's cache dependency graph (see attachListingCacheTags for the
  // verified Next 16.2.4 semantics). Fail-open: attach errors never block
  // the render; the 30-min ISR window remains the fallback.
  if (result?.kind === 'listing' && result.listing?.id) {
    await attachListingCacheTags(String(result.listing.id), {
      streetNumber: result.listing.address?.streetNumber,
      streetName: result.listing.address?.streetName,
      postalCode: result.listing.address?.postalCode,
    });
  } else if (result?.kind === 'redirect') {
    // PRESERVED, not added: the old fabricated DTO carried the return-copy's
    // listing_id into this call, so `listing:{id}` was already on the render's
    // dependency graph. Address atoms were undefined then and stay omitted now
    // — the building/manifest tag was never attached on this path, and this
    // hotfix deliberately does not broaden cache behavior.
    await attachListingCacheTags(result.sourceListingId, {});
  } else if (dataCacheId) {
    // NEGATIVE PATH — a confirmed miss (null) under `revalidate = false`.
    //
    // Without this the 404 would be a FOREVER cache: the route entry never self-expires and the
    // persistent data entry holds `null` indefinitely, so a listing later created/synced under this
    // id could never displace it. Attaching `listing:{id}` to the RENDER puts the negative Full
    // Route Cache entry on the same dependency graph as the persistent `null` data entry (which
    // already carries that tag), so ONE `revalidateTag('listing:{id}')` from the sync clears both
    // the cached 404 and the cached null the moment the listing exists.
    //
    // No new invalidation system: this is the tag the sync already revalidates on every write.
    await attachListingCacheTags(dataCacheId, {});
  }
  return result;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const slugParts = Array.isArray(slug) ? slug : (slug ? [slug as unknown as string] : []);
  const id = resolveLookupKey(slugParts);

  // Infra errors propagate (see resolveListingResult): a transient DB failure must not
  // masquerade as "not found". Only a genuine null (confirmed miss) yields the fallback.
  const result = await resolveListingResult(() => fetchListing(id));

  if (!result) {
    // Covers BOTH a genuine miss and a row that is not publication-eligible —
    // `fetchListing` cannot tell them apart by design, because a non-public
    // listing must be indistinguishable from a non-existent one. No title,
    // address, price, remarks, image or canonical URL is derived from the row.
    //
    // `noindex` is deliberate rather than redundant: the page 404s, but a Draft
    // that was publicly retrievable before this fix may already be IN the index,
    // and an explicit directive de-indexes it faster than a bare 404.
    return {
      title: 'Listing Not Found | Mallan Real Estate',
      robots: { index: false, follow: false },
    };
  }

  // NARROW BEFORE DEREFERENCING. A return-copy resolves to a redirect outcome
  // that has no DTO; reading listPrice/address/media here is what produced the
  // production 500. Emit only the canonical signal pointing at the LOCAL
  // listing — the page redirects, so this metadata is transitional and must not
  // invent a title, price or address from a listing that does not exist here.
  if (result.kind === 'redirect') {
    return {
      title: 'Mallan Real Estate',
      robots: { index: false, follow: true },
      alternates: { canonical: `https://mallan.nyc${result.canonicalRedirect}` },
    };
  }

  const listing = result.listing;
  const isRental = listing.listingType === 'rent';
  const priceDisplay = isRental
    ? `$${listing.listPrice.toLocaleString()}/mo`
    : `$${listing.listPrice.toLocaleString()}`;
  const fullAddress = listing.address.streetName === 'Address Undisclosed'
    ? 'Address Undisclosed'
    : `${listing.address.streetNumber} ${listing.address.streetName}`.trim() + (listing.address.unitNumber ? `, #${listing.address.unitNumber}` : '');
  // Canonical URL — use the shared helper so the og:url, twitter URL, and
  // alternates.canonical all match the separated /listing/{address}/{id}
  // route that the page itself redirects to. Without this, Google would see
  // conflicting canonical signals (308 to one URL, meta canonical to another).
  const canonicalPath = buildCanonicalListingPath({ slug: listing.slug || '', id: listing.id || '' });
  const canonicalUrl = `https://mallan.nyc${canonicalPath}`;
  const ogImage = getPrimaryPhoto(listing.media)?.url || '/images/og-default.png';
  const borough = countyToBorough(listing.address.county);

  return {
    title: `${fullAddress} | ${priceDisplay} | Mallan Real Estate`,
    description: `${listing.bedroomsTotal} bed, ${listing.bathroomsFull} bath ${listing.propertyType} in ${borough}. ${(listing.publicRemarks || '').substring(0, 150)}...`,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${fullAddress} | ${priceDisplay}`,
      description: `${listing.bedroomsTotal} bed, ${listing.bathroomsFull} bath ${listing.propertyType} in ${borough}.`,
      url: canonicalUrl,
      type: 'article',
      images: [{ url: ogImage, width: 1200, height: 630, alt: fullAddress }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${fullAddress} | ${priceDisplay}`,
      description: `${listing.bedroomsTotal} bed, ${listing.bathroomsFull} bath ${listing.propertyType} in ${borough}`,
      images: [ogImage],
    },
  };
}

/** Format raw Trestle values: "CentralAir" → "Central Air", "InUnit" → "In-Unit" */
function formatTrestleValue(val: string): string {
  return val
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // camelCase → separate words
    .replace(/^In\s/, 'In-')                // "In Unit" → "In-Unit"
    .replace(/^Building\s?/, '')             // remove "Building" prefix
    .replace(/\bYN$/i, '')                   // remove YN suffix
    .replace(/\bYes$/i, '')                  // remove trailing "Yes"
    .replace(/\bNo$/i, '')                   // remove trailing "No"
    .trim();
}

/** Split comma-separated Trestle field into RAW trimmed tokens (no formatting) */
function splitRaw(raw: string): string[] {
  return raw.split(',').map(v => v.trim()).filter(v => v.length > 0);
}

/** Split comma-separated Trestle field into cleaned values */
function parseTrestleList(raw: string): string[] {
  return raw.split(',')
    .map(v => formatTrestleValue(v.trim()))
    .filter(v => v.length > 0 && v.toLowerCase() !== 'none' && v.toLowerCase() !== 'other');
}

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) {
    return `$${price.toLocaleString()}/mo`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

export default async function ListingPage({ params }: Props) {
  const { slug } = await params;
  const slugParts = Array.isArray(slug) ? slug : (slug ? [slug as unknown as string] : []);
  const id = resolveLookupKey(slugParts);

  // notFound() ONLY on a confirmed miss. Infra errors (Prisma/Neon timeout, connection,
  // compute-quota) propagate via resolveListingResult so a transient DB failure is never
  // turned into a 404 — which under ISR would be cached over a valid listing. A thrown
  // error fails this render, so Next serves the last good cached page instead.
  const result = await resolveListingResult(() => fetchListing(id));

  if (!result) {
    notFound();
  }

  // Mallan RLS return-copy with exactly one proven local twin: send the visitor
  // to the canonical local listing. Performed HERE, not inside fetchFromDB —
  // the redirect helpers signal by throwing, and fetchFromDB's catch would log
  // that as a database error while React `cache()` memoized the throw for
  // generateMetadata too.
  //
  // `permanentRedirect` (308), NOT `redirect` (307). An earlier comment claimed
  // redirect() was already 308; it is not — outside Server Actions Next issues
  // 307 Temporary. Under CHARTER Section 1A the return-copy is NEVER the public
  // canonical URL once exactly one local twin is proven, so the correct signal
  // to crawlers is permanent.
  if (result.kind === 'redirect') {
    permanentRedirect(result.canonicalRedirect);
  }

  const listing = result.listing;

  // PUBLICATION ELIGIBILITY is NOT re-decided here.
  //
  // It is owned by `decidePublicDetailAccess`, called inside `fetchFromDB` on
  // the raw DB row before any DTO is built or cached. By the time a `listing`
  // exists at this point it is already publication-eligible, so a second check
  // here could only ever drift from the first — and the version that used to
  // live here was drifted by construction: it re-derived the answer from
  // `listing.status`, which is a DISPLAY LABEL, and it ran AFTER
  // `generateMetadata` had already published the listing's address, price,
  // remarks, canonical URL and OpenGraph/Twitter cards.

  // Twin-safe open-house key (street+unit+ZIP), non-empty ONLY for Mallan-owned LOCAL exclusives
  // (SL-/RL-): lets ListingOpenHouseRSVP match a Cotality RLS-twin open house that /api/open-houses
  // deduped under the RLS listingId (SL-0007 ↔ RLS20099289). Restricting to Mallan local exclusives
  // prevents cross-attributing a Mallan open house onto a non-Mallan/other-brokerage co-listing that
  // shares the same address slug. '' when not eligible / address suppressed → panel falls back to id.
  const listingOpenHouseAddressKey = listingPageOpenHouseKey({ id: listing.id, address: listing.address });

  // CANONICAL URL ENFORCEMENT — one listing, one canonical path.
  // Canonical shape: /listing/{address-slug}/{listing-id}
  //   /listing/sl-0004                                          → 308 to canonical
  //   /listing/333-east-...-sl-0004 (legacy hybrid)             → 308 to canonical
  //   /listing/333-east-.../sl-0004 (already canonical)         → render
  // UCBA-suppressed listings have id-only canonical (slug starts with `listing-`).
  // Legacy IDX/RLS hybrid slugs (rls20061539 suffix) and address-only legacy
  // slugs also redirect to the new separated canonical shape for SEO consolidation.
  // Canonical enforcement is now UNCONDITIONAL: the former ?key= debug override
  // (internal ListingKey lookup) was removed so the page renders statically / ISR
  // without reading searchParams. All public URLs resolve by slug/id.
  //
  // `permanentRedirect` (308), NOT `redirect` (307) — corrected 2026-08-10. The
  // block above has always DOCUMENTED "308 to canonical", but `redirect()` emits
  // 307 Temporary outside Server Actions, so the implementation contradicted its
  // own contract and told crawlers the legacy/hybrid URL was still valid. SEO
  // consolidation is the stated purpose of this block, and consolidation
  // requires a permanent signal.
  //
  // Loop-safe by construction: the redirect only fires when
  // `currentPath !== canonicalPath`, and the target IS `canonicalPath`, so the
  // next request compares equal and renders.
  {
    const canonicalPath = buildCanonicalListingPath({ slug: listing.slug || '', id: listing.id || '' });
    const currentPath = `/listing/${slugParts.join('/')}`;
    if (currentPath !== canonicalPath) {
      permanentRedirect(canonicalPath);
    }
  }

  const isRental = listing.listingType === 'rent';
  const isCoop = listing.propertyType === 'Co-op' || listing.propertyType === 'Cooperative';
  const borough = countyToBorough(listing.address.county);
  const neighborhood = listing.address.neighborhood || '';
  const displayPropertyType = listing.propertyType === 'Residential' ? (listing.propertySubType || listing.propertyType) : listing.propertyType;

  // Neighborhood data lookup
  const boroughSlug = borough.toLowerCase().replace(/\s+/g, '-') as BoroughSlug;
  const neighborhoodSlug = neighborhood.toLowerCase().replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const neighborhoodData = neighborhoodSlug ? findNeighborhood(boroughSlug, neighborhoodSlug) : undefined;

  const fullAddress = listing.address.streetName === 'Address Undisclosed'
    ? 'Address Undisclosed'
    : `${listing.address.streetNumber} ${listing.address.streetName}`.trim() + (listing.address.unitNumber ? `, #${listing.address.unitNumber}` : '');

  // Supplementary GEOCODE only (compute repair, PR #511). The former last-sale
  // enrichment (live Trestle `fetchLastUnitSale` + NYC `fetchLastSaleFromACRIS`) was
  // removed: on the DB-only render path it produced no public output (Trestle blocked
  // for the public audience; ACRIS needs tax block/lot the DB row does not carry).
  // Geocoding stays because lib/geo/geocode uses a CACHED fetch (next:{revalidate}),
  // so it does not reintroduce a live-feed dependency or force the route dynamic.
  const needsGeocode = !listing.address.latitude || !listing.address.longitude;
  const hasAddress = listing.address.streetName !== 'Address Undisclosed';

  // Geocode — only when address is NOT suppressed (InternetAddressDisplayYN).
  // Suppressed listings must NOT have coordinates re-added via geocoding or ZIP
  // centroid, as that would leak approximate location via map pins/transit/schools.
  // Result is consumed via mutation on listing.address.
  if (needsGeocode && hasAddress) {
    await geocodeListings([listing]).catch(() => { /* non-fatal */ });
  }

  // "Last Sale" section stays hidden on the public render: no live comp lookup here.
  // The JSX below is gated on this value (unchanged), so the section simply never shows.
  // Typed as the union (not narrowed to `null`) so the existing gated JSX still checks.
  const lastUnitSale = null as LastSaleInfo | null;

  // Last-resort: if geocoding failed entirely, use ZIP centroid so neighborhood/schools/transit
  // sections still render. Without this, those 5 sections vanish on geocode failure.
  // COMPLIANCE: Only for listings with a displayable address. Address-suppressed listings
  // (InternetAddressDisplayYN=false) must NOT get coordinates re-added — that would leak
  // approximate location via map pins, transit, and school sections.
  if (hasAddress && (!listing.address.latitude || !listing.address.longitude)) {
    const { ZIP_CENTROIDS } = await import('@/lib/geo/geocode');
    const zip = (listing.address.postalCode || '').split('-')[0].trim();
    const centroid = ZIP_CENTROIDS[zip];
    if (centroid) {
      listing.address.latitude = centroid[0];
      listing.address.longitude = centroid[1];
    }
    // No hardcoded fallback. Trestle does NOT provide lat/lng — geocoding is our
    // responsibility. If both geocode and ZIP centroid fail, lat/lng stay null and
    // map/transit/schools sections gracefully hide for that listing. Showing wrong
    // coordinates (e.g., Midtown for a Queens listing) is worse than showing nothing.
  }

  // ── Building amenities ── STRICT WHITELIST
  // Only approved amenities are displayed. Trestle raw value → display label.
  const APPROVED_AMENITIES: Record<string, string> = {
    // Lobby & Services
    SecurityGuard: 'Doorman',
    Concierge: 'Concierge',
    LiveInSuper: 'Live-in Super',
    VirtualDoorman: 'Virtual Doorman',
    ResidentManager: 'Live-in Super',
    PackageRoom: 'Package Room',
    // Common Areas
    HealthClub: 'Gym/Fitness',
    FitnessCenter: 'Gym/Fitness',
    YogaStudio: 'Yoga Studio',
    Sauna: 'Sauna',
    SteamRoom: 'Steam Room',
    BuildingRoofDeck: 'Roof Deck',
    BuildingGarden: 'Common Garden',
    BuildingCourtyard: 'Courtyard',
    Storage: 'Storage',
    BikeStorage: 'Bike Room',
    BicycleStorage: 'Bike Room',
    // Building Features
    CommonPlayroom: "Children's Playroom",
    Elevators: 'Elevator',
    BusinessCenter: 'Business Center',
    GameRoom: "Residents' Lounge",
    MediaRoom: 'Media Room',
    ScreeningRoom: 'Screening Room',
    GolfSimulation: 'Golf Simulator',
    MaidService: 'Maid Service',
    // Additional common amenities
    Gym: 'Gym/Fitness',
    SwimmingPool: 'Swimming Pool',
    IndoorPool: 'Indoor Pool',
    OutdoorPool: 'Outdoor Pool',
    TennisCourt: 'Tennis Court',
    BasketballCourt: 'Basketball Court',
    Playground: 'Playground',
    CommunityRoom: 'Community Room',
    PartyRoom: 'Party Room',
    RecreationRoom: 'Recreation Room',
    Library: 'Library',
    Theater: 'Theater',
    PetGrooming: 'Pet Grooming',
    PetSpa: 'Pet Spa',
    DogRun: 'Dog Run',
    Terrace: 'Terrace',
    BuildingBalcony: 'Building Terrace',
    WineStorage: 'Wine Storage',
    ColdStorage: 'Cold Storage',
    Valet: 'Valet',
  };

  const amenitySet = new Set<string>();

  // Scan all Trestle feature sources but ONLY add whitelisted values
  // Use splitRaw (not parseTrestleList) so keys match the raw CamelCase whitelist
  const rawBuildingFeatures = listing.buildingFeatures ? splitRaw(listing.buildingFeatures) : [];
  const rawAssocAmenities = listing.associationAmenities ? splitRaw(listing.associationAmenities) : [];
  const rawCommunity = listing.communityFeatures ? splitRaw(listing.communityFeatures) : [];
  const securityFeatures: string[] = listing.securityFeatures ? splitRaw(listing.securityFeatures) : [];
  const allSources = [...rawBuildingFeatures, ...rawAssocAmenities, ...rawCommunity, ...securityFeatures];
  if (listing.exteriorFeatures) allSources.push(...splitRaw(listing.exteriorFeatures));
  for (const val of allSources) {
    if (APPROVED_AMENITIES[val]) amenitySet.add(APPROVED_AMENITIES[val]);
  }

  // Pool — any pool feature → "Pool"
  const rawPool = listing.poolFeatures ? parseTrestleList(listing.poolFeatures) : [];
  if (rawPool.length > 0) amenitySet.add('Pool');

  // Spa — any spa feature → "Spa Room"
  const rawSpa = listing.spaFeatures ? parseTrestleList(listing.spaFeatures) : [];
  if (rawSpa.length > 0) amenitySet.add('Spa Room');

  // Laundry — building-level only → "Laundry Room"
  const rawLaundry = listing.laundryFeatures ? parseTrestleList(listing.laundryFeatures) : [];
  const buildingLaundryValues = new Set(['CommonArea', 'CommonOnFloor', 'LaundryRoom', 'BuildingInside', 'BuildingMultipleLocations']);
  if (rawLaundry.some(v => buildingLaundryValues.has(v))) amenitySet.add('Laundry Room');

  // Parking — garage → "Parking Garage"
  const parkingList = listing.parkingFeatures ? parseTrestleList(listing.parkingFeatures) : [];
  const hasGarage = parkingList.some(v => v === 'Garage');
  if (hasGarage) amenitySet.add('Parking Garage');

  // AttendanceType → Doorman / 24hr Doorman / Attended Lobby
  const attendanceValues = listing.attendanceType ? splitRaw(listing.attendanceType) : [];
  for (const val of attendanceValues) {
    if (val === 'DoormanFullTime') amenitySet.add('24hr Doorman');
    else if (val === 'DoormanPartTime' || val === 'DoormanYes') amenitySet.add('Doorman');
    else if (val === 'LobbyAttendantFullTime' || val === 'LobbyAttendantPartTime' || val === 'LobbyAttendantYes') amenitySet.add('Attended Lobby');
    else if (val === 'VideoDoormanFullTime' || val === 'VideoDoormanPartTime' || val === 'VideoDoormanYes') amenitySet.add('Virtual Doorman');
    else if (val === 'ConciergeFullTime' || val === 'ConciergePartTime' || val === 'ConciergeYes') amenitySet.add('Concierge');
  }

  // Boolean YN flags — most commonly populated even when detail fields are empty
  const yn = listing as unknown as Record<string, unknown>;
  if (yn.doormanYN && !amenitySet.has('24hr Doorman') && !amenitySet.has('Doorman')) amenitySet.add('Doorman');
  if (yn.elevatorYN && !amenitySet.has('Elevator')) amenitySet.add('Elevator');
  if (yn.gymYN && !amenitySet.has('Gym/Fitness')) amenitySet.add('Gym/Fitness');
  if (yn.storageYN && !amenitySet.has('Storage')) amenitySet.add('Storage');

  // Description-based amenity detection — catches amenities mentioned in remarks
  // but not in structured MLS fields (common in NYC listings)
  const desc = (listing.publicRemarks || '').toLowerCase();
  const DESC_AMENITIES: [RegExp, string][] = [
    [/\b(doorman|door\s*-?\s*man|attended\s+lobb)/i, 'Doorman'],
    [/\b(24\s*[-/]?\s*hour\s+doorman|full[\s-]*time\s+doorman)/i, '24hr Doorman'],
    [/\b(virtual\s+doorman|video\s+doorman)/i, 'Virtual Doorman'],
    [/\b(concierge)/i, 'Concierge'],
    [/\b(gym|fitness\s+center|exercise\s+room|work\s*-?\s*out)/i, 'Gym/Fitness'],
    [/\b(roof\s*-?\s*deck|roof\s*-?\s*top\s+terrace|rooftop\s+deck)/i, 'Roof Deck'],
    [/\b(bike\s+room|bicycle\s+storage|bike\s+storage)/i, 'Bike Room'],
    [/\b(children.s\s+playroom|kids\s+room|playroom)/i, "Children's Playroom"],
    [/\b(community\s+room|residents.\s+lounge|common\s+room)/i, "Residents' Lounge"],
    [/\b(swimming\s+pool|indoor\s+pool|outdoor\s+pool)\b/i, 'Swimming Pool'],
    [/\b(package\s+room)/i, 'Package Room'],
    [/\b(live[\s-]*in\s+super)/i, 'Live-in Super'],
    [/\b(courtyard)/i, 'Courtyard'],
    [/\b(parking\s+garage|garage\s+parking)\b/i, 'Parking Garage'],
    [/\b(laundry\s+room|laundry\s+facilit|on[\s-]*site\s+laundry)/i, 'Laundry Room'],
  ];
  for (const [pattern, amenity] of DESC_AMENITIES) {
    if (!amenitySet.has(amenity) && pattern.test(desc)) amenitySet.add(amenity);
  }
  // Don't double-count doorman variants
  if (amenitySet.has('24hr Doorman')) amenitySet.delete('Doorman');

  const buildingAmenitiesFinal = [...amenitySet].sort();

  // ── Unit Features (pills) ──
  // Filter on RAW values (before formatting) to avoid mismatches
  const INTERIOR_EXCLUDE_RAW = new Set(['Sauna', 'Elevator', 'CommonArea', 'CommonOnFloor', 'Storage']);
  const unitFeatures: string[] = [];
  if (listing.interiorFeatures) {
    for (const raw of splitRaw(listing.interiorFeatures)) {
      if (!INTERIOR_EXCLUDE_RAW.has(raw)) unitFeatures.push(formatTrestleValue(raw));
    }
  }
  // Unit-level exterior features — exclude building-level
  const EXTERIOR_BUILDING_RAW = new Set(['BuildingBalcony', 'BuildingCourtyard', 'BuildingGarden', 'BuildingRoofDeck', 'BuildingStorage', 'Storage', 'None']);
  if (listing.exteriorFeatures) {
    for (const raw of splitRaw(listing.exteriorFeatures)) {
      if (!EXTERIOR_BUILDING_RAW.has(raw)) unitFeatures.push(formatTrestleValue(raw));
    }
  }

  // ── Unit Details (structured rows) ──
  const unitDetails: { label: string; value: string }[] = [];
  // Only unit-level laundry (In Unit, Washer Hookup) — NOT building-level
  const unitLaundryRaw = rawLaundry.filter(v => !buildingLaundryValues.has(v) && v !== 'None' && v !== 'BuildingNone' && v !== 'BuildingOther' && v !== 'SeeRemarks');
  if (unitLaundryRaw.length > 0) unitDetails.push({ label: 'Laundry', value: unitLaundryRaw.map(v => formatTrestleValue(v)).join(', ') });
  if (listing.heating) unitDetails.push({ label: 'Heating', value: parseTrestleList(listing.heating).join(', ') });
  if (listing.cooling) unitDetails.push({ label: 'Cooling', value: parseTrestleList(listing.cooling).join(', ') });

  // ── Appliances — key appliances buyers care about ──
  const APPLIANCE_SHOW = new Set([
    'dishwasher', 'washer', 'dryer', 'washer dryer stacked', 'washer dryer combo',
    'refrigerator', 'microwave', 'oven', 'range', 'garbage disposal',
    'wine cooler', 'wine refrigerator', 'ice maker',
  ]);
  const appliancesList: string[] = listing.appliances
    ? parseTrestleList(listing.appliances).filter(a => APPLIANCE_SHOW.has(a.toLowerCase()))
    : [];
  // Pet policy — format raw values like "CatsOK,DogsOK" → "Cats Ok, Dogs Ok"
  const rawPetValues = listing.petsAllowedDetail ? parseTrestleList(listing.petsAllowedDetail) : [];
  const petPolicy = rawPetValues
    .map(v => {
      // Convert "Cats OK" / "Dogs OK" → "Cats Ok" / "Dogs Ok"
      const lower = v.toLowerCase();
      if (lower.includes('cat')) return 'Cats Ok';
      if (lower.includes('dog')) return 'Dogs Ok';
      if (lower === 'allowed' || lower === 'permitted') return 'Pets Allowed';
      if (lower === 'restricted' || lower === 'conditional') return 'Pets Conditional';
      return v;
    })
    .join(', ');
  const petsAllowed = petPolicy && !petPolicy.toLowerCase().includes('no pets') && !petPolicy.toLowerCase().includes('not allowed');

  // ── Separate media by type ──
  // Canonical media split via the shared resolver. Photos ONLY feed the gallery
  // (floorplans/videos/tours are separate tabs). No `|| !mediaType` fallback — a
  // mediaType-less item must never be assumed a photo (the floorplan-first guard).
  const images = getPhotoGallery(listing.media).map((m) => ({ url: m.url, thumbUrl: m.thumbUrl }));
  const floorPlanUrl = getFloorplans(listing.media)[0]?.url || null;
  // Video + 3D from the DTO's host-split tour fields (unbranded-preferred, UCBA §5(C));
  // fall back to any Media-resource video/tour row.
  const videoUrl = listing.videoUrl || getVideos(listing.media)[0]?.url || null;
  const virtualTourUrl = listing.virtualTourURL || getVirtualTours(listing.media)[0]?.url || null;

  // ── Price history ──
  const priceHistory: { label: string; price: number }[] = [];
  if (listing.originalListPrice && listing.originalListPrice !== listing.listPrice) {
    priceHistory.push({ label: 'Original', price: listing.originalListPrice });
  }
  if (listing.previousListPrice && listing.previousListPrice !== listing.listPrice && listing.previousListPrice !== listing.originalListPrice) {
    priceHistory.push({ label: 'Previous', price: listing.previousListPrice });
  }
  priceHistory.push({ label: 'Current', price: listing.listPrice });

  // ── JSON-LD Structured Data ──
  const listingSchema = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: `${fullAddress} — ${displayPropertyType} ${isRental ? 'for Rent' : 'for Sale'}`,
    url: `https://mallan.nyc/listing/${listing.slug}`,
    description: listing.publicRemarks?.substring(0, 300) || undefined,
    datePosted: listing.onMarketDate || listing.listingContractDate,
    dateModified: listing.modificationTimestamp || undefined,
    image: getPrimaryPhoto(listing.media)?.url || undefined,
    offers: {
      '@type': 'Offer',
      price: listing.listPrice,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
    address: listing.address.streetName !== 'Address Undisclosed' ? {
      '@type': 'PostalAddress',
      streetAddress: `${listing.address.streetNumber} ${listing.address.streetName}`,
      addressLocality: borough,
      addressRegion: 'NY',
      postalCode: listing.address.postalCode,
      addressCountry: 'US',
    } : undefined,
    ...(listing.address.latitude && listing.address.longitude ? {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: listing.address.latitude,
        longitude: listing.address.longitude,
      },
    } : {}),
    numberOfRooms: listing.roomsTotal || undefined,
    numberOfBedrooms: listing.bedroomsTotal,
    numberOfBathroomsTotal: listing.bathroomsFull + listing.bathroomsHalf * 0.5,
    floorSize: listing.livingArea ? {
      '@type': 'QuantitativeValue',
      value: listing.livingArea,
      unitCode: 'FTK',
    } : undefined,
  };

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <RecentlyViewedTracker
        id={listing.id}
        slug={listing.slug}
        address={fullAddress}
        price={listing.listPrice}
        photo={images[0]?.url || ''}
        beds={listing.bedroomsTotal}
        baths={listing.bathroomsFull}
        type={isRental ? 'rent' : 'sale'}
        officeName={listing.listOfficeName}
      />
      <ListingViewTracker />
      <Suspense fallback={null}>
        <TrackListingView listingId={listing.id} />
        <TrackListingSend listingId={listing.id} />
      </Suspense>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listingSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mallan.nyc/' },
            { '@type': 'ListItem', position: 2, name: isRental ? 'Rentals' : 'Sales', item: `https://mallan.nyc/${isRental ? 'rent' : 'buy'}` },
            { '@type': 'ListItem', position: 3, name: borough, item: `https://mallan.nyc/${boroughSlug}` },
            ...(neighborhood ? [{ '@type': 'ListItem', position: 4, name: neighborhood }] : []),
          ],
        }) }}
      />
      {/* ═══ Breadcrumb ═══ */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-black/5 pt-[68px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5">
          <nav className="flex items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
            <BackButton fallbackHref={isRental ? '/rent' : '/buy'} />
            <Link href="/" className="text-brand-dark/60 hover:text-brand-gold transition-colors hidden md:inline">Home</Link>
            <span className="text-brand-dark/30 hidden md:inline">/</span>
            <Link href={isRental ? '/search?tab=rent-residential' : '/search?tab=buy-residential'} className="text-brand-dark/60 hover:text-brand-gold transition-colors hidden md:inline">
              {isRental ? 'Rentals' : 'Sales'}
            </Link>
            <span className="text-brand-dark/30 hidden md:inline">/</span>
            <span className="text-brand-dark/80 hidden md:inline">{borough}</span>
            {neighborhood && (
              <>
                <span className="text-brand-dark/30 hidden md:inline">/</span>
                <span className="text-brand-dark font-medium hidden md:inline">{neighborhood}</span>
              </>
            )}
            <span className="text-brand-dark/80 md:hidden">{neighborhood || borough}</span>
          </nav>
        </div>
      </div>

      {/* ═══ Media Gallery ═══ */}
      <ListingMediaGallery
        images={images}
        floorPlanUrl={floorPlanUrl}
        videoUrl={videoUrl}
        virtualTourUrl={virtualTourUrl}
        alt={fullAddress}
        badges={
          listing._displayCompliance.comingSoon ? (
            <span className="absolute top-3 left-3 bg-amber-500 text-white text-[11px] font-medium px-3.5 py-1.5 rounded-full z-10">
              {listing._displayCompliance.comingSoonDate
                ? `Coming Soon. No Showings or Open House until ${new Date(listing._displayCompliance.comingSoonDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                : 'Coming Soon. No Showings or Open House Permitted'}
            </span>
          ) : null
        }
      />

      {/* ═══ Mobile CTA Bar (sticky, visible on mobile/tablet only) ═══ */}
      <div className="lg:hidden sticky top-[60px] z-30 bg-white/95 backdrop-blur-xl border-b border-black/5 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display font-bold text-lg text-brand-dark truncate">
              {formatPrice(listing.listPrice, isRental)}
            </p>
            <p className="text-[12px] text-brand-dark/70 truncate">{fullAddress}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <DetailFavoriteButton
              id={listing.id}
              slug={listing.slug}
              address={fullAddress}
              price={listing.listPrice}
              listingType={isRental ? 'rent' : 'sale'}
              beds={listing.bedroomsTotal}
              baths={listing.bathroomsFull}
              photoUrl={getPrimaryPhoto(listing.media)?.url}
            />
            <a
              href="tel:646-258-4460"
              className="btn-liquid px-5 py-2.5 bg-brand-gold text-white text-sm font-medium rounded-full hover:bg-brand-gold-deep"
            >
              Call
            </a>
            {/* Featured/Public Tier A P0 — route to the audited InquiryForm
                instead of opening a mailto. The form posts to /api/inquiries
                which records consent_captured_at (TCPA/CAN-SPAM), creates an
                Inquiry row (UCBA C1 workstream), writes an AuditEvent, and
                wires the lead into the lifecycle pipeline. The previous
                mailto: bypass produced none of those. */}
            <a
              href="#inquiry"
              className="btn-liquid px-5 py-2.5 bg-brand-dark text-white text-sm font-medium rounded-full hover:bg-brand-dark/90"
            >
              Inquire
            </a>
          </div>
        </div>
      </div>

      {/*
        A2 (PR-A2-mobile-cta, 2026-05-21) — Class-A above-fold contact CTA.
        Fixed-bottom bar visible on <md from page load (no scroll required).
        Touch targets ≥ 48 px (WCAG 2.5.5). Hidden on md+ so the existing
        desktop sidebar agent-contact card and the sticky-top in-flow bar
        remain the canonical CTA paths on larger viewports.

        LISTING-TYPE → INTENT MAPPING (Maya correction, 2026-05-21):
          - sale  → intent=buyer
          - rent  → intent=tenant
        Both literals are confirmed members of the A3 INTENT_ALLOWLIST in
        `lib/leads/intent.ts`. NEVER hardcode 'buyer' for rentals — that
        misroutes every rental inquiry to the buyer queue.

        Carries listing=<slug> as a separate query param so it cannot
        collide with A3's intent contract. The contact form does not yet
        consume `listing=` (reserved for a follow-up PR that prefills the
        inquiry message).

        See: docs/audits/exclusive-launch-readiness-audit-2026-05-20.md A2
      */}
      <MobileStickyCta slug={listing.slug} listingType={listing.listingType} />

      <main className="py-8 md:py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          {/*
            A1 (PR-A1, 2026-05-20) — Class-A mobile-overflow blocker.
            Pre-fix: `grid lg:grid-cols-3 gap-8 lg:gap-10` created a CSS Grid
            container on ALL viewports. At <lg (390 px) the grid had no
            explicit template-columns rule, so the single implicit column
            stretched to fit the widest child and `body { overflow-x: hidden }`
            cosmetically masked horizontal scroll (frontend-auditor measured
            gridTemplateColumns: "1640px" / scrollX: 1266 on mobile).
            Fix: on <lg use `flex flex-col` (stacks vertically, no column
            stretch); on lg+ use the original 3-column grid (byte-identical
            desktop behavior). The sidebar is `hidden lg:block` so it
            participates in the layout only at lg+, exactly as before.
            See: docs/audits/exclusive-launch-readiness-audit-2026-05-20.md A1
          */}
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3 lg:gap-10">

            {/* ═══════════════════════════════════════
                MAIN CONTENT (2/3)
                ═══════════════════════════════════════ */}
            <div className="lg:col-span-2 min-w-0 space-y-0">

              {/* ── AUCTION BANNER (UCBA Art. I exception path) ── */}
              {/* Renders nothing on non-auction listings (auction=null). When  */}
              {/* present, sits above the price hero — auction end date is     */}
              {/* substantive and must be the first thing readers see.         */}
              <AuctionBanner auction={listing.auction} />

              {/* ── 1. PRICE + ADDRESS HERO ── */}
              <section className="pb-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                  <div>
                    {/* Price — bold and prominent */}
                    <div className="flex items-baseline gap-3 mb-1">
                      <PriceWithCalculator
                        price={listing.listPrice}
                        originalPrice={listing.originalListPrice}
                        isRental={isRental}
                        maintenanceFee={listing.associationFee || 0}
                        monthlyTaxes={listing.taxAnnualAmount ? Math.round(listing.taxAnnualAmount / 12) : 0}
                        propertyType={listing.propertyType}
                      />
                    </div>
                    {/* Address + Neighborhood */}
                    <p className="text-brand-dark text-[15px]">{fullAddress}</p>
                    <p className="text-brand-dark text-[15px]">
                      {borough}, NY {listing.address.postalCode}
                    </p>
                    {neighborhood && neighborhood !== borough ? (
                      <h1 className="text-[13px] font-medium text-brand-dark/60 mt-1">
                        {neighborhood}
                      </h1>
                    ) : (
                      <h1 className="sr-only">{fullAddress}</h1>
                    )}
                    {/* Monthly costs — directly under address for immediate buyer visibility */}
                    {!isRental && (listing.associationFee ? listing.associationFee > 0 : false) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[14px] text-brand-dark">
                        <span>
                          <span className="font-semibold">{isCoop ? 'Maint:' : 'CC:'}</span>{' '}
                          ${listing.associationFee!.toLocaleString()}/mo
                        </span>
                        {listing.taxAnnualAmount != null && listing.taxAnnualAmount > 0 && (
                          <span>
                            <span className="font-semibold">Tax:</span>{' '}
                            ${Math.round(listing.taxAnnualAmount / 12).toLocaleString()}/mo
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Action buttons + badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-gold/10 text-brand-gold-deep text-[13px] font-medium rounded-full">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2 22V6l10-4 10 4v16l-10-4L2 22z" /></svg>
                      {displayPropertyType}
                    </span>
                    {listing.previousListPrice && listing.listPrice < listing.previousListPrice && (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 text-[13px] font-medium rounded-full">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                        Price Reduced
                      </span>
                    )}
                    <div className="hidden lg:flex items-center gap-2">
                      <DetailFavoriteButton
                        id={listing.id}
                        slug={listing.slug}
                        address={fullAddress}
                        price={listing.listPrice}
                        listingType={isRental ? 'rent' : 'sale'}
                        beds={listing.bedroomsTotal}
                        baths={listing.bathroomsFull}
                        photoUrl={getPrimaryPhoto(listing.media)?.url}
                      />
                      <ShareButton title={`${fullAddress} | ${formatPrice(listing.listPrice, isRental)}`} />
                    </div>
                  </div>
                </div>

                {/* Quick Stats — icon-enhanced, clear separators */}
                <div className="flex flex-wrap items-center gap-0 py-4 px-1 rounded-2xl bg-[#F8F7F4]">
                  <div className="flex items-center gap-2 px-4 py-1">
                    <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" /></svg>
                    <div>
                      <span className="text-lg font-display font-bold text-brand-dark">{listing.bedroomsTotal}</span>
                      <span className="text-brand-dark/80 text-[13px] ml-1">Beds</span>
                    </div>
                  </div>
                  <div className="w-px h-8 bg-black/10" />
                  <div className="flex items-center gap-2 px-4 py-1">
                    <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4 4m4-4v12" /></svg>
                    <div>
                      <span className="text-lg font-display font-bold text-brand-dark">
                        {formatBathrooms(listing.bathroomsFull, listing.bathroomsHalf)}
                      </span>
                      <span className="text-brand-dark/80 text-[13px] ml-1">Baths</span>
                    </div>
                  </div>
                  {listing.livingArea && (
                    <>
                      <div className="w-px h-8 bg-black/10" />
                      <div className="flex items-center gap-2 px-4 py-1">
                        <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                        <div>
                          <span className="text-lg font-display font-bold text-brand-dark">{listing.livingArea.toLocaleString()}</span>
                          <span className="text-brand-dark/80 text-[13px] ml-1">Sq Ft</span>
                        </div>
                      </div>
                    </>
                  )}
                  {listing.livingArea && listing.listPrice > 0 && (
                    <>
                      <div className="w-px h-8 bg-black/10" />
                      <div className="px-4 py-1">
                        <span className="text-lg font-display font-bold text-brand-dark">${Math.round(listing.listPrice / listing.livingArea).toLocaleString()}</span>
                        <span className="text-brand-dark/80 text-[13px] ml-1">/Sq Ft</span>
                      </div>
                    </>
                  )}
                  {listing.roomsTotal && (
                    <>
                      <div className="w-px h-8 bg-black/10" />
                      <div className="px-4 py-1">
                        <span className="text-lg font-display font-bold text-brand-dark">{listing.roomsTotal}</span>
                        <span className="text-brand-dark/80 text-[13px] ml-1">Rooms</span>
                      </div>
                    </>
                  )}
                </div>

              </section>

              {/* ── 2. DESCRIPTION ── */}
              {listing.publicRemarks && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">About This Property</h2>
                  <p
                    className="text-brand-dark/85 text-[15px] leading-[1.85] max-w-none text-justify whitespace-pre-wrap"
                  >
                    {listing.publicRemarks
                      .replace(/<[^>]*>/g, '')
                      .replace(/\?\?(?=\s)/g, '•')
                      .replace(/\*\*([^*]+)\*\*/g, '$1')
                    }
                  </p>
                </section>
              )}

              {/* ── 2b. PRICE HISTORY TIMELINE ── */}
              <PriceHistory
                listPrice={listing.listPrice}
                originalListPrice={listing.originalListPrice}
                previousListPrice={listing.previousListPrice}
                closePrice={listing.closePrice}
                status={listing.status}
                onMarketDate={listing.onMarketDate}
                listingContractDate={listing.listingContractDate}
                modificationTimestamp={listing.modificationTimestamp}
                closeDate={listing.closeDate}
                listingType={listing.listingType}
              />

              {/* ── 3. PRICE HISTORY + LAST SALE ── */}
              {(!isRental && (priceHistory.length > 1 || (lastUnitSale && lastUnitSale.closePrice > 0))) && (
                <section className="py-6 border-t border-black/[0.06]">
                  <div className="space-y-5">

                    {/* Price History — compact inline */}
                    {priceHistory.length > 1 && (
                      <div className="rounded-2xl border border-black/[0.06] px-5 py-4">
                        <p className="text-[12px] font-semibold text-brand-dark/70 uppercase tracking-wider mb-3">Price History</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          {priceHistory.map((entry, i) => {
                            const isCurrent = i === priceHistory.length - 1;
                            const prev = i > 0 ? priceHistory[i - 1].price : null;
                            const change = prev ? ((entry.price - prev) / prev * 100) : null;
                            return (
                              <div key={entry.label} className="flex items-center gap-2">
                                {i > 0 && (
                                  <svg className="w-4 h-4 text-brand-dark/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                )}
                                <div>
                                  <p className={`font-display font-bold text-[15px] ${isCurrent ? 'text-brand-dark' : 'text-brand-dark/40 line-through'}`}>
                                    {formatPrice(entry.price, isRental)}
                                  </p>
                                  <p className="text-[11px] text-brand-dark/50 leading-tight">
                                    {entry.label}
                                    {change !== null && (
                                      <span className={`ml-1.5 font-semibold ${change < 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {change > 0 ? '+' : ''}{change.toFixed(1)}%
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Last Closed Sale */}
                    {lastUnitSale && lastUnitSale.closePrice > 0 && (
                      <div className="rounded-2xl border border-black/[0.06] p-5">
                        <p className="text-[12px] font-semibold text-brand-dark/70 uppercase tracking-wider mb-3">
                          Last Sale {'\u2014'} This {lastUnitSale.source === 'acris' ? 'Property' : 'Unit'}
                        </p>
                        <div className="flex flex-wrap items-baseline gap-3">
                          <span className="text-xl font-display font-bold text-brand-dark">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(lastUnitSale.closePrice)}
                          </span>
                          {lastUnitSale.sqft > 0 && (
                            <span className="text-[13px] text-brand-dark/80">
                              ${Math.round(lastUnitSale.closePrice / lastUnitSale.sqft).toLocaleString()}/sf
                            </span>
                          )}
                          {lastUnitSale.closeDate && (
                            <span className="text-[13px] text-brand-dark/80">
                              Closed {new Date(lastUnitSale.closeDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                        {listing.listPrice > 0 && lastUnitSale.closePrice > 0 && listing.listPrice !== lastUnitSale.closePrice && (
                          <p className={`text-[13px] mt-3 font-semibold ${listing.listPrice > lastUnitSale.closePrice ? 'text-red-600' : 'text-green-600'}`}>
                            {listing.listPrice > lastUnitSale.closePrice
                              ? `Asking ${Math.round(((listing.listPrice - lastUnitSale.closePrice) / lastUnitSale.closePrice) * 100)}% above last sale`
                              : `Asking ${Math.round(((lastUnitSale.closePrice - listing.listPrice) / lastUnitSale.closePrice) * 100)}% below last sale`}
                          </p>
                        )}
                        {lastUnitSale.source === 'acris' && (
                          <p className="text-[11px] text-brand-dark/40 mt-2">Source: NYC ACRIS Public Records</p>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── 4. UNIT FEATURES + APPLIANCES ── */}
              {(unitFeatures.length > 0 || appliancesList.length > 0) && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-5 text-brand-dark">Unit Features</h2>
                  <div className="flex flex-wrap gap-2">
                    {unitFeatures.map((f) => (
                      <span key={f} className="inline-flex items-center gap-2 px-3.5 py-2 bg-black/[0.04] text-brand-dark text-[13px] rounded-full">
                        <svg className="w-3.5 h-3.5 text-brand-gold-deep flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        {f}
                      </span>
                    ))}
                    {appliancesList.map((a) => (
                      <span key={a} className="inline-flex items-center gap-2 px-3.5 py-2 bg-black/[0.04] text-brand-dark text-[13px] rounded-full">
                        <svg className="w-3.5 h-3.5 text-brand-gold-deep flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        {a}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* ── 6. BUILDING AMENITIES ── */}
              {(buildingAmenitiesFinal.length > 0 || hasGarage) && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Building Amenities</h2>
                  {buildingAmenitiesFinal.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {buildingAmenitiesFinal.map((amenity) => (
                        <span key={amenity} className="inline-flex items-center gap-2 px-3.5 py-2 bg-black/[0.04] text-brand-dark text-[13px] rounded-full">
                          <svg className="w-3.5 h-3.5 text-brand-dark/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          {amenity}
                        </span>
                      ))}
                    </div>
                  )}
                  {hasGarage && (
                    <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-black/5">
                      <span className="inline-flex items-center gap-2 text-[13px] text-brand-dark bg-black/[0.04] px-3.5 py-2 rounded-full">
                        <svg className="w-3.5 h-3.5 text-brand-dark/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        Parking Garage
                      </span>
                    </div>
                  )}
                </section>
              )}

              {/* ── 6b. PET POLICY ── */}
              {petPolicy && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Pet Policy</h2>
                  <div className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full text-[13px] font-medium ${petsAllowed ? 'text-brand-dark bg-black/[0.04]' : 'text-brand-dark bg-black/[0.04]'}`}>
                    {petsAllowed ? (
                      <svg className="w-4 h-4 text-brand-dark/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-4 h-4 text-brand-dark/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    )}
                    {petPolicy}
                  </div>
                </section>
              )}

              {/* ── 6c. NEARBY SCHOOLS ── */}
              {listing.address.latitude && listing.address.longitude && (
                <SchoolInfo
                  latitude={listing.address.latitude}
                  longitude={listing.address.longitude}
                />
              )}

              {/* ── 7. RENTAL DETAILS ── */}
              {isRental && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Rental Details</h2>
                  <div className="grid sm:grid-cols-2 gap-x-8 gap-y-0">
                    {listing.availabilityDate && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Available</span>
                        <span className="text-[13px] font-medium text-brand-dark">{new Date(listing.availabilityDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    {listing.petsAllowed && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Pets</span>
                        <span className="text-[13px] font-medium text-brand-dark">{listing.petsAllowed}</span>
                      </div>
                    )}
                    {listing.furnished && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Furnished</span>
                        <span className="text-[13px] font-medium text-brand-dark">{listing.furnished}</span>
                      </div>
                    )}
                    {listing.moveInCosts && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Move-In Costs</span>
                        <span className="text-[13px] font-medium text-brand-dark">{listing.moveInCosts}</span>
                      </div>
                    )}
                    {/* FARE Act: move-in fee amount + comments (canonical MoveInCostsAmount/Comments,
                        with read-time legacy fallback resolved in the DTO — single value, no duplicate). */}
                    {typeof listing.moveInCostsAmount === 'number' && listing.moveInCostsAmount > 0 && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Move-In Cost Amount</span>
                        <span className="text-[13px] font-medium text-brand-dark">${listing.moveInCostsAmount.toLocaleString('en-US')}</span>
                      </div>
                    )}
                    {listing.moveInCostsComments && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Move-In Cost Details</span>
                        <span className="text-[13px] font-medium text-brand-dark">{listing.moveInCostsComments}</span>
                      </div>
                    )}
                    {listing.ongoingFees && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Ongoing Fees</span>
                        <span className="text-[13px] font-medium text-brand-dark">{listing.ongoingFees}</span>
                      </div>
                    )}
                    {listing.tenantPaysDescription && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Tenant Pays</span>
                        <span className="text-[13px] font-medium text-brand-dark">{listing.tenantPaysDescription}</span>
                      </div>
                    )}
                  </div>
                  {/* FARE Act Fee Disclosure (NYC Local Law 119/2024) */}
                  <div className="mt-4 p-3 bg-[#F8F7F4] rounded-lg border border-black/5">
                    <p className="text-[11px] text-brand-dark/60 leading-relaxed">
                      <span className="font-semibold text-brand-dark/70">Fee Disclosure (NYC Local Law 119/2024):</span> Fee
                      and move-in cost information is provided by the listing broker via the REBNY Listing Service.
                      Where fee details are not displayed, the listing broker has not provided this information.
                      Contact the listing office directly for complete fee disclosure. Prospective tenants are not
                      required to pay a broker fee unless they have specifically engaged a broker to act on their behalf.
                    </p>
                  </div>
                </section>
              )}

              {/* ── 8. BUILDING INFO ── */}
              <section className="py-6 border-t border-black/[0.06]">
                <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Building Details</h2>
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-0">
                  <div className="flex justify-between py-2.5 border-b border-black/5">
                    <span className="text-[13px] text-brand-dark/80">Property Type</span>
                    <span className="text-[13px] font-medium text-brand-dark">{displayPropertyType}</span>
                  </div>
                  {listing.architecturalStyle && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Style</span>
                      <span className="text-[13px] font-medium text-brand-dark">{listing.architecturalStyle}</span>
                    </div>
                  )}
                  {listing.yearBuilt && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Year Built</span>
                      <span className="text-[13px] font-medium text-brand-dark">{listing.yearBuilt}</span>
                    </div>
                  )}
                  {listing.storiesTotal && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Stories</span>
                      <span className="text-[13px] font-medium text-brand-dark">{listing.storiesTotal}</span>
                    </div>
                  )}
                  {listing.buildingName && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Building</span>
                      <span className="text-[13px] font-medium text-brand-dark">{listing.buildingName}</span>
                    </div>
                  )}
                  {listing.address.streetName !== 'Address Undisclosed' && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Building Page</span>
                      <Link
                        href={buildingHref({ streetNumber: listing.address.streetNumber, streetName: listing.address.streetName, postalCode: listing.address.postalCode, buildingName: listing.buildingName || undefined })}
                        className="text-[13px] font-medium text-brand-gold-deep hover:text-brand-gold transition-colors flex items-center gap-1"
                      >
                        View Building
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                      </Link>
                    </div>
                  )}
                  <div className="flex justify-between py-2.5 border-b border-black/5">
                    <span className="text-[13px] text-brand-dark/80">MLS #</span>
                    <span className="text-[13px] font-medium text-brand-dark font-mono">{listing.mlsId}</span>
                  </div>
                  {listing.onMarketDate && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Listed</span>
                      <span className="text-[13px] font-medium text-brand-dark">{new Date(listing.onMarketDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  {listing.status && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Status</span>
                      <span className={`text-[13px] font-medium ${listing.status === 'Active' ? 'text-blue-600' : listing.status === 'Closed' ? 'text-green-600' : 'text-brand-dark'}`}>
                        {listing.status}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* ── 9. CALCULATORS (collapsed by default) ── */}
              <section id="investor-calculator" className="py-6 border-t border-black/[0.06] scroll-mt-24">
                {!isRental ? (
                  <InvestorCalculator
                    purchasePrice={listing.listPrice}
                    maintenanceFee={listing.associationFee || 0}
                    monthlyTaxes={listing.taxAnnualAmount ? Math.round(listing.taxAnnualAmount / 12) : 0}
                    bedrooms={listing.bedroomsTotal}
                    neighborhood={neighborhood || borough}
                  />
                ) : (
                  <RentVsBuyCalculator
                    purchasePrice={listing.listPrice * 250}
                    monthlyRent={listing.listPrice}
                    maintenanceFee={0}
                    realEstateTaxes={0}
                    isRental={true}
                  />
                )}
              </section>

              {/* ── 10. TRANSIT & COMMUTE ── */}
              {listing.address.latitude && listing.address.longitude && (
                <section className="py-6 border-t border-black/[0.06]">
                  <TransitCommuteTool
                    latitude={listing.address.latitude}
                    longitude={listing.address.longitude}
                    borough={borough}
                  />
                </section>
              )}

              {/* ── 12. NEIGHBORHOOD EXPLORER (POI + Community Portrait) ── */}
              {listing.address.latitude && listing.address.longitude && (
                <section className="py-6 border-t border-black/[0.06]">
                  <NeighborhoodExplorer
                    latitude={listing.address.latitude}
                    longitude={listing.address.longitude}
                    address={fullAddress}
                    borough={borough}
                  />
                </section>
              )}

              {/* ── 12b. NEIGHBORHOOD SUMMARY ── */}
              {neighborhoodData && (
                <section className="py-6 border-t border-black/[0.06]">
                  <p className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-[0.15em] mb-5">
                    The Neighborhood
                  </p>

                  <div className="flex items-start gap-5">
                    {/* Hero thumbnail */}
                    {neighborhoodData.heroImage && (
                      <div className="hidden sm:block relative w-28 h-28 flex-shrink-0 rounded-2xl overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={neighborhoodData.heroImage}
                          alt={neighborhoodData.name}
                          className="absolute inset-0 w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-lg font-semibold text-brand-dark leading-snug">
                        {neighborhoodData.name}
                      </h3>
                      <p className="text-[13px] text-brand-gold-deep font-medium mb-2">{neighborhoodData.tagline}</p>
                      <p className="text-[13px] text-brand-dark/70 leading-relaxed line-clamp-3">
                        {neighborhoodData.summary}
                      </p>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                    <div className="bg-stone-50 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[20px] font-bold text-brand-dark">{neighborhoodData.walkScore}</p>
                      <p className="text-[10px] text-brand-dark/50 uppercase tracking-wider font-semibold">Walk Score</p>
                    </div>
                    <div className="bg-stone-50 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[20px] font-bold text-brand-dark">{neighborhoodData.transitScore}</p>
                      <p className="text-[10px] text-brand-dark/50 uppercase tracking-wider font-semibold">Transit Score</p>
                    </div>
                    <div className="bg-stone-50 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[20px] font-bold text-brand-dark">${neighborhoodData.avgPricePerSqft.toLocaleString()}</p>
                      <p className="text-[10px] text-brand-dark/50 uppercase tracking-wider font-semibold">Avg $/Sq Ft</p>
                    </div>
                    <div className="bg-stone-50 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[13px] font-bold text-brand-dark mt-0.5">{neighborhoodData.dominantPropertyType}</p>
                      <p className="text-[10px] text-brand-dark/50 uppercase tracking-wider font-semibold mt-0.5">Primary Type</p>
                    </div>
                  </div>

                  {/* Subway lines + link */}
                  <div className="flex items-center justify-between mt-4">
                    {neighborhoodData.nearestSubway.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        {neighborhoodData.nearestSubway.map((line) => (
                          <SubwayBadge key={line} line={line} />
                        ))}
                      </div>
                    )}
                    <Link
                      href={`/${boroughSlug}/${neighborhoodData.slug}`}
                      className="text-[12px] font-semibold text-brand-gold-deep uppercase tracking-wider hover:text-brand-gold transition-colors flex items-center gap-1"
                    >
                      Full Neighborhood Guide
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </Link>
                  </div>
                </section>
              )}

              {/* ── 13. BUILDING UNITS & HISTORY ── */}
              {listing.address.streetName !== 'Address Undisclosed' && (
                <section className="py-6 border-t border-black/[0.06]">
                  <BuildingUnits
                    streetNumber={listing.address.streetNumber}
                    streetName={listing.address.streetName}
                    postalCode={listing.address.postalCode}
                    currentListingId={listing.id}
                    buildingName={listing.buildingName}
                    currentUnit={listing.address.unitNumber || undefined}
                  />
                </section>
              )}

              {/* ── 13. SIMILAR LISTINGS ── */}
              <section className="py-6 border-t border-black/[0.06]">
                <SimilarListings
                  listingType={listing.listingType}
                  beds={listing.bedroomsTotal}
                  listPrice={listing.listPrice}
                  postalCode={listing.address.postalCode}
                  neighborhood={neighborhood}
                  currentListingId={listing.id}
                  propertyType={listing.propertyType}
                  propertySubType={listing.propertySubType}
                />
              </section>
            </div>

            {/* ═══════════════════════════════════════
                SIDEBAR (1/3)
                ═══════════════════════════════════════ */}
            <div className="lg:col-span-1 min-w-0 hidden lg:block">
              <div className="sticky top-24 space-y-5">

                {/* Contact Card — for a Mallan exclusive, render the ASSIGNED
                    listing agent (name + Mallan contact). The brokerage line is
                    ALWAYS shown for 19 NYCRR §175.25 attribution. Third-party
                    IDX rows carry no `_assignedAgent` (PII stripped) and fall
                    back to the brokerage-only block + default Mallan contact. */}
                <div className="rounded-3xl p-6 border border-black/[0.06]" style={{ background: 'linear-gradient(180deg, #fff 0%, #F8F7F4 100%)' }}>
                  <h3 className="font-display font-semibold text-[15px] text-brand-dark mb-1">Interested in this property?</h3>
                  {listing._assignedAgent?.name ? (
                    /* Mallan exclusive — assigned listing agent (photo/initials,
                       name, §175.25 license title, brokerage). Reuses the
                       ListingSidePanel avatar pattern + AgentsGrid photo style. */
                    <div className="flex items-center gap-3 mt-3 mb-5">
                      <AgentAvatar
                        photo={listing._assignedAgent.photo}
                        name={listing._assignedAgent.name}
                        sizeClass="w-20 h-20"
                      />
                      <div className="min-w-0">
                        {listing._assignedAgent.slug ? (
                          <Link
                            href={`/agents/${listing._assignedAgent.slug}`}
                            className="font-display font-semibold text-[15px] text-brand-dark hover:text-brand-gold-deep transition-colors"
                          >
                            {listing._assignedAgent.name}
                          </Link>
                        ) : (
                          <p className="font-display font-semibold text-[15px] text-brand-dark">{listing._assignedAgent.name}</p>
                        )}
                        {listing._assignedAgent.title && (
                          <p className="text-brand-dark/70 text-[12px] leading-tight">{listing._assignedAgent.title}</p>
                        )}
                        {/* §175.25 brokerage attribution — never dropped. */}
                        <p className="text-brand-dark/50 text-[12px] leading-tight mt-0.5">
                          {publicListOfficeName(listing._assignedAgent.company || listing.listOfficeName)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Third-party IDX/RLS or no assigned agent — brokerage-only
                       block (no agent PII). §175.25 attribution still shown. */
                    <p className="text-brand-dark/50 text-[12px] mb-5 mt-1">
                      {publicListOfficeName(listing._assignedAgent?.company || listing.listOfficeName)}
                    </p>
                  )}
                  <div className="space-y-2.5">
                    <a
                      href={`mailto:${listing._assignedAgent?.email || 'contact@mallan.nyc'}?subject=${encodeURIComponent(`Schedule Showing: ${fullAddress}`)}`}
                      className="btn-liquid flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 font-medium text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      Schedule a Showing
                    </a>
                    <a
                      href={`mailto:${listing._assignedAgent?.email || 'contact@mallan.nyc'}?subject=${encodeURIComponent(`Inquiry: ${fullAddress}`)}`}
                      className="btn-liquid flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-brand-gold text-white rounded-2xl hover:bg-brand-gold-deep font-medium text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      Request Information
                    </a>
                    <a
                      href={`tel:${(listing._assignedAgent?.phone || '646-258-4460').replace(/[^\d+]/g, '')}`}
                      className="flex items-center justify-center gap-2 w-full px-6 py-3 text-brand-dark rounded-2xl ring-1 ring-black/10 hover:bg-gray-50 font-medium text-sm transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                      {listing._assignedAgent?.phone || '(646) 258-4460'}
                    </a>
                  </div>
                </div>

                {/* Open House RSVP (shows only if upcoming open houses exist for this address) */}
                <ListingOpenHouseRSVP listingId={listing.id} listingAddress={fullAddress} listingAddressKey={listingOpenHouseAddressKey} />

                {/* Inquiry Form */}
                <div id="inquiry">
                  <InquiryForm
                    listingId={listing.id}
                    listingAddress={fullAddress}
                    agentEmail="info@mallan.nyc"
                  />
                </div>

                {/* Market Context */}
                <MarketSnapshot
                  neighborhood={neighborhood}
                  borough={borough}
                  listPrice={listing.listPrice}
                  pricePerSqft={listing.livingArea ? listing.listPrice / listing.livingArea : null}
                  listingType={isRental ? 'rent' : 'sale'}
                />

                {/* Transit Summary */}
                {listing.address.latitude && listing.address.longitude && (
                  <TransitSidebarSummary
                    latitude={listing.address.latitude}
                    longitude={listing.address.longitude}
                  />
                )}

                {/* View More */}
                <div className="rounded-3xl p-5 bg-[#F8F7F4]">
                  <p className="font-display font-semibold text-sm mb-3 text-brand-dark">Explore More</p>
                  <div className="space-y-2">
                    <Link
                      href={`/search?tab=${isRental ? 'rent' : 'buy'}-residential`}
                      className="flex items-center justify-between text-[13px] text-brand-dark/70 hover:text-brand-gold transition-colors py-1"
                    >
                      <span>All {isRental ? 'Rentals' : 'Sales'}</span>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </Link>
                    {neighborhood && (
                      <Link
                        href={`/search?tab=${isRental ? 'rent' : 'buy'}-residential&neighborhood=${encodeURIComponent(neighborhood)}`}
                        className="flex items-center justify-between text-[13px] text-brand-dark/70 hover:text-brand-gold transition-colors py-1"
                      >
                        <span>More in {neighborhood}</span>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ═══ Listing Courtesy Attribution (REBNY compliance) ═══ */}
      <section className="border-t border-black/[0.06] py-5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-[13px] text-brand-dark/55">
            RLS · Listing Courtesy of <span className="font-medium text-brand-dark/70">{publicListOfficeName(listing.listOfficeName)}</span>
          </p>
          <span className="text-brand-dark/20">|</span>
          <p className="text-[13px] text-brand-dark/45">
            {listing.modificationTimestamp
              ? `Updated ${new Date(listing.modificationTimestamp).toLocaleDateString()}`
              : 'Updated continuously'}
          </p>
        </div>
      </section>

      {/* ═══ REBNY RLS Disclaimer ═══ */}
      <section className="bg-[#F8F7F4] border-t border-black/[0.06] py-6 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <IDXDisclaimer
            variant="full"
            lastUpdated={listing.modificationTimestamp}
          />
        </div>
      </section>

      {/* ═══ Mobile Open House RSVP + Inquiry Form ═══ */}
      <section className="lg:hidden px-4 py-8 bg-white border-t border-black/[0.06]">
        <div className="max-w-lg mx-auto space-y-6">
          <ListingOpenHouseRSVP listingId={listing.id} listingAddress={fullAddress} listingAddressKey={listingOpenHouseAddressKey} />
          <div id="inquiry">
            <InquiryForm
              listingId={listing.id}
              listingAddress={fullAddress}
              agentEmail="info@mallan.nyc"
            />
          </div>
        </div>
      </section>

      <SocialShareBar title={`${fullAddress} | ${formatPrice(listing.listPrice, isRental)}`} />
    </div>
  );
}
