import { MetadataRoute } from 'next';
import {
  ADMIN_PATHS,
  AI_SEARCH_FETCHERS,
  BRAND_ALLOW,
  MLS_CATEGORY_ONLY_BLOCK_TRAINING,
  MLS_LISTING_PATHS,
  MLS_SEARCH_PATHS,
  UNCLASSIFIED_DATA_PATHS,
} from '@/lib/seo/crawler-policy';

const BASE_URL = 'https://mallan.nyc';

/**
 * Dynamic robots.txt generation for Next.js
 *
 * Canonical policy matrix — resolves three previous conflicts:
 *
 *   1. Robots disallowed `/listing/` + `/search` for the default `*` bot,
 *      but `app/sitemap.ts` included both. Google received contradictory
 *      signals. Fixed by splitting paths into policy categories and
 *      allowing Google/Bing to crawl listing pages.
 *
 *   2. AI training crawlers (GPTBot, ClaudeBot, Applebot-Extended, Amazonbot,
 *      YouBot) were allowed on MLS-data-rendering pages (/buy, /rent,
 *      /manhattan, /brooklyn, /open-houses, /market). That contradicted the
 *      repo-stated policy: "MLS/IDX data must not be used for AI/LLM
 *      training." Now blocked from any page that renders listing data.
 *
 *   3. AI SEARCH fetchers (AI_SEARCH_FETCHERS in lib/seo/crawler-policy.ts) read a
 *      page to answer a person's question or build an answer-engine index; each
 *      provider documents them apart from its training crawler. They keep access
 *      to brand and category pages for brand visibility, but are blocked from
 *      individual listing URLs and agent profile pages (which can render deal
 *      addresses and prices). The path lists live in lib/seo/crawler-policy.ts and the server
 *      enforces the same split (lib/middleware/bot-blocker.ts), because some of
 *      these fetchers do not obey robots.txt.
 *
 * POLICY MATRIX
 *                          BRAND  MLS_CATEGORY  MLS_LISTING  MLS_SEARCH  ADMIN
 *   Google/Bing (*)          ✓        ✓              ✓             ✓         ✗
 *   AI search (user)         ✓        ✓              ✗             ✗         ✗
 *   AI training crawler      ✓        ✗              ✗             ✗         ✗
 *   Training-only botnet     ✗        ✗              ✗             ✗         ✗
 *   SEO scrapers             ✗        ✗              ✗             ✗         ✗
 */

// Combined disallow sets per policy tier
// (BLOCK_ADMIN was an alias for ADMIN_PATHS; callers now reference ADMIN_PATHS directly.)
const BLOCK_ADMIN_AND_LISTINGS = [
  ...ADMIN_PATHS,
  ...MLS_LISTING_PATHS,
  ...MLS_SEARCH_PATHS,
  ...UNCLASSIFIED_DATA_PATHS,
];
const BLOCK_ALL_MLS = [
  ...ADMIN_PATHS,
  ...MLS_LISTING_PATHS,
  ...MLS_SEARCH_PATHS,
  ...UNCLASSIFIED_DATA_PATHS,
  ...MLS_CATEGORY_ONLY_BLOCK_TRAINING,
];

// ── Builders ──────────────────────────────────────────────────────────────

/** AI SEARCH bot — user-triggered, answers specific queries. */
function aiSearchBot(userAgent: string) {
  return {
    userAgent,
    allow: [...BRAND_ALLOW, ...MLS_CATEGORY_ONLY_BLOCK_TRAINING],
    disallow: BLOCK_ADMIN_AND_LISTINGS,
  };
}

/** AI TRAINING bot — crawls for model training corpus. Brand-only. */
function aiTrainingBot(userAgent: string) {
  return {
    userAgent,
    allow: BRAND_ALLOW,
    disallow: BLOCK_ALL_MLS,
  };
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // ── AI SEARCH (answer engines and assistants: one group each, same rules) ──
      ...AI_SEARCH_FETCHERS.map(aiSearchBot),

      // ── AI TRAINING (corpus crawlers) ──
      // All of these index pages for model training / knowledge bases.
      // Limited to brand pages. Previously allowed on /buy, /rent, etc.
      // which violated the "no MLS data for AI training" policy.
      aiTrainingBot('GPTBot'),
      aiTrainingBot('ClaudeBot'),
      aiTrainingBot('Applebot-Extended'),
      aiTrainingBot('Amazonbot'),
      aiTrainingBot('YouBot'),

      // ── FULLY BLOCKED AI TRAINING-ONLY BOTS ──
      { userAgent: 'CCBot', disallow: '/' },
      { userAgent: 'Bytespider', disallow: '/' },
      { userAgent: 'Diffbot', disallow: '/' },
      { userAgent: 'Webzio', disallow: '/' },
      { userAgent: 'img2dataset', disallow: '/' },

      // ── FULLY BLOCKED SEO SCRAPERS ──
      { userAgent: 'AhrefsBot', disallow: '/' },
      { userAgent: 'SemrushBot', disallow: '/' },
      { userAgent: 'DotBot', disallow: '/' },
      { userAgent: 'MJ12bot', disallow: '/' },
      { userAgent: 'DataForSeoBot', disallow: '/' },
      { userAgent: 'BLEXBot', disallow: '/' },
      { userAgent: 'PetalBot', disallow: '/' },
      { userAgent: 'serpstatbot', disallow: '/' },

      // ── DEFAULT (Google, Bing, etc.) ──
      // Allow crawl of category pages AND individual listing pages. The
      // listing pages are in the sitemap — blocking them here previously
      // created a mixed signal. Only admin/API/private surfaces are
      // blocked. /search is blocked because it's thin-content + parameter-
      // dependent; listing-detail URLs are the canonical indexable form.
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          ...ADMIN_PATHS,
          ...MLS_SEARCH_PATHS, // /search — not canonical; use sitemap's listing URLs
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
