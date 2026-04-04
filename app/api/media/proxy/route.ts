// GET /api/media/proxy?url=<trestle-media-url>
// Server-side proxy for Trestle media URLs that require Bearer auth.
// The browser <img> tag cannot send auth headers, so we proxy through here.
//
// SECURITY:
// - Only proxies URLs from allowed Trestle/Cotality domains
// - Adds Bearer token server-side (never exposed to client)
// - Caches responses for 7 days (CDN + browser)
// - Concurrency-limited to avoid Trestle throttling

import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/idx/auth";

// Allow proxying from Trestle/Cotality media domains
// Old CoreLogic hosts deprecated — deadline April 30, 2026
// Old media URLs still work through 2026 warranty per Cotality email
const ALLOWED_HOSTS = new Set([
  "api.cotality.com",
  "api-trestle.corelogic.com",
  "api-prod.corelogic.com",
]);

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

// Semaphore: limit concurrent outbound requests to Trestle.
// Prevents connection pool exhaustion that causes alternating photo failures.
const MAX_CONCURRENT = 15;
let inFlight = 0;
const waitQueue: (() => void)[] = [];

function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(resolve);
  });
}

function releaseSlot(): void {
  if (waitQueue.length > 0) {
    const next = waitQueue.shift()!;
    next();
  } else {
    inFlight--;
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

  await acquireSlot();

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

    // Stream the response instead of buffering the full image in memory
    const body = response.body;

    return new NextResponse(body, {
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
  } finally {
    releaseSlot();
  }
}
