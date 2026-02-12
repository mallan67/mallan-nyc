import { MetadataRoute } from 'next';

const BASE_URL = 'https://mallan.nyc';

/**
 * Dynamic robots.txt generation for Next.js
 *
 * Allows public pages for legitimate search engines.
 * Blocks admin/agent/demo/client areas from all bots.
 * Explicitly blocks AI training crawlers and known scrapers.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Block AI training crawlers completely
      {
        userAgent: 'GPTBot',
        disallow: '/',
      },
      {
        userAgent: 'ChatGPT-User',
        disallow: '/',
      },
      {
        userAgent: 'CCBot',
        disallow: '/',
      },
      {
        userAgent: 'anthropic-ai',
        disallow: '/',
      },
      {
        userAgent: 'ClaudeBot',
        disallow: '/',
      },
      {
        userAgent: 'Bytespider',
        disallow: '/',
      },
      {
        userAgent: 'PerplexityBot',
        disallow: '/',
      },
      {
        userAgent: 'Amazonbot',
        disallow: '/',
      },
      {
        userAgent: 'Diffbot',
        disallow: '/',
      },
      {
        userAgent: 'Applebot-Extended',
        disallow: '/',
      },
      {
        userAgent: 'YouBot',
        disallow: '/',
      },
      {
        userAgent: 'Webzio',
        disallow: '/',
      },
      {
        userAgent: 'img2dataset',
        disallow: '/',
      },
      // Block known SEO scrapers
      {
        userAgent: 'AhrefsBot',
        disallow: '/',
      },
      {
        userAgent: 'SemrushBot',
        disallow: '/',
      },
      {
        userAgent: 'DotBot',
        disallow: '/',
      },
      {
        userAgent: 'MJ12bot',
        disallow: '/',
      },
      {
        userAgent: 'DataForSeoBot',
        disallow: '/',
      },
      {
        userAgent: 'BLEXBot',
        disallow: '/',
      },
      {
        userAgent: 'PetalBot',
        disallow: '/',
      },
      {
        userAgent: 'serpstatbot',
        disallow: '/',
      },
      // Default rule — allow legitimate search engines
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
          '/leads/',
          '/leads',
          '/api/',
          '/api',
          '/sign-in',
          '/sign-up',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
