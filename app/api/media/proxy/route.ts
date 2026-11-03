// GET /api/media/proxy?url=<cotality-media-url>
// Server-side proxy for Cotality media URLs that require Bearer auth.
// The browser <img> tag cannot send auth headers, so we proxy through here.
//
// SECURITY:
// - Only proxies URLs whose exact host is in ALLOWED_MEDIA_HOSTS (lib/media/proxy-url-policy.ts; still includes two legacy provider media hosts)
// - Adds Bearer token server-side (never exposed to client)
// - Caches responses for 7 days (CDN + browser), and only responses that are images: by their Content-Type, or by their bytes when the type says nothing
// - Concurrency-limited to avoid Cotality throttling

import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_MEDIA_HOSTS, isAllowedMediaUrl } from "@/lib/media/proxy-url-policy";
import { classifyBody, sniffImageType } from "@/lib/media/sniff-image-type";
import { getAccessToken } from "@/lib/idx/auth";
import { checkRouteRateLimit } from "@/lib/middleware/rate-limiter";

// Allow proxying from Cotality media domains
// Old CoreLogic hosts deprecated — deadline April 30, 2026
// Old media URLs still work through 2026 warranty per Cotality email
// Canonical policy lives in lib/media/proxy-url-policy.ts so every consumer —
// resolver, detail route, Featured, and TESTS — validates against the SAME rule.
// Previously this Set was private to the route, so tests re-declared a wider
// approximation (a suffix regex admits `evil.cotality.com`) and could pass while
// production regressed.
const ALLOWED_HOSTS = ALLOWED_MEDIA_HOSTS;
const isAllowedUrl = isAllowedMediaUrl;

// Semaphore: limit concurrent outbound requests to Cotality.
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

// What a cached image is sent with (the Content-Type is added per response).
const IMAGE_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000, immutable",
  "CDN-Cache-Control": "public, max-age=604800, immutable",
  "X-Content-Type-Options": "nosniff",
} as const;

// A Content-Type that says nothing about the kind of file. Cotality answers some photos 200 with application/octet-stream (production logs, 2026-10-10 and 2026-10-11).
// For these, and only these, the bytes decide; every other non-image type (text/html, application/json ...) is an error page and stays refused.
const UNTYPED_CONTENT_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);
const MAX_UNTYPED_BYTES = 25 * 1024 * 1024;

/** The whole body, or null when it is longer than max (the rest is then not read). */
async function readBounded(response: Response, max: number): Promise<ArrayBuffer | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return new ArrayBuffer(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const buffer = new ArrayBuffer(total);
  const out = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

// Search-engine crawlers that robots.txt lets fetch photos here (app/robots.ts searchEngineBot). Matched on the user agent only to
// brake them; it is not a trust check, and ordinary visitors are never matched.
const SEARCH_CRAWLER_UA = /\b(googlebot|bingbot)\b/i;
const CRAWLER_REQUESTS_PER_MINUTE = 60;

export async function GET(req: NextRequest) {
  const mediaUrl = req.nextUrl.searchParams.get("url");

  if (!mediaUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  if (!isAllowedUrl(mediaUrl)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  // Crawlers are held to a shared budget BEFORE a slot or a Cotality request is spent (see media_proxy_crawler_global).
  if (SEARCH_CRAWLER_UA.test(req.headers.get("user-agent") ?? "")) {
    const withinBudget = await checkRouteRateLimit("all-search-crawlers", "media_proxy_crawler_global", CRAWLER_REQUESTS_PER_MINUTE, 60);
    if (!withinBudget) {
      return new NextResponse(null, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
    }
  }

  await acquireSlot();

  try {
    const token = await getAccessToken();

    // 10s timeout — prevents hanging when Cotality is slow. Without this,
    // a single slow image blocks the proxy slot (semaphore) for up to 300s.
    // It also covers reading the body in the untyped case below.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(mediaUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "image/*",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        // Do NOT cache error responses — prevents CDN poisoning
        return new NextResponse(null, {
          status: response.status,
          headers: { "Cache-Control": "no-store" },
        });
      }

      const declaredType = response.headers.get("content-type") || "";
      const mediaType = declaredType.split(";")[0].trim().toLowerCase();

      // CRITICAL: Only cache responses that are actually images.
      // Cotality sometimes returns HTML error pages as 200 (WAF, rate limit, maintenance).
      // Caching non-image 200s poisons the CDN for 7 days, breaking photos persistently.
      if (mediaType.startsWith("image/")) {
        return new NextResponse(response.body, {
          status: 200,
          headers: { "Content-Type": declaredType, ...IMAGE_CACHE_HEADERS },
        });
      }

      if (UNTYPED_CONTENT_TYPES.has(mediaType)) {
        const buffer = await readBounded(response, MAX_UNTYPED_BYTES);
        const bytes = buffer ? new Uint8Array(buffer) : null;
        const sniffed = bytes ? sniffImageType(bytes) : null;
        if (buffer && sniffed) {
          console.info(`[Media Proxy] Untyped answer (${mediaType || "no content-type"}) is a ${sniffed}: served as one, for ${mediaUrl.substring(0, 80)}`);
          return new NextResponse(buffer, {
            status: 200,
            headers: { "Content-Type": sniffed, ...IMAGE_CACHE_HEADERS },
          });
        }
        // What the body really was is logged (never its content), so the cause of a refused photo can be told from the log.
        console.warn(
          `[Media Proxy] Non-image response: ${mediaType || "no content-type"}, body=${bytes ? classifyBody(bytes) : "over-limit"}, bytes=${buffer ? buffer.byteLength : `>${MAX_UNTYPED_BYTES}`} for ${mediaUrl.substring(0, 80)}`,
        );
        return new NextResponse(null, {
          status: 502,
          headers: { "Cache-Control": "no-store" },
        });
      }

      console.warn(`[Media Proxy] Non-image response: ${declaredType} for ${mediaUrl.substring(0, 80)}`);
      await response.body?.cancel().catch(() => undefined);
      return new NextResponse(null, {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.error("[Media Proxy] Error:", err instanceof Error ? err.message : err);
    return new NextResponse(null, { status: 502 });
  } finally {
    releaseSlot();
  }
}
