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
    ],
  },

  // Keep ESLint/TypeScript build-time checks enabled so the baseline verification
  // workflow catches issues during CI/build.
  eslint: {
    // don't skip ESLint during builds
    ignoreDuringBuilds: false,
    // optional: restrict linted dirs if your repo uses the app/ dir
    dirs: ['app', 'pages', 'components', 'lib'],
  },

  typescript: {
    // do not ignore type errors during build — keep CI strict
    ignoreBuildErrors: false,
  },
};

module.exports = nextConfig;
