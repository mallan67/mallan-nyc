// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * IMPORTANT:
 * Do NOT run middleware on API or Next internals.
 * This prevents 405s caused by middleware intercepting /api/*.
 */
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};

/**
 * Known scraper/AI-crawler bots that consume function invocations
 * without generating real traffic. Google/Bing/social bots are
 * intentionally excluded — we want those for SEO.
 */
const BLOCKED_BOTS =
  /AhrefsBot|SemrushBot|DotBot|MJ12bot|GPTBot|CCBot|ClaudeBot|ChatGPT-User|Bytespider|PetalBot|Sogou|YandexBot|BLEXBot|DataForSeoBot|serpstatbot/i;

export default function middleware(req: NextRequest) {
  // Bot blocking — only on listing page routes (high-cost SSR/ISR pages)
  if (req.nextUrl.pathname.startsWith("/listing")) {
    const ua = req.headers.get("user-agent") ?? "";
    if (BLOCKED_BOTS.test(ua)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  // pass-through for everything else
  return NextResponse.next();
}
