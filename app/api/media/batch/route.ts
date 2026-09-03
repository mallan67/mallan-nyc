// GET /api/media/batch?ids=RLS-12345,RLS-67890
// Fetches primary photo URLs for a batch of listings from Trestle Media resource.
// Returns map of listingId → proxied photo URL.
//
// Used by CRM search cards to lazy-load photos for listings that don't have
// $expand=Media data (which fails for bulk queries on Trestle).

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { getAccessToken } from "@/lib/idx/auth";
import { resolveListingMedia, pickPrimaryPhotoUrl } from "@/lib/media/listing-media-resolver";
import {
  MediaIdentityDomain,
  groupMediaByRequestedDomain,
  mediaFilterForDomain,
} from "@/lib/media/batch-identity";

const TRESTLE_API =
  process.env.TRESTLE_API_URL ||
  process.env.IDX_ENDPOINT ||
  "https://api.cotality.com/trestle";

// Trestle Media has only 2 categories: Photo and FloorPlan.
// Videos/VirtualTours/3D come from Property fields (VirtualTourURLUnbranded), not Media resource.
// Classification + photo-first ordering is centralised in
// lib/media/listing-media-resolver.ts (used by both `detail` and default modes).

type MediaEntry = { url: string; mediaType: string; order: number };

// In-memory cache (persist across requests within the same serverless instance)
const photoCache = new Map<string, { url: string | null; expiresAt: number }>();
const mediaCache = new Map<string, { items: MediaEntry[]; expiresAt: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * A CACHE KEY CARRIES ITS DOMAIN.
 *
 * Both caches were keyed by the raw request identifier, so the SAME string
 * asked in two domains shared one entry - and, worse, a detail-mode null
 * could be read back by the card path as a settled "no photo" for the next
 * 30 minutes. Two different questions may not share an answer slot.
 */
const cacheKeyFor = (id: string, domain: MediaIdentityDomain) => `${domain}:${id}`;

/**
 * The rows of a provider response, or a THROWN failure.
 *
 * `data.value || []` turned a 200 whose body was not the expected shape into
 * "this listing has no media" - a malformed answer becoming a confident
 * negative. An absent `value` is a failure to answer, and is raised so the
 * caller is told the media is unavailable rather than absent.
 */
/**
 * Did the provider say more media follows than it returned?
 *
 * `$top` bounds the read, and a response that FILLS it may have been cut
 * short - with `$orderby Order asc` applied across the whole batch, the
 * listings whose media sort last are the ones that lose rows. A gallery
 * silently missing its tail looks exactly like a complete one.
 */
function providerTruncated(data: unknown): boolean {
  return Boolean((data as { '@odata.nextLink'?: unknown })?.['@odata.nextLink']);
}

function providerRows(data: unknown): Record<string, unknown>[] {
  const value = (data as { value?: unknown })?.value;
  if (!Array.isArray(value)) {
    throw new Error('Provider returned 200 without a `value` array');
  }
  return value as Record<string, unknown>[];
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // TWO IDENTITY DOMAINS, NAMED SEPARATELY.
  //
  // `keys` are Cotality ListingKeys and match Media.ResourceRecordKey.
  // `ids`  are Cotality ListingIds  and match Media.ResourceRecordID.
  //
  // Probed live 2026-09-01 on three listings (PhotosCount 30/23/8): each
  // field matches its OWN domain exactly, and every cross-domain query
  // returned count 0 - an empty HTTP 200 indistinguishable on screen from
  // "this listing has no photos". So the caller states which domain it holds
  // rather than the route inferring it.
  //
  // `keys` is the path Search uses, and it needs NO database round-trip: the
  // search row already carries the provider key. The old single-parameter
  // form had to look the key up in `prisma.listing`, which MISSES for every
  // live-Cotality result that was never persisted locally.
  const keysParam = req.nextUrl.searchParams.get("keys");
  const idsParam = req.nextUrl.searchParams.get("ids");
  if (!keysParam && !idsParam) {
    return NextResponse.json(
      { error: "Missing keys or ids parameter" },
      { status: 400 },
    );
  }

  // A provider key is supplied, so the domain is already known and the DB
  // translation below is skipped entirely.
  // THE DOMAIN OF THIS REQUEST, DECIDED ONCE.
  //
  // Everything downstream - the $filter field, the grouping field and the
  // lookup key - is derived from this single value. They used to be chosen
  // independently, two lines apart, and they drifted: the filter asked
  // ResourceRecordID, the grouping used `ResourceRecordKey || ResourceRecordID`
  // (Key always wins, both are populated), and the lookup asked for the RLS
  // id again. Empty gallery, deterministically, for every provider-only
  // listing - while the card thumbnail beside it worked.
  const requestDomain = keysParam
    ? MediaIdentityDomain.PROVIDER_KEY
    : MediaIdentityDomain.PROVIDER_ID;


  // Parse and limit batch size
  const ids = (keysParam ?? idsParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    // A MALLAN-LOCAL LISTING HAS NO PROVIDER KEY.
    //
    // SL-/RL- identities are Mallan-authored. Asking Cotality about one is
    // asking the wrong system, and manufacturing a ListingKey for it would
    // put a fabricated provider identity into the media path. Their media is
    // Mallan canonical media, resolved elsewhere.
    .filter((s) => !/^(SL-|RL-)/i.test(s))
    .slice(0, 50); // Max 50 per request

  if (ids.length === 0) {
    return NextResponse.json({ photos: {} });
  }

  // detail=true: fetch all media types (for detail panel — max 5 IDs)
  // default: fetch primary photo only (for cards — fast, up to 50 IDs)
  const detail = req.nextUrl.searchParams.get("detail") === "true";

  const now = Date.now();
  const photoResult: Record<string, string | null> = {};
  const mediaResult: Record<string, MediaEntry[]> = {};

  // THE DATABASE ROUND-TRIP IS GONE.
  //
  // It existed to translate a ListingId into a ListingKey via `Listing.mls_id`,
  // and it is what made the two domains mixable in the first place: the query
  // could end up in one domain and the indexing in another depending on
  // whether a row happened to be present. It also MISSED for every
  // live-Cotality search result, which is precisely the population Search
  // shows. The caller now states its own domain, so there is nothing to
  // translate and no database read on the media path at all.
  //
  // Trestle guidance (2026-04-07) still stands: ResourceRecordKey is unique
  // across MLOs and ResourceRecordID can duplicate. That is why every Mallan
  // caller sends `keys`; `ids` remains supported for legacy readers and is
  // answered honestly in its own domain rather than silently upgraded.

  // Identifiers whose media could NOT be established, as opposed to
  // identifiers that genuinely have none. A caller that cannot tell those
  // apart will render a placeholder and call it an answer.
  const unavailable: string[] = [];

  // The provider had more media than this read returned. The rows present
  // are correct; completeness is what is not claimed.
  let truncated = false;
  if (detail) {
    // ── DETAIL MODE: all media types for a small batch (detail panel) ──
    const detailIds = ids.slice(0, 25); // Limit to 25 for reports (was 5 — too few for multi-listing reports)
    const uncached: string[] = [];
    for (const id of detailIds) {
      const cached = mediaCache.get(cacheKeyFor(id, requestDomain));
      if (cached && now < cached.expiresAt) {
        mediaResult[id] = cached.items;
        // Also populate primary photo
        const photo = cached.items.find(m => m.mediaType === "Photo");
        photoResult[id] = photo?.url || null;
      } else {
        uncached.push(id);
      }
    }

    if (uncached.length > 0) {
      try {
        const token = await getAccessToken();
        // ONE DOMAIN. The filter field and the grouping field now come from
        // the same source, so they cannot disagree.
        const filterParts = [mediaFilterForDomain(uncached, requestDomain)];
        // Fetch ALL media for detail view — photos, floorplans, videos, virtual tours, 3D.
        // MediaStatus filter: exclude tombstoned photos retained by Trestle as historical records.
        const filter = `(${filterParts.join(" or ")}) and MediaStatus ne 'Deleted'`;
        const params = new URLSearchParams();
        params.set("$filter", filter);
        // E-0: request the provider's media display authorization.
        params.set("$select", "ResourceRecordKey,ResourceRecordID,MediaURL,Order,MediaCategory,MediaClassification,PreferredPhotoYN,ShortDescription,MediaStatus,InternetEntireListingDisplayYN");
        // Order by Order only — alphabetical sort on MediaCategory put
        // 'FloorPlan' BEFORE 'Photo' (alphabetical), causing detail galleries
        // to open on a floor plan. Photo-first ordering is now applied
        // post-fetch via resolveListingMedia().
        params.set("$orderby", "Order asc");
        params.set("$top", String(uncached.length * 40)); // Up to 40 media items per listing

        const response = await fetch(`${TRESTLE_API}/odata/Media?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });

        if (response.ok) {
          const data = await response.json();
          if (providerTruncated(data)) {
            // Reported, never silently accepted. The rows we have are real;
            // what we cannot say is that they are all of them.
            console.warn(`[Media Batch Detail] provider signalled more media than $top returned for ${uncached.length} listing(s) - gallery may be partial`);
            truncated = true;
          }
          if (providerTruncated(data)) {
          console.warn(`[Media Batch] provider signalled more media than $top returned for ${uncached.length} listing(s)`);
          truncated = true;
        }
        const rawByKey = groupMediaByRequestedDomain(
            providerRows(data),
            requestDomain,
          );
          for (const id of uncached) {
            // Looked up by the identifier the CALLER sent, in the domain it
            // was queried and grouped in. No translation, so nothing to drift.
            const rawItems = rawByKey.get(id) || [];
            // Photo-first sort + proxy via shared resolver. Guarantees
            // mediaResult[id] starts with a Photo whenever one exists, even
            // if Trestle returned them in mixed order.
            const resolved = resolveListingMedia(rawItems);
            const items = resolved.map(r => ({
              url: r.url,
              mediaType: r.mediaType,
              order: r.providerOrder,
            }));
            mediaResult[id] = items;
            mediaCache.set(cacheKeyFor(id, requestDomain), { items, expiresAt: now + CACHE_TTL });
            // pickPrimaryPhotoUrl: strict photo only — never returns a
            // floor-plan URL as the primary thumbnail. If no real photo
            // exists, returns null and the frontend renders the placeholder.
            const photo = resolved.find(m => m.class === "photo");
            photoResult[id] = photo?.url ?? null;
            photoCache.set(cacheKeyFor(id, requestDomain), { url: photo?.url ?? null, expiresAt: now + CACHE_TTL });
          }
        } else {
          // A provider failure is not an empty gallery. Neither is cached.
          console.error(`[Media Batch Detail] provider HTTP ${response.status} for ${uncached.length} listing(s)`);
          for (const id of uncached) {
            mediaResult[id] = []; photoResult[id] = null; unavailable.push(id);
          }
        }
      } catch (err) {
        console.error("[Media Batch Detail] Error:", err instanceof Error ? err.message : err);
        for (const id of uncached) {
          mediaResult[id] = []; photoResult[id] = null; unavailable.push(id);
        }
      }
    }
    return NextResponse.json(
      { photos: photoResult, media: mediaResult, unavailable, truncated },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  }

  // ── DEFAULT MODE: primary photo only (fast, for card thumbnails) ──
  const result: Record<string, string | null> = {};
  const uncached: string[] = [];

  for (const id of ids) {
    const cached = photoCache.get(cacheKeyFor(id, requestDomain));
    if (cached && now < cached.expiresAt) {
      result[id] = cached.url;
    } else {
      uncached.push(id);
    }
  }

  if (uncached.length > 0) {
    try {
      const token = await getAccessToken();
      // ONE DOMAIN, same as detail mode above.
      const filterParts = [mediaFilterForDomain(uncached, requestDomain)];
      // MediaStatus filter: exclude tombstoned photos retained by Trestle as historical records.
      const filter = `(${filterParts.join(" or ")}) and (MediaCategory eq 'Photo' or MediaCategory eq null) and MediaStatus ne 'Deleted'`;
      const params = new URLSearchParams();
      params.set("$filter", filter);
      // E-0: request the provider's media display authorization.
      params.set("$select", "ResourceRecordKey,ResourceRecordID,MediaURL,Order,PreferredPhotoYN,MediaStatus,InternetEntireListingDisplayYN");
      params.set("$orderby", "Order asc");
      params.set("$top", String(uncached.length * 2));

      const response = await fetch(`${TRESTLE_API}/odata/Media?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        // Group all Media rows per key, then pick the first PHOTO via the canonical
        // resolver (photo-first + proxy). The prior byKey-first-URL took whatever the
        // feed ordered first — a null-category DOCUMENT- floorplan could become the card.
        const rawByKey = groupMediaByRequestedDomain(
          providerRows(data),
          requestDomain,
        );
        for (const id of uncached) {
          // By the caller's own identifier, in the caller's own domain.
          const url = pickPrimaryPhotoUrl(rawByKey.get(id) || []);
          result[id] = url;
          photoCache.set(cacheKeyFor(id, requestDomain), { url, expiresAt: now + CACHE_TTL });
        }
      } else {
        // DO NOT CACHE A FALSE "NO PHOTO".
        //
        // This cached null for 60s on any non-OK provider response, so one
        // bad minute became a minute of listings positively asserting they
        // have no photo - which is indistinguishable, on a card, from a
        // listing that truly has none. The failure is reported instead, and
        // the next request is free to succeed.
        console.error(`[Media Batch] provider HTTP ${response.status} for ${uncached.length} listing(s)`);
        for (const id of uncached) {
          result[id] = null;
          unavailable.push(id);
        }
      }
    } catch (err) {
      console.error("[Media Batch] Error:", err instanceof Error ? err.message : err);
      for (const id of uncached) { result[id] = null; unavailable.push(id); }
    }
  }

  return NextResponse.json(
    { photos: result, unavailable, truncated },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
