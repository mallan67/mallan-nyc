/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // Send /api/acris to our working handler
      { source: '/api/acris', destination: '/api/acris2' },
    ];
  },
};

export default nextConfig;
