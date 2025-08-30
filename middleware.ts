// middleware.ts
import { NextResponse } from "next/server";

// Pass-through (does nothing). Add your own checks later if needed.
export function middleware() {
  return NextResponse.next();
}

// VERY IMPORTANT: don't run middleware on API routes (and Next/static files)
export const config = {
  matcher: [
    // Run on everything EXCEPT these:
    "/((?!api|_next|static|favicon.ico|robots.txt|sitemap.xml|assets|images).*)",
  ],
};
