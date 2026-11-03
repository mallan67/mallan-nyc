/// <reference types="jest" />
/**
 * AEO — AI search and assistant fetchers can read Mallan's brand and category pages; listing,
 * search and private paths stay refused, and the server enforces what robots.txt says.
 *
 * Production measurement, 2026-11-03 (curl with each crawler's name as the User-Agent):
 *   ChatGPT-User, PerplexityBot                 -> 403 on every path, "/" included
 *   OAI-SearchBot, Claude-User, Perplexity-User -> 200 on every path, /listing/ included
 * while app/robots.ts published a policy that lets "AI search" fetchers read brand and category
 * pages and keeps them off /listing/ and /search. Two of the six were refused everywhere (so
 * Mallan could not be cited), the other four ignored the listing rule the policy states
 * (the matrix is a comment in app/robots.ts; the Master has no AI-crawler rule, and the UCBA section that
 * comment cited does not say this, so the rule itself is the owner's decision).
 *
 * OpenAI and Perplexity say robots.txt may not apply to their user-triggered fetchers (ChatGPT-User,
 * Perplexity-User) in their crawler documentation, so the server is the control that matters.
 *
 * What these tests prove: the path split of the AI-search tier, that the server never allows an
 * AI-search fetcher more than robots.txt does, and that training crawlers, scrapers, search
 * engines and browsers behave as before. What they do not prove: how a particular provider's
 * crawler behaves in production (that needs a request carrying its real network origin).
 */
import { NextRequest } from 'next/server';
import { checkBot } from '@/lib/middleware/bot-blocker';
import robots from '@/app/robots';

// The AI-search tier: fetchers that read a page to answer a person's question, or crawl to build
// an answer-engine index. Roles are from each provider's own crawler documentation.
const AI_SEARCH_FETCHERS = [
  'ChatGPT-User', // OpenAI: fetches a page when a user asks ChatGPT about it
  'OAI-SearchBot', // OpenAI: the crawler behind ChatGPT search results
  'PerplexityBot', // Perplexity: its search crawler (not used for model training)
  'Perplexity-User', // Perplexity: fetches a page when a user's question needs it
  'Claude-User', // Anthropic: fetches a page when a user asks Claude about it
  'Claude-SearchBot', // Anthropic: improves search result relevance
] as const;

// Used for model training: refused by the server on every path the proxy runs on, as before this change.
// (proxy.ts does not run for /robots.txt, /sitemap.xml, /_next/static, /_next/image, /images or /fonts.)
const TRAINING_CRAWLERS = ['GPTBot', 'ClaudeBot', 'CCBot', 'Bytespider', 'Amazonbot', 'Applebot-Extended'];
const SCRAPERS = ['AhrefsBot', 'SemrushBot', 'MJ12bot', 'DataForSeoBot'];

const uaOf = (token: string) => `Mozilla/5.0 (compatible; ${token}/1.0)`;

function serverAllows(userAgent: string | null, path: string): boolean {
  const url = new URL(`https://mallan.nyc${path}`);
  const req = new NextRequest(url, { headers: userAgent === null ? {} : { 'user-agent': userAgent } });
  return checkBot(req, url.pathname) === null;
}

// ── robots.txt interpreter: the most specific matching rule wins; a tie is allowed; nothing
// matching means allowed (the standard, and what Google and Bing implement).
type RobotsRule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] };
const list = (v?: string | string[]) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const robotsRules = (): RobotsRule[] => {
  const rules = robots().rules as RobotsRule | RobotsRule[];
  return Array.isArray(rules) ? rules : [rules];
};
function robotsGroupFor(userAgent: string): RobotsRule | undefined {
  const rules = robotsRules();
  const lower = userAgent.toLowerCase();
  return (
    rules.find((r) => list(r.userAgent).some((t) => t !== '*' && lower.includes(t.toLowerCase()))) ??
    rules.find((r) => list(r.userAgent).includes('*'))
  );
}
function robotsAllows(userAgent: string, path: string): boolean {
  const group = robotsGroupFor(userAgent);
  if (!group) return true;
  // A trailing `$` anchors the pattern to the end of the path (Google and Bing both implement it).
  const matches = (p: string) => (p.endsWith('$') ? path === p.slice(0, -1) : path.startsWith(p));
  const longest = (patterns: string[]) =>
    patterns.filter(matches).reduce((n, p) => Math.max(n, p.length), -1);
  return longest(list(group.allow)) >= longest(list(group.disallow));
}

