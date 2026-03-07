// GET /api/media/batch?ids=RLS-12345,RLS-67890
// Fetches primary photo URLs for a batch of listings from Trestle Media resource.
// Returns map of listingId → proxied photo URL.
//
// Used by CRM search cards to lazy-load photos for listings that don't have
// $expand=Media data (which fails for bulk queries on Trestle).

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { getAccessToken } from "@/lib/idx/auth";

const TRESTLE_API =
  process.env.TRESTLE_API_URL ||
  process.env.IDX_ENDPOINT ||
  "https://api.cotality.com/trestle";

// RESO DD: MediaCategory = content type classification
function classifyMediaCategory(m: Record<string, unknown>): "Photo" | "FloorPlan" | "Video" | "VirtualTour" {
  const cat = String(m.MediaCategory || "").toLowerCase();
  if (cat.includes("floor plan")) return "FloorPlan";
  if (cat.includes("video")) return "Video";
  if (cat.includes("virtual tour")) return "VirtualTour";
  return "Photo";
}

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

  const now = Date.now();
  const photoResult: Record<string, string | null> = {};
  const mediaResult: Record<string, MediaEntry[]> = {};
  const uncachedPhotos: string[] = [];
  const uncachedMedia: string[] = [];

  // Check caches
  for (const id of ids) {
    const cachedPhoto = photoCache.get(id);
    if (cachedPhoto && now < cachedPhoto.expiresAt) {
      photoResult[id] = cachedPhoto.url;
    } else {
      uncachedPhotos.push(id);
    }
    const cachedMedia = mediaCache.get(id);
    if (cachedMedia && now < cachedMedia.expiresAt) {
      mediaResult[id] = cachedMedia.items;
    } else {
      uncachedMedia.push(id);
    }
  }

  // Fetch ALL media types from Trestle Media resource (photos, floor plans, videos, virtual tours)
  const toFetch = [...new Set([...uncachedPhotos, ...uncachedMedia])];
  if (toFetch.length > 0) {
    try {
      const token = await getAccessToken();

      const filterParts = toFetch.map(
        (id) => `ResourceRecordID eq '${id.replace(/'/g, "''")}'`
      );
      // Fetch all media types — up to 6 items per listing (3 photos + floor plans + videos + tours)
      const filter = `(${filterParts.join(" or ")}) and (Order le 3 or MediaCategory ne 'Photo')`;

      const params = new URLSearchParams();
      params.set("$filter", filter);
      params.set("$select", "ResourceRecordID,MediaURL,Order,MediaType,MediaCategory,PreferredPhotoYN,ShortDescription");
      params.set("$orderby", "ResourceRecordID asc,Order asc");
      params.set("$top", String(Math.min(toFetch.length * 6, 300)));

      const url = `${TRESTLE_API}/odata/Media?${params.toString()}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        const records = data.value || [];

        // Group all media by listing
        const allByListing = new Map<string, MediaEntry[]>();
        const primaryByListing = new Map<string, string>();

        for (const m of records) {
          const lid = String(m.ResourceRecordID || "");
          if (!lid || !m.MediaURL) continue;

          const mediaType = classifyMediaCategory(m);
          const rawUrl = String(m.MediaURL);
          const proxiedUrl = rawUrl.includes("cotality.com") || rawUrl.includes("corelogic.com")
            ? `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`
            : rawUrl;
          const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === "true";

          if (!allByListing.has(lid)) allByListing.set(lid, []);
          allByListing.get(lid)!.push({
            url: proxiedUrl,
            mediaType,
            order: isPreferred ? -1 : Number(m.Order ?? 0),
          });

          // Track primary photo (first photo by order, or preferred)
          if (mediaType === "Photo" && !primaryByListing.has(lid)) {
            primaryByListing.set(lid, proxiedUrl);
          }
        }

        // Populate and cache
        for (const id of toFetch) {
          const primary = primaryByListing.get(id) || null;
          photoResult[id] = primary;
          photoCache.set(id, { url: primary, expiresAt: now + CACHE_TTL });

          const items = allByListing.get(id) || [];
          mediaResult[id] = items;
          mediaCache.set(id, { items, expiresAt: now + CACHE_TTL });
        }
      } else {
        // Fallback: mark as empty
        for (const id of toFetch) {
          photoResult[id] = null;
          photoCache.set(id, { url: null, expiresAt: now + 60_000 });
          mediaResult[id] = [];
          mediaCache.set(id, { items: [], expiresAt: now + 60_000 });
        }
      }
    } catch (err) {
      console.error("[Media Batch] Error:", err instanceof Error ? err.message : err);
      for (const id of toFetch) {
        photoResult[id] = null;
        mediaResult[id] = [];
      }
    }
  }

  return NextResponse.json(
    { photos: photoResult, media: mediaResult },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
