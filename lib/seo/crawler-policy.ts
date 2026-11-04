/**
 * Crawler policy: which kind of crawler may read which part of mallan.nyc.
 *
 * ONE definition for what robots.txt publishes (app/robots.ts) and what the server enforces
 * (lib/middleware/bot-blocker.ts). The path lists below were private to robots.ts; the server
 * could not see them, so the two drifted: robots.txt told AI-search fetchers they may read brand
 * and category pages while the server answered them 403 on every path (ChatGPT-User, PerplexityBot),
 * or let them read everything, listing pages included (OAI-SearchBot, Claude-User, Perplexity-User).
 *
 * The policy matrix itself is unchanged; its header is in app/robots.ts. In short:
 *   - AI-search fetchers (below) may read the home page, brand pages and category pages. They may
 *     not read individual listings, search, admin, API or private client paths.
 *     (This is the policy matrix the repo stated in a comment in app/robots.ts. The Master has no
 *     AI-crawler rule, and the UCBA section that comment cited, Art. III §2(C), is the "Listing
 *     Courtesy of" attribution rule in the repo's UCBA extract, so it is not the source. The rule
 *     itself is the owner's decision.)
 *   - AI training crawlers (GPTBot, ClaudeBot, ...) are refused on every path the proxy runs on,
 *     whatever robots.txt allows. (proxy.ts does not run for /robots.txt, /sitemap.xml,
 *     /_next/static, /_next/image, /images or /fonts.)
 *
 * A route that is in none of the lists below is NOT open to an AI-search fetcher. Add it to
 * BRAND_ALLOW (no MLS data on the page) or MLS_CATEGORY_ONLY_BLOCK_TRAINING (aggregates MLS data)
 * once someone has classified it. Fail closed: an unclassified route is never opened by default.
 */

// ── Path sets ─────────────────────────────────────────────────────────────

// Always blocked: admin, API, internal tooling, private client surfaces.
// No bot has any business touching these.
//
// `/agent$` (exact) and `/agent/` are the private agent area. The bare prefix `/agent` also matched
// `/agents` and `/agents/<name>`, the public agent pages, because robots.txt rules match by prefix
// and the longest matching rule wins: `Disallow: /agent` beat the default group's `Allow: /`.
// Google and Bing were therefore told not to fetch pages that are in the sitemap and in the nav.
export const ADMIN_PATHS = [
  '/admin/', '/admin',
  '/agent/', '/agent$',
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
export const MLS_LISTING_PATHS = ['/listing/'];

// Search results page. Parameterless URL — Google doesn't need to index
// it as a canonical page (the listing-detail URLs in the sitemap serve
// that purpose). Blocked for everyone including Google to avoid thin-
// content / duplicate-content SEO issues.
export const MLS_SEARCH_PATHS = ['/search'];

// Public routes nobody has classified yet. A building page lists its units with prices, so it carries
// listing data; `/results` sits next to search. An agent profile (`/agents/<name>`) and its listings page
// can render the agent's active and closed deals: street, unit, ZIP, price and courtesy line
// (app/agents/[name]/page.tsx). None of that was in the server HTML of the four agents on 2026-11-03, but
// the code path exists. Refused to every AI fetcher and training crawler until Maya classifies them
// (docs/PLATFORM-ISSUE-REGISTRY.md SEO-004). The agents INDEX (`/agents`) stays a brand page.
// Google and Bing are not affected.
export const UNCLASSIFIED_DATA_PATHS = ['/building', '/buildings/', '/results', '/agents/'];

// Category/neighborhood pages — render listing cards aggregating MLS data.
// Google/Bing: crawl (SEO is the point). AI search: crawl (user-triggered
// queries benefit from neighborhood-level answers). AI training: block
// (MLS data not for training corpus).
export const MLS_CATEGORY_ONLY_BLOCK_TRAINING = [
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
//
// `/resources` holds the buyer's, seller's and investor's guides: editorial pages with no listing
// data (app/resources/[slug]/page.tsx renders data/resources/*.json only).
//
// `/llms.txt` is the plain-text brokerage description written for AI systems (public/llms.txt). The
// proxy's matcher excludes only robots.txt and sitemap.xml, so bot-blocker runs on it: without an entry
// here the allow-list would refuse the one file meant for them. Its content is Mallan-authored and is
// Maya's to verify; this entry only decides who may fetch it.
export const BRAND_ALLOW = [
  '/about',
  '/agents',
  '/contact',
  '/sell',
  '/sell/international',
  '/buy/international',
  '/fair-housing',
  '/sop',
  '/terms',
  '/privacy',
  '/reasonable-accommodations',
  '/resources', '/resources/',
  '/llms.txt',
];

// ── AI-search fetchers ────────────────────────────────────────────────────

/**
 * Fetchers that read a page to answer a person's question, or crawl to build an answer-engine index.
 * Each provider documents these separately from its model-training crawler (GPTBot, ClaudeBot).
 *   OpenAI:     ChatGPT-User (a user asks ChatGPT about a page), OAI-SearchBot (ChatGPT search results)
 *   Perplexity: PerplexityBot (its search crawler), Perplexity-User (a user's question needs a page)
 *   Anthropic:  Claude-User (a user asks Claude about a page), Claude-SearchBot (search result quality)
 * OpenAI and Perplexity say robots.txt may not apply to their user-triggered fetchers (ChatGPT-User,
 * Perplexity-User; Anthropic says Claude-User honors it), so the server enforcement in
 * lib/middleware/bot-blocker.ts is the control that counts.
 */
export const AI_SEARCH_FETCHERS = [
  'ChatGPT-User',
  'OAI-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-User',
  'Claude-SearchBot',
] as const;

const AI_SEARCH_FETCHER_PATTERN = new RegExp(AI_SEARCH_FETCHERS.join('|'), 'i');

/** True when the User-Agent names an AI-search fetcher. */
export function isAiSearchFetcher(userAgent: string): boolean {
  return AI_SEARCH_FETCHER_PATTERN.test(userAgent);
}

// What an AI-search fetcher may read: the home page, brand pages, category pages. Nothing else.
const AI_SEARCH_OPEN_PATHS = [...BRAND_ALLOW, ...MLS_CATEGORY_ONLY_BLOCK_TRAINING];

// A prefix matches whole path segments: `/buy` covers `/buy` and `/buy/international`, not `/buyers-secret`.
// A prefix that ends in `/` covers what is under it, not the bare path.
const isUnder = (pathname: string, prefix: string) =>
  prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Whether an AI-search fetcher may read `pathname`. An allow-list, so a route nobody has classified
 * stays closed, and a closed path wins over an open one, as the longest matching rule wins in robots.txt:
 * `/agents` is open and `/agents/<name>` is closed. `pathname` is the URL's path (dot-segments already
 * resolved, no query); a trailing slash is ignored.
 */
export function aiSearchMayFetch(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (path === '/') return true;
  if (UNCLASSIFIED_DATA_PATHS.some((prefix) => isUnder(path, prefix))) return false;
  return AI_SEARCH_OPEN_PATHS.some((prefix) => isUnder(path, prefix));
}
