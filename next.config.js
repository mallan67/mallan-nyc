const isProd = process.env.NODE_ENV === "production";
const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://api:8000";

module.exports = {
  async rewrites() {
    // In development we do not rewrite /api -> backend so pages/api/[...proxy] can handle it.
    if (!isProd) {
      return [];
    }
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/:path*`, // NOTE: destination should NOT add an extra '/api'
      },
    ];
  },
};
