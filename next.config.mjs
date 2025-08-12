/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // Route anything hitting /api/acris to our known-good route
      { source: '/api/acris', destination: '/api/acris2' },
    ];
  },
};

module.exports = nextConfig;
