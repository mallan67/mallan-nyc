// middleware.ts — edge alias→canonical redirects for public listing URLs.
//
// Neon public-DB-wakeups P0: a public ALIAS listing request (bare id, Option-D hybrid, or
// legacy address-only slug) is redirected to its canonical /listing/{address}/{id} HERE,
// at the edge, from the durable Upstash alias index — with NO Prisma/Neon access and NO
// Server-Component `redirect()` (which failed under ISR prerender in #516). The 308 carries
// explicit CDN cache headers so a repeated alias never re-invokes anything, and a
// never-before-requested valid alias resolves from the pre-populated index (still no Neon).
//
// This runs ONLY for /listing/* (see `config.matcher`). Canonical two-segment paths and the
// suppressed `listing-{id}` form fall straight through to the ISR page (no Redis call).
// Security headers are applied by next.config.js, unaffected by this middleware.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { slugPartsFromPathname, deriveAliasLookup, lookupAlias } from "@/lib/listings/alias-index";

export const config = {
  // Scope tightly to listing paths; excludes assets/api so the edge cost is paid only here.
  matcher: ["/listing/:path*"],
};

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const parts = slugPartsFromPathname(req.nextUrl.pathname);
  if (!parts) return NextResponse.next();

  const derived = deriveAliasLookup(parts);
  if (derived.kind === "canonical") {
    // Already canonical (or suppressed `listing-{id}`) → render via ISR. No Redis, no DB.
    return NextResponse.next();
  }

  // Alias → resolve from the durable index (Upstash). NEVER Prisma/Neon here.
  const canonical = await lookupAlias(derived.redisKey);

  if (canonical === undefined) {
    // Redis unavailable or non-authoritative miss → FAIL OPEN to the page (availability
    // over the optimization). The page still enforces gates; it never caches a false 404.
    const res = NextResponse.next();
    res.headers.set("x-alias-index", "miss-open");
    return res;
  }

  if (canonical === null) {
    // Authoritative miss (index is complete) → the listing does not exist. 404 WITHOUT DB.
    const res = new NextResponse(null, { status: 404 });
    res.headers.set("x-alias-index", "miss-404");
    res.headers.set("x-neon-queried", "0");
    return res;
  }

  // Hit → real 308 to canonical, CDN-cacheable so repeats never re-invoke the function.
  const url = new URL(canonical, req.nextUrl.origin);
  const res = NextResponse.redirect(url, 308);
  res.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  res.headers.set("CDN-Cache-Control", "public, s-maxage=86400");
  res.headers.set("Vercel-CDN-Cache-Control", "public, s-maxage=86400");
  res.headers.set("x-alias-index", "hit");
  res.headers.set("x-neon-queried", "0");
  return res;
}
