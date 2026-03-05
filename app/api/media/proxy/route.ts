// GET /api/media/proxy?url=<trestle-media-url>
// Server-side proxy for Trestle media URLs that require Bearer auth.
// The browser <img> tag cannot send auth headers, so we proxy through here.
//
// SECURITY:
// - Only proxies URLs from allowed Trestle/Cotality domains
// - Adds Bearer token server-side (never exposed to client)
// - Caches responses for 24 hours (CDN + browser)
// - Rate limited by upstream /api rate limiting in next.config.js

import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/idx/auth";

// Only allow proxying from Trestle/Cotality media domain (migrated to api.cotality.com)
const ALLOWED_HOSTS = new Set([
  "api.cotality.com",
]);

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const mediaUrl = req.nextUrl.searchParams.get("url");

  if (!mediaUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  if (!isAllowedUrl(mediaUrl)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const token = await getAccessToken();

    const response = await fetch(mediaUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "image/*",
      },
    });

    if (!response.ok) {
      return new NextResponse(null, { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000, immutable",
        "CDN-Cache-Control": "public, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[Media Proxy] Error:", err instanceof Error ? err.message : err);
    return new NextResponse(null, { status: 502 });
  }
}
