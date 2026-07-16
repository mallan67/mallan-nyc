import { NextResponse } from "next/server";

/**
 * Single source of truth for all HTTP security headers.
 * Applied in middleware on every response.
 *
 * After Phase 3: vercel.json headers block and next.config.js headers()
 * are removed. This file is the only place headers are defined.
 *
 * CSP strategy (P0 compute repair 2026-07-15 — STATIC, no per-request nonce):
 * - The public CSP is STATIC. The previous per-request nonce forced the root layout to
 *   read headers(), which made EVERY public page render dynamically — disabling ISR/CDN
 *   caching and keeping Neon awake. Removing the nonce restored caching.
 * - 'unsafe-inline' IS retained in public script-src and is a genuine relaxation, not a
 *   no-op: Next.js App Router streams inline hydration scripts (self.__next_f.push(...))
 *   whose content is not known ahead of time, and with the nonce removed they can only
 *   execute via 'unsafe-inline'. (JSON-LD is a non-executed data block and needs no
 *   allowance.) Build-time Subresource Integrity (next.config.js experimental.sri) was
 *   tested as an extra hardening layer but was REMOVED (PR #511): under Next 16.2 +
 *   Turbopack + Vercel it produced a reproducible integrity-digest mismatch that BLOCKED
 *   a first-party script in the browser. There is NO SRI on scripts today; revisit strict
 *   hash-based CSP once that upstream defect is fixed.
 * - The remaining protections still apply and are the actual defense: object-src 'none' +
 *   base-uri 'self' + form-action 'self' + frame-ancestors 'none' + HSTS +
 *   X-Frame-Options DENY + nosniff + Referrer-Policy + Cross-Origin-Opener-Policy.
 * - 'strict-dynamic' is intentionally NOT used: it causes Chrome to ignore host
 *   allowlists, which breaks Google Translate and third-party scripts.
 * - CRM pages keep 'unsafe-inline' + 'unsafe-eval' because the static HTML files have
 *   hundreds of inline scripts, and stay no-store (never cached).
 */

/** Build the public CSP (static — no per-request nonce; see strategy note above). */
function buildPublicCsp(): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://translate.google.com https://translate.googleapis.com https://vercel.live https://us-assets.i.posthog.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://translate.googleapis.com https://www.gstatic.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://images.unsplash.com https://www.google-analytics.com https://www.facebook.com https://*.trestle.com https://api.cotality.com https://*.r2.dev https://images.mallan.nyc https://*.tile.openstreetmap.org https://unpkg.com https://tiles.openfreemap.org https://translate.google.com https://www.google.com https://www.gstatic.com https://fonts.gstatic.com",
    "connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com https://www.facebook.com https://connect.facebook.net https://api.cotality.com https://tiles.openfreemap.org https://translate.googleapis.com https://api.openai.com https://api.anthropic.com https://us.i.posthog.com https://us-assets.i.posthog.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
    "worker-src 'self' blob:",
    "frame-src https://translate.google.com https://www.google.com https://maps.google.com https://www.youtube.com https://player.vimeo.com https://my.matterport.com https://vercel.live",
    "media-src 'self' https://*.r2.dev https://images.mallan.nyc",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** CSP for CRM pages (static HTML with CDN libraries) */
const CRM_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdn.tailwindcss.com https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://tiles.openfreemap.org data:",
  "img-src 'self' data: blob: https://images.unsplash.com https://*.trestle.com https://api.cotality.com https://*.r2.dev https://images.mallan.nyc https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://tiles.openfreemap.org",
  "connect-src 'self' https://nominatim.openstreetmap.org https://api.mapbox.com https://*.basemaps.cartocdn.com https://tiles.openfreemap.org https://api.cotality.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * Apply security headers to the response.
 * @param method - Request method; GET public data APIs may keep their own CDN cache headers.
 */
export function applySecurityHeaders(response: NextResponse, pathname: string, method: string = "GET"): void {
  // Universal security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self), payment=(self)");
  response.headers.set("X-DNS-Prefetch-Control", "on");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );

  // CSP — CRM pages need extra CDN sources + unsafe-eval (see migration note at top)
  if (pathname.startsWith("/crm")) {
    response.headers.set("Content-Security-Policy", CRM_CSP);
  } else {
    response.headers.set("Content-Security-Policy", buildPublicCsp());
  }

  // Private pages: prevent indexing + prevent caching
  const isPrivatePage =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/crm") ||
    pathname === "/login" ||
    pathname === "/sign-in" ||
    pathname === "/sign-up" ||
    pathname.startsWith("/leads");
  const isPrivateApi =
    pathname.startsWith("/api/crm") ||
    pathname.startsWith("/api/portal") ||
    // Authenticated agent/broker endpoint returning internal building-profile data
    // (requireAgentOrBroker). It sets no cache policy of its own, so it must be
    // explicitly no-store — NOT swept up by the public `/api/buildings` exemption below.
    pathname.startsWith("/api/buildings/search");

  if (isPrivatePage || isPrivateApi) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
  }

  // API routes.
  //  - Private APIs (handled above) → no-store.
  //  - Public GET data routes that set their OWN CDN cache headers (listings,
  //    buildings, idx watermark, media proxy) keep them. The old blanket
  //    no-store here silently defeated their `public, s-maxage=…`, forcing every
  //    hit to the origin/Neon — a core cause of the compute problem. We only add
  //    noindex for these; we never overwrite their Cache-Control.
  //  - Everything else under /api (writes, non-GET, uncacheable reads) → no-store.
  if (pathname.startsWith("/api") && !isPrivateApi) {
    response.headers.set("X-Robots-Tag", "noindex");
    const isPublicCacheableApi =
      method === "GET" &&
      (pathname.startsWith("/api/listings") ||
        // ONLY the exact public buildings endpoint — NOT sub-routes like
        // /api/buildings/search, which is authenticated (handled as private above).
        pathname === "/api/buildings" ||
        pathname.startsWith("/api/media/proxy") ||
        pathname === "/api/idx/watermark");
    if (!isPublicCacheableApi) {
      response.headers.set("Cache-Control", "no-store");
    }
  }
}
