const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Remote image domains for next/image optimization
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
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
  // CORS: handled by middleware.ts
  // No headers() function needed — all headers set in middleware
};

module.exports = withSentryConfig(nextConfig);
