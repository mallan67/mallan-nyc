// POST|GET /api/auth/logout
// Destroys session and clears cookie.
import { NextRequest, NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";
import { clearSessionCookies } from "@/lib/auth/cookie-config";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mallan.nyc";

async function handleLogout(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (token) {
    await destroySession(token);
  }

  // If called via GET (browser redirect), redirect to sign-in
  if (req.method === "GET") {
    const res = NextResponse.redirect(`${SITE_URL}/sign-in`);
    clearSessionCookies(res);
    return res;
  }

  // POST returns JSON
  const res = NextResponse.json({ success: true });
  clearSessionCookies(res);
  return res;
}

export async function POST(req: NextRequest) {
  return handleLogout(req);
}

export async function GET(req: NextRequest) {
  return handleLogout(req);
}
