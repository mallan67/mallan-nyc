/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false }, // TEMP — remove when green
  eslint: { ignoreDuringBuilds: false },    // TEMP — remove when green
};
module.exports = nextConfig;