// Pages the policy matrix opens to the AI-search tier: the home page, brand pages and category pages.
const OPEN_TO_AI_SEARCH = [
  '/',
  '/about',
  '/agents',
  '/contact',
  '/sell',
  '/sell/international',
  '/buy',
  '/buy/international',
  '/rent',
  '/neighborhoods',
  '/manhattan',
  '/manhattan/chelsea',
  '/brooklyn/park-slope',
  '/market',
  '/open-houses',
  '/fair-housing',
  '/privacy',
  '/terms',
  '/sop',
  '/reasonable-accommodations',
  // Editorial guides: the page renders data/resources/*.json and no listing data.
  '/resources/buyers-guide',
  '/resources/sellers-guide',
  '/resources/investors-guide',
];

// Pages the matrix keeps from every AI fetcher: individual listings, search, private surfaces.
const REFUSED_TO_AI_SEARCH = [
  '/listing/125-greenwich-street-apt-29d-new-york-city-ny-10006/rls201179',
  '/search',
  '/api/listings',
  '/api/media/proxy',
  '/admin',
  '/admin/users',
  '/agent/dashboard',
  '/leads',
  '/portal/home',
  '/sign-in',
  '/sign-up',
  '/reset-password',
  '/offer-status',
  '/saved-searches',
  '/favorites',
  '/compare',
  '/unsubscribe',
  '/crm/index.html',
  '/demo',
  '/style-preview',
];

// Public routes the policy matrix does not classify. They carry listing data (a building page lists
// its units with prices) or sit next to it, so the AI-search tier is refused until Maya classifies
// them. Fail closed: a route nobody classified is not opened by default.
// An agent profile (/agents/<name>) and its listings page can render that agent's active and closed deals
// (street, unit, ZIP, price: app/agents/[name]/page.tsx). None of that was in the server HTML of the four
// agents on 2026-11-03, but the code path exists, so the profiles are closed to the tier too; the agents
// index (/agents) stays open.
const UNCLASSIFIED_PUBLIC_ROUTES = [
  '/buildings/some-building',
  '/building',
  '/results',
  '/agents/leda-gorgone',
  '/agents/leda-gorgone/listings',
];

describe('AI-search fetchers: brand and category pages are readable', () => {
  for (const token of AI_SEARCH_FETCHERS) {
    describe(token, () => {
      it.each(OPEN_TO_AI_SEARCH)('the server lets it read %s', (path) => {
        expect(serverAllows(uaOf(token), path)).toBe(true);
      });
      it.each(OPEN_TO_AI_SEARCH)('robots.txt lets it read %s', (path) => {
        expect(robotsAllows(uaOf(token), path)).toBe(true);
      });
    });
  }
});

describe('AI-search fetchers: listing, search and private paths stay refused', () => {
  for (const token of AI_SEARCH_FETCHERS) {
    describe(token, () => {
      it.each(REFUSED_TO_AI_SEARCH)('the server answers 403 for %s', (path) => {
        expect(serverAllows(uaOf(token), path)).toBe(false);
      });
      it.each(REFUSED_TO_AI_SEARCH)('robots.txt disallows %s', (path) => {
        expect(robotsAllows(uaOf(token), path)).toBe(false);
      });
      it.each(UNCLASSIFIED_PUBLIC_ROUTES)('the server refuses unclassified route %s', (path) => {
        expect(serverAllows(uaOf(token), path)).toBe(false);
      });
      it.each(UNCLASSIFIED_PUBLIC_ROUTES)('robots.txt disallows unclassified route %s', (path) => {
        expect(robotsAllows(uaOf(token), path)).toBe(false);
      });
    });
  }

  it('a path that only starts with an allowed word is not allowed (/buy is a page, /buyers-secret is not)', () => {
    for (const token of AI_SEARCH_FETCHERS) {
      expect(serverAllows(uaOf(token), '/buyers-secret')).toBe(false);
      expect(serverAllows(uaOf(token), '/aboutus')).toBe(false);
      expect(serverAllows(uaOf(token), '/listings')).toBe(false);
    }
  });

  it('a trailing slash does not change the answer', () => {
    for (const token of AI_SEARCH_FETCHERS) {
      expect(serverAllows(uaOf(token), '/buy/')).toBe(true);
      expect(serverAllows(uaOf(token), '/listing/x/rls1/')).toBe(false);
    }
  });

  it('dot-segments cannot walk a fetcher from an open page into a listing', () => {
    for (const token of AI_SEARCH_FETCHERS) {
      expect(serverAllows(uaOf(token), '/buy/../listing/x/rls1')).toBe(false);
      expect(serverAllows(uaOf(token), '/buy/%2e%2e/listing/x/rls1')).toBe(false);
    }
  });
});

