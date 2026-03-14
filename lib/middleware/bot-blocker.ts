import { NextRequest, NextResponse } from "next/server";

/**
 * Known scraper/AI-crawler bots that consume function invocations
 * without generating real traffic. Google/Bing/social bots are
 * intentionally excluded — we want those for SEO.
 */
const BLOCKED_BOTS =
  /AhrefsBot|SemrushBot|DotBot|MJ12bot|GPTBot|CCBot|ClaudeBot|ChatGPT-User|Bytespider|PetalBot|Sogou|YandexBot|BLEXBot|DataForSeoBot|serpstatbot|Amazonbot|anthropic-ai|FacebookBot|Applebot-Extended|PerplexityBot|YouBot|Diffbot|Webzio|img2dataset|omgili|CriteoBot|MegaIndex|Zoominfobot/i;

/**
 * Returns a 403 response if the request is from a blocked bot or has no user-agent.
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

  return null;
}
