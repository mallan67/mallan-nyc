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
function classifyMediaCategory(m: Record<string, unknown>): "Photo" | "FloorPlan" | "Video" | "VirtualTour" | "3DTour" {
  const cat = String(m.MediaCategory || "").toLowerCase();
  const desc = String(m.ShortDescription || "").toLowerCase();
  const mime = String(m.MimeType || "").toLowerCase();
  if (cat.includes("floor plan") || desc.includes("floor plan") || desc.includes("floorplan")) return "FloorPlan";
  if (cat.includes("3d") || cat.includes("matterport") || desc.includes("3d") || desc.includes("matterport")) return "3DTour";
  if (cat.includes("virtual tour") || desc.includes("virtual tour")) return "VirtualTour";
  if (cat.includes("video") || mime.includes("video")) return "Video";
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

  // detail=true: fetch all media types (for detail panel — max 5 IDs)
  // default: fetch primary photo only (for cards — fast, up to 50 IDs)
  const detail = req.nextUrl.searchParams.get("detail") === "true";

  const now = Date.now();
  const photoResult: Record<string, string | null> = {};
  const mediaResult: Record<string, MediaEntry[]> = {};

  if (detail) {
    // ── DETAIL MODE: all media types for a small batch (detail panel) ──
    const detailIds = ids.slice(0, 5); // Limit to 5 for detail
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
        const filterParts = uncached.map(
          (id) => `ResourceRecordID eq '${id.replace(/'/g, "''")}'`
        );
        // Fetch ALL media for detail view — photos, floorplans, videos, virtual tours, 3D
        const filter = `(${filterParts.join(" or ")})`;
        const params = new URLSearchParams();
        params.set("$filter", filter);
        params.set("$select", "ResourceRecordID,MediaURL,Order,MediaCategory,PreferredPhotoYN,MimeType,ShortDescription");
        params.set("$orderby", "ResourceRecordID asc,MediaCategory asc,Order asc");
        params.set("$top", String(uncached.length * 40)); // Up to 40 media items per listing

        const response = await fetch(`${TRESTLE_API}/odata/Media?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });

        if (response.ok) {
          const data = await response.json();
          const allByListing = new Map<string, MediaEntry[]>();
          for (const m of (data.value || [])) {
            const lid = String(m.ResourceRecordID || "");
            if (!lid || !m.MediaURL) continue;
            const rawUrl = String(m.MediaURL);
            const proxiedUrl = rawUrl.includes("cotality.com") || rawUrl.includes("corelogic.com")
              ? `/api/media/proxy?url=${encodeURIComponent(rawUrl)}` : rawUrl;
            const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === "true";
            if (!allByListing.has(lid)) allByListing.set(lid, []);
            allByListing.get(lid)!.push({
              url: proxiedUrl,
              mediaType: classifyMediaCategory(m),
              order: isPreferred ? -1 : Number(m.Order ?? 0),
            });
          }
          for (const id of uncached) {
            const items = allByListing.get(id) || [];
            mediaResult[id] = items;
            mediaCache.set(id, { items, expiresAt: now + CACHE_TTL });
            const photo = items.find(m => m.mediaType === "Photo");
            photoResult[id] = photo?.url || null;
            photoCache.set(id, { url: photo?.url || null, expiresAt: now + CACHE_TTL });
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
      const filterParts = uncached.map(
        (id) => `ResourceRecordID eq '${id.replace(/'/g, "''")}'`
      );
      const filter = `(${filterParts.join(" or ")}) and (MediaCategory eq 'Photo' or MediaCategory eq null)`;
      const params = new URLSearchParams();
      params.set("$filter", filter);
      params.set("$select", "ResourceRecordID,MediaURL,Order,PreferredPhotoYN");
      params.set("$orderby", "Order asc");
      params.set("$top", String(uncached.length * 2));

      const response = await fetch(`${TRESTLE_API}/odata/Media?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        const byListing = new Map<string, string>();
        for (const m of (data.value || [])) {
          const lid = String(m.ResourceRecordID || "");
          if (lid && !byListing.has(lid) && m.MediaURL) {
            const rawUrl = String(m.MediaURL);
            byListing.set(lid, rawUrl.includes("cotality.com") || rawUrl.includes("corelogic.com")
              ? `/api/media/proxy?url=${encodeURIComponent(rawUrl)}` : rawUrl);
          }
        }
        for (const id of uncached) {
          const url = byListing.get(id) || null;
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