describe('the server never allows an AI-search fetcher more than robots.txt does', () => {
  const everyPath = [...OPEN_TO_AI_SEARCH, ...REFUSED_TO_AI_SEARCH, ...UNCLASSIFIED_PUBLIC_ROUTES];
  it.each(AI_SEARCH_FETCHERS.map((t) => [t]))('%s', (token) => {
    for (const path of everyPath) {
      if (serverAllows(uaOf(token), path)) {
        expect({ token, path, robotsAllows: robotsAllows(uaOf(token), path) }).toEqual({
          token,
          path,
          robotsAllows: true,
        });
      }
    }
  });
});

describe('robots.txt names every AI-search fetcher with the same rules', () => {
  it('has a group for each one, with the same allow and disallow lists', () => {
    const groups = AI_SEARCH_FETCHERS.map((token) => robotsRules().find((r) => list(r.userAgent).includes(token)));
    groups.forEach((g, i) => expect({ token: AI_SEARCH_FETCHERS[i], present: g !== undefined }).toEqual({
      token: AI_SEARCH_FETCHERS[i],
      present: true,
    }));
    const [first, ...rest] = groups as RobotsRule[];
    for (const g of rest) {
      expect(list(g.allow)).toEqual(list(first.allow));
      expect(list(g.disallow)).toEqual(list(first.disallow));
    }
  });

  it('keeps /listing/ and /search disallowed for the tier', () => {
    const group = robotsGroupFor(uaOf('ChatGPT-User'))!;
    expect(list(group.disallow)).toEqual(expect.arrayContaining(['/listing/', '/search', '/api/', '/admin/']));
  });
});

describe('Google and Bing can read the public agent pages', () => {
  // Measured on the live robots.txt, 2026-11-03: the default group says `Allow: /` and `Disallow: /agent`.
  // Rules match by prefix and the longest wins, so `/agent` (6 characters) beat `/` and blocked `/agents`
  // and `/agents/<name>`: pages that are in the sitemap and in the navigation.
  const SEARCH_ENGINES = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  ];
  it.each(['/agents', '/agents/leda-gorgone', '/agents/leda-gorgone/listings', '/'])('robots.txt lets them read %s', (path) => {
    for (const ua of SEARCH_ENGINES) expect(robotsAllows(ua, path)).toBe(true);
  });
  it.each(['/agent', '/agent/dashboard', '/admin', '/leads', '/api/listings', '/search', '/portal/home'])(
    'robots.txt still keeps them out of %s',
    (path) => {
      for (const ua of SEARCH_ENGINES) expect(robotsAllows(ua, path)).toBe(false);
    },
  );
});

describe('training crawlers: robots.txt keeps them off the data-bearing routes nobody has classified', () => {
  it.each(['/building', '/buildings/some-building', '/results', '/agents/leda-gorgone', '/listing/x/rls1', '/buy', '/manhattan/chelsea'])(
    'robots.txt disallows GPTBot on %s',
    (path) => {
      expect(robotsAllows(uaOf('GPTBot'), path)).toBe(false);
    },
  );
  it('and still lets GPTBot read brand pages, as the matrix says (the server refuses it anyway)', () => {
    expect(robotsAllows(uaOf('GPTBot'), '/about')).toBe(true);
    expect(robotsAllows(uaOf('GPTBot'), '/agents')).toBe(true);
  });
});

describe('everyone else is treated as before', () => {
  it.each(TRAINING_CRAWLERS.map((t) => [t]))('training crawler %s is refused everywhere', (token) => {
    for (const path of ['/', '/about', '/buy', '/resources/buyers-guide']) {
      expect(serverAllows(uaOf(token), path)).toBe(false);
    }
  });

  it.each(SCRAPERS.map((t) => [t]))('scraper %s is refused everywhere', (token) => {
    for (const path of ['/', '/buy']) expect(serverAllows(uaOf(token), path)).toBe(false);
  });

  it('a user agent that names a training crawler and an AI-search fetcher is refused', () => {
    expect(serverAllows('Mozilla/5.0 (compatible; GPTBot/1.1; ChatGPT-User/1.0)', '/about')).toBe(false);
  });

  it('search engines and browsers still reach listing pages', () => {
    const browsers = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    ];
    for (const ua of browsers) {
      expect(serverAllows(ua, '/')).toBe(true);
      expect(serverAllows(ua, '/listing/x/rls1')).toBe(true);
    }
  });

  it('a request with no user agent is refused, except Vercel cron', () => {
    expect(serverAllows(null, '/')).toBe(false);
    expect(serverAllows(null, '/api/cron/one-cycle')).toBe(true);
  });
});
