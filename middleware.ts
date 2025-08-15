import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  if (url.pathname.startsWith("/collection")) {
    const cookie = req.cookies.get("pc_auth")?.value;
    if (cookie !== "ok") {
      const redirect = new URL("/client-access", req.url);
      redirect.searchParams.set("next", url.pathname);
      return NextResponse.redirect(redirect);
    }
  }
  return NextResponse.next();
}
export const config = { matcher: ["/collection/:path*"] };
