import { MetadataRoute } from 'next';

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
 *   3. AI SEARCH bots (ChatGPT-User, PerplexityBot) are user-triggered —
 *      they fetch pages in real time to answer a specific user question.
 *      This is fair use, not training. They keep access to category pages
 *      for brand visibility, but are blocked from individual listing URLs
 *      (granular address data per REBNY UCBA Art. III §2(C)).
 *
 * POLICY MATRIX
 *                          BRAND  MLS_CATEGORY  MLS_LISTING  MLS_SEARCH  ADMIN
 *   Google/Bing (*)          ✓        ✓              ✓             ✓         ✗
 *   AI search (user)         ✓        ✓              ✗             ✗         ✗
 *   AI training crawler      ✓        ✗              ✗             ✗         ✗
 *   Training-only botnet     ✗        ✗              ✗             ✗         ✗
 *   SEO scrapers             ✗        ✗              ✗             ✗         ✗
 */

// ── Path sets ─────────────────────────────────────────────────────────────

// Always blocked — admin, API, internal tooling, private client surfaces.
// No bot has any business touching these.
const ADMIN_PATHS = [
  '/admin/', '/admin',
  '/agent/', '/agent',
  '/leads/', '/leads',
  '/api/', '/api',
  '/sign-in', '/sign-up',
  '/portal/', '/portal',
  '/reset-password',
  '/offer-status',
  '/saved-searches',
  '/favorites',
  '/compare',
  '/unsubscribe',
  '/crm/',
  '/demo/', '/demo',
  '/style-preview/', '/style-preview',
];

// Individual listing pages with full address + price + agent attribution.
// Google/Bing CAN crawl these (they're public, legal to display, and the
// sitemap points here). AI bots of any flavor MUST NOT crawl these — too
// granular for training, too specific for fair-use search.
const MLS_LISTING_PATHS = ['/listing/'];

// Search results page. Parameterless URL — Google doesn't need to index
// it as a canonical page (the listing-detail URLs in the sitemap serve
// that purpose). Blocked for everyone including Google to avoid thin-
// content / duplicate-content SEO issues.
const MLS_SEARCH_PATHS = ['/search'];

// Category/neighborhood pages — render listing cards aggregating MLS data.
// Google/Bing: crawl (SEO is the point). AI search: crawl (user-triggered
// queries benefit from neighborhood-level answers). AI training: block
// (MLS data not for training corpus).
const MLS_CATEGORY_ONLY_BLOCK_TRAINING = [
  '/buy',
  '/rent',
  '/neighborhoods',
  '/manhattan', '/manhattan/',
  '/brooklyn', '/brooklyn/',
  '/queens', '/queens/',
  '/bronx', '/bronx/',
  '/staten-island', '/staten-island/',
  '/market',
  '/open-houses',
];

// Brand / expertise pages. No MLS data. Everyone welcome (except malicious
// scrapers).
//
// `/buy/international` and `/sell/international` are intentionally listed
// here even though their parent `/buy` falls under
// MLS_CATEGORY_ONLY_BLOCK_TRAINING. These two pages render zero MLS data —
// they are brand/expertise pages targeting non-resident clients. The Allow
// rule must be more specific than the Disallow rule for AI training bots to
// crawl them; robots-protocol longest-match-wins handles this.
const BRAND_ALLOW = [
  '/about',
  '/agents', '/agents/',
  '/contact',
  '/sell',
  '/sell/international',
  '/buy/international',
  '/fair-housing',
  '/sop',
  '/terms',
  '/privacy',
  '/reasonable-accommodations',
];

// Combined disallow sets per policy tier
// (BLOCK_ADMIN was an alias for ADMIN_PATHS; callers now reference ADMIN_PATHS directly.)
const BLOCK_ADMIN_AND_LISTINGS = [
  ...ADMIN_PATHS,
  ...MLS_LISTING_PATHS,
  ...MLS_SEARCH_PATHS,
];
const BLOCK_ALL_MLS = [
  ...ADMIN_PATHS,
  ...MLS_LISTING_PATHS,
  ...MLS_SEARCH_PATHS,
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
      // ── AI SEARCH (user-triggered real-time fetches) ──
      aiSearchBot('ChatGPT-User'),
      aiSearchBot('PerplexityBot'),

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
