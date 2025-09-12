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

export default function middleware(_req: NextRequest) {
  // pass-through
  return NextResponse.next();
}
