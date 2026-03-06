// GET /api/auth/google — redirect to Google OAuth consent screen
import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/auth/oauth";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${SITE_URL}/sign-in?error=Google+sign-in+not+configured`);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${SITE_URL}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
