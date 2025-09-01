// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: ["/admin/:path*"],
};

export function middleware(req: NextRequest) {
  const protect = (process.env.ADMIN_PROTECT || "").trim() === "1";
  if (!protect) return NextResponse.next();

  const user = (process.env.ADMIN_BASIC_USER || "").trim();
  const pass = (process.env.ADMIN_BASIC_PASS || "").trim();
  if (!user || !pass) {
    return new NextResponse("Admin is not configured", { status: 503 });
  }

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Basic ")) {
    return new NextResponse("Auth required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Admin", charset="UTF-8"' },
    });
  }

  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const [u, p] = decoded.split(":", 2);
  if (u === user && p === pass) {
    return NextResponse.next();
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin", charset="UTF-8"' },
  });
}
