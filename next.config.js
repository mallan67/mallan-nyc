/** @type {import('next').NextConfig} */

// Dynamic CORS origin — production uses mallan.nyc, Vercel previews use their own URL
const CORS_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://mallan.nyc');

const nextConfig = {
  reactStrictMode: true,

  // Remote image domains for next/image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        // Legacy Trestle media host (deprecated March 2026)
        protocol: 'https',
        hostname: '*.trestle.com',
        pathname: '/**',
      },
      {
        // Current Trestle/Cotality media host
        protocol: 'https',
        hostname: 'api.cotality.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.r2.dev',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.mallan.nyc',
        pathname: '/**',
      },
    ],
  },

  // ESLint config moved to .eslintrc.json (eslint key removed — not supported in Next.js 16)
  // TypeScript strict checking is enforced by tsconfig.json

  // /buy and /rent serve the search page directly (no redirect round-trip)
  async rewrites() {
    return [
      { source: '/buy', destination: '/search?tab=buy-residential' },
      { source: '/rent', destination: '/search?tab=rent-residential' },
    ];
  },

  // Security + CORS headers
  async headers() {
    return [
      {
        // Security headers for all routes
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // unsafe-inline required by Next.js hydration + CRM static HTML inline scripts.
              // unsafe-eval REMOVED — not needed; prevents eval-based XSS attacks.
              "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com",
              "img-src 'self' data: blob: https://*.r2.dev https://images.mallan.nyc https://images.unsplash.com https://api.cotality.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
              "font-src 'self' https://fonts.gstatic.com",
              // connect-src: only endpoints the browser calls directly. AI APIs (Anthropic, OpenAI) are server-side only — not listed.
              "connect-src 'self' https://api.cotality.com https://api.nyc.gov https://data.cityofnewyork.us https://geosearch.planninglabs.nyc",
              "frame-src 'self' https://www.youtube.com https://player.vimeo.com https://my.matterport.com",
              "media-src 'self' https://*.r2.dev https://images.mallan.nyc",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
        ],
      },
      {
        // CORS for API routes — dynamic origin for preview/staging support
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: CORS_ORIGIN },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
