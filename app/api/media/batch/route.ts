// GET /api/media/batch?ids=RLS-12345,RLS-67890
// Fetches primary photo URLs for a batch of listings from Trestle Media resource.
// Returns map of listingId → proxied photo URL.
//
// Used by CRM search cards to lazy-load photos for listings that don't have
// $expand=Media data (which fails for bulk queries on Trestle).

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { getAccessToken } from "@/lib/idx/auth";
import prisma from "@/lib/prisma";
import { resolveListingMedia, pickPrimaryPhotoUrl } from "@/lib/media/listing-media-resolver";

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

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const idsParam = req.nextUrl.searchParams.get("ids");
  if (!idsParam) {
    return NextResponse.json({ error: "Missing ids parameter" }, { status: 400 });
  }

  // Parse and limit batch size
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
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

  // Trestle guidance (2026-04-07): use ResourceRecordKey (always unique across MLOs),
  // NOT ResourceRecordID (can duplicate). Resolve mls_id (= ListingKey = ResourceRecordKey) from DB.
  const dbListings = await prisma.listing.findMany({
    where: { listing_id: { in: ids } },
    select: { listing_id: true, mls_id: true },
  });
  const idToKey = new Map<string, string>();
  const keyToId = new Map<string, string>();
  for (const l of dbListings) {
    const key = l.mls_id || l.listing_id;
    idToKey.set(l.listing_id, key);
    keyToId.set(key, l.listing_id);
  }
  // For IDs not in DB, use the ID itself as fallback
  for (const id of ids) {
    if (!idToKey.has(id)) {
      idToKey.set(id, id);
      keyToId.set(id, id);
    }
  }

  if (detail) {
    // ── DETAIL MODE: all media types for a small batch (detail panel) ──
    const detailIds = ids.slice(0, 25); // Limit to 25 for reports (was 5 — too few for multi-listing reports)
    const uncached: string[] = [];
    for (const id of detailIds) {
      const cached = mediaCache.get(id);
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
        // Use ResourceRecordKey (unique) per Trestle guidance, fallback to ResourceRecordID
        const filterParts = uncached.map((id) => {
          const key = idToKey.get(id) || id;
          const escaped = key.replace(/'/g, "''");
          return key !== id ? `ResourceRecordKey eq '${escaped}'` : `ResourceRecordID eq '${escaped}'`;
        });
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
          const rawByKey = new Map<string, Record<string, unknown>[]>();
          for (const m of (data.value || [])) {
            // E-0: refuse provider-suppressed media before it can reach a
            // gallery or become a hero. Explicit `false` only.
            if (m.InternetEntireListingDisplayYN === false) continue;
            const mkey = String(m.ResourceRecordKey || m.ResourceRecordID || "");
            if (!mkey || !m.MediaURL) continue;
            if (!rawByKey.has(mkey)) rawByKey.set(mkey, []);
            rawByKey.get(mkey)!.push(m);
          }
          for (const id of uncached) {
            const key = idToKey.get(id) || id;
            const rawItems = rawByKey.get(key) || [];
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
            mediaCache.set(id, { items, expiresAt: now + CACHE_TTL });
            // pickPrimaryPhotoUrl: strict photo only — never returns a
            // floor-plan URL as the primary thumbnail. If no real photo
            // exists, returns null and the frontend renders the placeholder.
            const photo = resolved.find(m => m.class === "photo");
            photoResult[id] = photo?.url ?? null;
            photoCache.set(id, { url: photo?.url ?? null, expiresAt: now + CACHE_TTL });
          }
        } else {
          for (const id of uncached) { mediaResult[id] = []; photoResult[id] = null; }
        }
      } catch (err) {
        console.error("[Media Batch Detail] Error:", err instanceof Error ? err.message : err);
        for (const id of uncached) { mediaResult[id] = []; photoResult[id] = null; }
      }
    }
    return NextResponse.json(
      { photos: photoResult, media: mediaResult },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  }

  // ── DEFAULT MODE: primary photo only (fast, for card thumbnails) ──
  const result: Record<string, string | null> = {};
  const uncached: string[] = [];

  for (const id of ids) {
    const cached = photoCache.get(id);
    if (cached && now < cached.expiresAt) {
      result[id] = cached.url;
    } else {
      uncached.push(id);
    }
  }

  if (uncached.length > 0) {
    try {
      const token = await getAccessToken();
      // Use ResourceRecordKey (unique) per Trestle guidance
      const filterParts = uncached.map((id) => {
        const key = idToKey.get(id) || id;
        const escaped = key.replace(/'/g, "''");
        return key !== id ? `ResourceRecordKey eq '${escaped}'` : `ResourceRecordID eq '${escaped}'`;
      });
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
        const rawByKey = new Map<string, Array<Record<string, unknown>>>();
        for (const m of (data.value || [])) {
          // E-0: refuse provider-suppressed media before hero selection.
          if (m.InternetEntireListingDisplayYN === false) continue;
          const mkey = String(m.ResourceRecordKey || m.ResourceRecordID || "");
          if (mkey && m.MediaURL) {
            if (!rawByKey.has(mkey)) rawByKey.set(mkey, []);
            rawByKey.get(mkey)!.push(m as Record<string, unknown>);
          }
        }
        for (const id of uncached) {
          const key = idToKey.get(id) || id;
          const url = pickPrimaryPhotoUrl(rawByKey.get(key) || []);
          result[id] = url;
          photoCache.set(id, { url, expiresAt: now + CACHE_TTL });
        }
      } else {
        for (const id of uncached) {
          result[id] = null;
          photoCache.set(id, { url: null, expiresAt: now + 60_000 });
        }
      }
    } catch (err) {
      console.error("[Media Batch] Error:", err instanceof Error ? err.message : err);
      for (const id of uncached) { result[id] = null; }
    }
  }

  return NextResponse.json(
    { photos: result },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
