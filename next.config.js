/** @type {import('next').NextConfig} */
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
        protocol: 'https',
        hostname: '*.trestle.com',
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com",
              "img-src 'self' data: blob: https://*.r2.dev https://images.mallan.nyc https://images.unsplash.com https://api.cotality.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://api.cotality.com https://api.nyc.gov https://data.cityofnewyork.us https://geosearch.planninglabs.nyc https://api.anthropic.com",
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
        // CORS for API routes
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'https://mallan.nyc' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
