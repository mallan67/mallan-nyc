// middleware.ts  (place at the project root, same level as /app)
/* eslint-disable @next/next/no-server-import-in-page */
import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/admin/:path*"],
};

export function middleware(req: NextRequest) {
  // Only protect when explicitly enabled in Vercel env
  if (process.env.ADMIN_PROTECT !== "1") return NextResponse.next();

  const expectedUser = process.env.ADMIN_BASIC_USER ?? "";
  const expectedPass = process.env.ADMIN_BASIC_PASS ?? "";
  const auth = req.headers.get("authorization") ?? "";

  if (auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6)); // "user:pass"
      const sep = decoded.indexOf(":");
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      if (user === expectedUser && pass === expectedPass) {
        // Auth OK
        return NextResponse.next();
      }
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse(null, {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="Admin", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}
