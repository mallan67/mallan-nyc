/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: '/api/acris', destination: '/api/acris2' }];
  },
};
export default nextConfig;
