import { NextRequest, NextResponse } from "next/server";
import { aiSearchMayFetch, isAiSearchFetcher } from "@/lib/seo/crawler-policy";

/**
 * Known scraper and AI-training crawlers, refused on every path. Google/Bing/social bots are
 * intentionally excluded — we want those for SEO. AI-search fetchers (ChatGPT-User,
 * PerplexityBot, ...) are not listed here: they are allowed on brand and category pages and
 * refused elsewhere, see lib/seo/crawler-policy.ts.
 */
const BLOCKED_BOTS =
  /AhrefsBot|SemrushBot|DotBot|MJ12bot|GPTBot|CCBot|ClaudeBot|Bytespider|PetalBot|Sogou|YandexBot|BLEXBot|DataForSeoBot|serpstatbot|Amazonbot|anthropic-ai|FacebookBot|Applebot-Extended|YouBot|Diffbot|Webzio|img2dataset|omgili|CriteoBot|MegaIndex|Zoominfobot/i;

/**
 * Returns a 403 response if the request is from a blocked bot, has no user-agent, or is an
 * AI-search fetcher asking for a path the crawler policy keeps from it.
 * Returns null if the request should proceed.
 */
export function checkBot(req: NextRequest, pathname: string): NextResponse | null {
  const ua = req.headers.get("user-agent") ?? "";

  // Block empty user agents (likely bots/scrapers)
  // Allow cron jobs and internal Vercel requests through
  if (!ua && !pathname.startsWith("/api/cron")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Block known bad bots
  if (BLOCKED_BOTS.test(ua)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // AI-search fetchers: brand and category pages yes; listings, search, private paths no.
  // Checked after BLOCKED_BOTS, so a user agent that also names a training crawler stays refused.
  if (isAiSearchFetcher(ua) && !aiSearchMayFetch(pathname)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return null;
}
