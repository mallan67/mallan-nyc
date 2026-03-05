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



  // Restrict CORS on API routes to same-origin
  async headers() {
    return [
      {
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
