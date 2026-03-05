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

// In-memory cache for photo URLs (persist across requests within the same serverless instance)
const photoCache = new Map<string, { url: string | null; expiresAt: number }>();
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
  const result: Record<string, string | null> = {};
  const uncached: string[] = [];

  // Check cache first
  for (const id of ids) {
    const cached = photoCache.get(id);
    if (cached && now < cached.expiresAt) {
      result[id] = cached.url;
    } else {
      uncached.push(id);
    }
  }

  // Fetch uncached from Trestle Media resource
  if (uncached.length > 0) {
    try {
      const token = await getAccessToken();

      // Build OData filter: ResourceRecordID in ('RLS-12345','RLS-67890')
      // Trestle Media uses ResourceRecordID to link to Property.ListingId
      const filterParts = uncached.map(
        (id) => `ResourceRecordID eq '${id.replace(/'/g, "''")}'`
      );
      const filter = `(${filterParts.join(" or ")}) and Order eq 0`;

      const params = new URLSearchParams();
      params.set("$filter", filter);
      params.set("$select", "ResourceRecordID,MediaURL,Order,MediaType");
      params.set("$orderby", "Order asc");
      params.set("$top", String(uncached.length * 2)); // Allow some extras

      const url = `${TRESTLE_API}/odata/Media?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        const records = data.value || [];

        // Group by ResourceRecordID, take first (Order=0) photo
        const byListing = new Map<string, string>();
        for (const m of records) {
          const lid = String(m.ResourceRecordID || "");
          if (lid && !byListing.has(lid) && m.MediaURL) {
            byListing.set(lid, String(m.MediaURL));
          }
        }

        // Populate results and cache
        for (const id of uncached) {
          const mediaUrl = byListing.get(id) || null;
          const proxiedUrl = mediaUrl
            ? `/api/media/proxy?url=${encodeURIComponent(mediaUrl)}`
            : null;
          result[id] = proxiedUrl;
          photoCache.set(id, { url: proxiedUrl, expiresAt: now + CACHE_TTL });
        }
      } else {
        // If Order=0 filter fails, try without it
        const params2 = new URLSearchParams();
        const filterParts2 = uncached.map(
          (id) => `ResourceRecordID eq '${id.replace(/'/g, "''")}'`
        );
        params2.set("$filter", `(${filterParts2.join(" or ")})`);
        params2.set("$select", "ResourceRecordID,MediaURL,Order");
        params2.set("$orderby", "ResourceRecordID asc,Order asc");
        params2.set("$top", String(uncached.length * 2));

        const url2 = `${TRESTLE_API}/odata/Media?${params2.toString()}`;
        const response2 = await fetch(url2, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (response2.ok) {
          const data2 = await response2.json();
          const records2 = data2.value || [];
          const byListing2 = new Map<string, string>();
          for (const m of records2) {
            const lid = String(m.ResourceRecordID || "");
            if (lid && !byListing2.has(lid) && m.MediaURL) {
              byListing2.set(lid, String(m.MediaURL));
            }
          }
          for (const id of uncached) {
            const mediaUrl = byListing2.get(id) || null;
            const proxiedUrl = mediaUrl
              ? `/api/media/proxy?url=${encodeURIComponent(mediaUrl)}`
              : null;
            result[id] = proxiedUrl;
            photoCache.set(id, { url: proxiedUrl, expiresAt: now + CACHE_TTL });
          }
        } else {
          // Mark as null to avoid retrying immediately
          for (const id of uncached) {
            result[id] = null;
            photoCache.set(id, { url: null, expiresAt: now + 60_000 }); // Short TTL for failures
          }
        }
      }
    } catch (err) {
      console.error("[Media Batch] Error:", err instanceof Error ? err.message : err);
      for (const id of uncached) {
        result[id] = null;
      }
    }
  }

  return NextResponse.json(
    { photos: result },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
