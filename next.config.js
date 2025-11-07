/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false }, // TEMP â€” remove when green
  eslint: { ignoreDuringBuilds: true },    // TEMP â€” remove when green
};
module.exports = nextConfig;


