import { MetadataRoute } from 'next';

const BASE_URL = 'https://mallan.nyc';

/**
 * Dynamic robots.txt generation for Next.js 13+
 * Allows public pages, blocks admin/agent/demo/client areas
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/admin',
          '/agent/',
          '/agent',
          '/client-access/',
          '/client-access',
          '/demo/',
          '/demo',
          '/style-preview/',
          '/style-preview',
          '/api/',
          '/api',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
