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

const TRESTLE_API =
  process.env.TRESTLE_API_URL ||
  process.env.IDX_ENDPOINT ||
  "https://api.cotality.com/trestle";

// Trestle Media has only 2 categories: Photo and FloorPlan.
// Videos/VirtualTours/3D come from Property fields (VirtualTourURLUnbranded), not Media resource.
// MediaClassification: PHOTO or DOCUMENT. ShortDescription: "FloorPlan" for floor plans.
function classifyMediaCategory(m: Record<string, unknown>): "Photo" | "FloorPlan" {
  const cat = String(m.MediaCategory || "").toLowerCase();
  const cls = String(m.MediaClassification || "").toLowerCase();
  const desc = String(m.ShortDescription || "").toLowerCase();
  if (cat === "floorplan" || cat.includes("floor plan") || cls === "document" || desc.includes("floorplan") || desc.includes("floor plan")) return "FloorPlan";
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
        // Fetch ALL media for detail view — photos, floorplans, videos, virtual tours, 3D
        const filter = `(${filterParts.join(" or ")})`;
        const params = new URLSearchParams();
        params.set("$filter", filter);
        params.set("$select", "ResourceRecordKey,ResourceRecordID,MediaURL,Order,MediaCategory,MediaClassification,PreferredPhotoYN,ShortDescription");
        params.set("$orderby", "MediaCategory asc,Order asc");
        params.set("$top", String(uncached.length * 40)); // Up to 40 media items per listing

        const response = await fetch(`${TRESTLE_API}/odata/Media?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });

        if (response.ok) {
          const data = await response.json();
          const allByKey = new Map<string, MediaEntry[]>();
          for (const m of (data.value || [])) {
            const mkey = String(m.ResourceRecordKey || m.ResourceRecordID || "");
            if (!mkey || !m.MediaURL) continue;
            const rawUrl = String(m.MediaURL);
            const proxiedUrl = rawUrl.includes("cotality.com") || rawUrl.includes("corelogic.com")
              ? `/api/media/proxy?url=${encodeURIComponent(rawUrl)}` : rawUrl;
            const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === "true";
            if (!allByKey.has(mkey)) allByKey.set(mkey, []);
            allByKey.get(mkey)!.push({
              url: proxiedUrl,
              mediaType: classifyMediaCategory(m),
              order: isPreferred ? -1 : Number(m.Order ?? 0),
            });
          }
          for (const id of uncached) {
            const key = idToKey.get(id) || id;
            const items = allByKey.get(key) || [];
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
      // Use ResourceRecordKey (unique) per Trestle guidance
      const filterParts = uncached.map((id) => {
        const key = idToKey.get(id) || id;
        const escaped = key.replace(/'/g, "''");
        return key !== id ? `ResourceRecordKey eq '${escaped}'` : `ResourceRecordID eq '${escaped}'`;
      });
      const filter = `(${filterParts.join(" or ")}) and (MediaCategory eq 'Photo' or MediaCategory eq null)`;
      const params = new URLSearchParams();
      params.set("$filter", filter);
      params.set("$select", "ResourceRecordKey,ResourceRecordID,MediaURL,Order,PreferredPhotoYN");
      params.set("$orderby", "Order asc");
      params.set("$top", String(uncached.length * 2));

      const response = await fetch(`${TRESTLE_API}/odata/Media?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        const byKey = new Map<string, string>();
        for (const m of (data.value || [])) {
          const mkey = String(m.ResourceRecordKey || m.ResourceRecordID || "");
          if (mkey && !byKey.has(mkey) && m.MediaURL) {
            const rawUrl = String(m.MediaURL);
            byKey.set(mkey, rawUrl.includes("cotality.com") || rawUrl.includes("corelogic.com")
              ? `/api/media/proxy?url=${encodeURIComponent(rawUrl)}` : rawUrl);
          }
        }
        for (const id of uncached) {
          const key = idToKey.get(id) || id;
          const url = byKey.get(key) || null;
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
