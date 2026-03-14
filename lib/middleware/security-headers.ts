import { NextResponse } from "next/server";

/**
 * Single source of truth for all HTTP security headers.
 * Applied in middleware on every response.
 *
 * After Phase 3: vercel.json headers block and next.config.js headers()
 * are removed. This file is the only place headers are defined.
 *
 * CSP strategy:
 * - Public pages use nonce-based script-src. The nonce gates inline scripts
 *   while 'self' + explicit hosts cover external scripts. 'unsafe-inline' is
 *   kept as fallback for browsers that don't support nonces (very old).
 * - 'strict-dynamic' is intentionally NOT used: it causes Chrome to ignore
 *   host allowlists, which breaks Google Translate and third-party scripts
 *   that load sub-resources without nonces.
 * - CRM pages keep 'unsafe-inline' + 'unsafe-eval' because the static HTML
 *   files have hundreds of inline scripts. Migration path: self-host Tailwind
 *   CSS build to drop 'unsafe-eval', then incrementally nonce CRM scripts.
 */

/** Build public CSP with a per-request nonce */
function buildPublicCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://translate.google.com https://translate.googleapis.com https://vercel.live https://us-assets.i.posthog.com`,
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
  "img-src 'self' data: blob: https://*.trestle.com https://api.cotality.com https://*.r2.dev https://images.mallan.nyc https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://tiles.openfreemap.org",
  "connect-src 'self' https://nominatim.openstreetmap.org https://api.mapbox.com https://*.basemaps.cartocdn.com https://tiles.openfreemap.org https://api.cotality.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * Apply security headers to the response.
 * @param nonce - Per-request nonce for CSP script-src (public pages only)
 */
export function applySecurityHeaders(response: NextResponse, pathname: string, nonce: string): void {
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
    response.headers.set("Content-Security-Policy", buildPublicCsp(nonce));
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
    pathname.startsWith("/api/portal");

  if (isPrivatePage || isPrivateApi) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
  }

  // API routes: no-store by default (unless already set above)
  if (pathname.startsWith("/api") && !isPrivateApi) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex");
  }
}
