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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Remote image domains for next/image optimization
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos', pathname: '/**' },
      { protocol: 'https', hostname: '*.trestle.com', pathname: '/**' },
      { protocol: 'https', hostname: 'api.cotality.com', pathname: '/**' },
      { protocol: 'https', hostname: '*.r2.dev', pathname: '/**' },
      { protocol: 'https', hostname: 'images.mallan.nyc', pathname: '/**' },
    ],
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
