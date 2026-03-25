// GET /api/auth/google/callback — handle Google OAuth response
import { NextRequest, NextResponse } from "next/server";
import { handleOAuthLogin, SITE_URL } from "@/lib/auth/oauth";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      `${SITE_URL}/sign-in?error=Google+sign-in+cancelled`
    );
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${SITE_URL}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error("Google [token redacted] error:", tokens);
      return NextResponse.redirect(
        `${SITE_URL}/sign-in?error=Google+sign-in+failed`
      );
    }

    // Get user profile
    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const profile = await profileRes.json();

    if (!profile.email) {
      return NextResponse.redirect(
        `${SITE_URL}/sign-in?error=No+email+from+Google`
      );
    }

    return handleOAuthLogin({
      email: profile.email,
      firstName: profile.given_name || "",
      lastName: profile.family_name || "",
      picture: profile.picture,
      provider: "google",
    });
  } catch (err) {
    console.error("Google OAuth error:", err);
    return NextResponse.redirect(
      `${SITE_URL}/sign-in?error=Google+sign-in+failed`
    );
  }
}
