// Sentry build wrapper — re-enabled 2026-05-10 to clear the Vercel
// "Checks Failed" badge that has accompanied every PR since 2026-04-06.
//
// Scope of this re-enable:
//   - withSentryConfig wraps the Next.js config so the Vercel Sentry
//     Marketplace integration sees the build-time release/deploy markers
//     it requires for its post-deploy check to pass.
//   - Source-map upload is DISABLED (`disableSourceMapUpload: true`)
//     because SENTRY_AUTH_TOKEN is not currently provisioned. When the
//     token is added, this flag can be removed in a follow-up PR.
//   - The CLIENT-SIDE Sentry SDK remains disabled in
//     `instrumentation-client.ts` to preserve React 19 hydration safety.
//     Server-side and edge-side Sentry already work via
//     `instrumentation.ts` → `sentry.server.config.ts` /
//     `sentry.edge.config.ts`; this wrapper does not touch that.
const { withSentryConfig } = require("@sentry/nextjs");

// Single source of truth for image optimization, shared verbatim with
// lib/media/responsive-image.ts. See the $comment_* keys in that file for
// the measurement behind every value.
const IMAGE_CONFIG = require("./config/image-optimization.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Public CSP is the static, cache-compatible NON-NONCE approach (P0 compute repair,
  // 2026-07-15). The per-request CSP nonce was removed to restore ISR/CDN caching — it
  // forced every public page to render dynamically, keeping Neon compute awake.
  //
  // `experimental.sri` (build-time Subresource-Integrity hashes) was tested as an extra
  // hardening layer but REMOVED (PR #511): under Next.js 16.2 + Turbopack + Vercel it
  // produced a reproducible SRI digest mismatch that BLOCKED a first-party script in the
  // browser (integrity attribute vs served chunk). The public site therefore relies on
  // Next.js's documented static non-nonce CSP; revisit strict hash-based CSP once the
  // upstream SRI defect is fixed. All CSP directives + security headers live in
  // lib/middleware/security-headers.ts; the root layout does NOT read headers()/x-nonce.

  // ── next/image configuration ──────────────────────────────────────
  //
  // Every value comes from config/image-optimization.json. Previously the
  // card helper carried its own host regex and assumed Next's built-in
  // size defaults; the two could drift apart silently, and a
  // helper-approved host that Next rejected would 400 every card photo.
  // tests/runtime/responsive-image.test.ts now enforces agreement in both
  // directions.
  //
  // remotePatterns is EXACT-HOST only. The previous `*.r2.dev` and
  // `*.trestle.com` wildcards admitted every public Cloudflare R2 bucket
  // on the internet and any trestle.com subdomain — both are shared
  // suffixes, not Mallan namespaces. Live measurement across 120
  // production listings found exactly two media hosts in use, and zero
  // trestle.com URLs anywhere in the code or the feed.
  //
  // `images.mallan.nyc` was dropped: configured but non-resolving
  // (verified), and referenced only in comments and test fixtures.
  // Re-add it here AND to optimizerTrustedHosts if it is ever stood up.
  images: {
    remotePatterns: [
      ...IMAGE_CONFIG.optimizerTrustedHosts,
      ...IMAGE_CONFIG.otherRemoteHosts,
    ].map((hostname) => ({ protocol: 'https', hostname, pathname: '/**' })),
    deviceSizes: IMAGE_CONFIG.deviceSizes,
    imageSizes: IMAGE_CONFIG.imageSizes,
    qualities: IMAGE_CONFIG.qualities,
    minimumCacheTTL: IMAGE_CONFIG.minimumCacheTTL,
  },

  // /buy and /rent serve the search page directly (no redirect round-trip)
  async rewrites() {
    return [
      { source: '/buy', destination: '/search?tab=buy-residential' },
      { source: '/rent', destination: '/search?tab=rent-residential' },
    ];
  },

  // Security headers: single source of truth is lib/middleware/security-headers.ts
  // CORS: handled by proxy.ts
  // No headers() function needed — all headers set in proxy
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  disableSourceMapUpload: true,
});
