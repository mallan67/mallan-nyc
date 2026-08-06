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
import { ALLOWED_MEDIA_HOSTS, isAllowedMediaUrl } from "@/lib/media/proxy-url-policy";
import { getAccessToken } from "@/lib/idx/auth";

// Allow proxying from Trestle/Cotality media domains
// Old CoreLogic hosts deprecated — deadline April 30, 2026
// Old media URLs still work through 2026 warranty per Cotality email
// Canonical policy lives in lib/media/proxy-url-policy.ts so every consumer —
// resolver, detail route, Featured, and TESTS — validates against the SAME rule.
// Previously this Set was private to the route, so tests re-declared a wider
// approximation (a suffix regex admits `evil.cotality.com`) and could pass while
// production regressed.
const ALLOWED_HOSTS = ALLOWED_MEDIA_HOSTS;
const isAllowedUrl = isAllowedMediaUrl;

// Semaphore: limit concurrent outbound requests to Trestle.
// Prevents connection pool exhaustion that causes alternating photo failures.
const MAX_CONCURRENT = 30;
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

    // 10s timeout — prevents hanging when Trestle is slow. Without this,
    // a single slow image blocks the proxy slot (semaphore) for up to 300s.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(mediaUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "image/*",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      // Do NOT cache error responses — prevents CDN poisoning
      return new NextResponse(null, {
        status: response.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";

    // CRITICAL: Only cache responses that are actually images.
    // Trestle sometimes returns HTML error pages as 200 (WAF, rate limit, maintenance).
    // Caching non-image 200s poisons the CDN for 7 days, breaking photos persistently.
    const isImage = contentType.startsWith("image/");
    if (!isImage) {
      console.warn(`[Media Proxy] Non-image response: ${contentType} for ${mediaUrl.substring(0, 80)}`);
      return new NextResponse(null, {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }

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
