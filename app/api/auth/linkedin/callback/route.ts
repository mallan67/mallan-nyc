// GET /api/auth/linkedin/callback — handle LinkedIn OAuth response
import { NextRequest, NextResponse } from "next/server";
import { handleOAuthLogin, SITE_URL } from "@/lib/auth/oauth";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      `${SITE_URL}/sign-in?error=LinkedIn+sign-in+cancelled`
    );
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: process.env.LINKEDIN_CLIENT_ID!,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
          redirect_uri: `${SITE_URL}/api/auth/linkedin/callback`,
        }),
      }
    );

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error("LinkedIn [token redacted] error:", tokens);
      return NextResponse.redirect(
        `${SITE_URL}/sign-in?error=LinkedIn+sign-in+failed`
      );
    }

    // Get user profile via OpenID Connect userinfo
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    if (!profile.email) {
      return NextResponse.redirect(
        `${SITE_URL}/sign-in?error=No+email+from+LinkedIn`
      );
    }

    return handleOAuthLogin({
      email: profile.email,
      firstName: profile.given_name || "",
      lastName: profile.family_name || "",
      picture: profile.picture,
      provider: "linkedin",
    });
  } catch (err) {
    console.error("LinkedIn OAuth error:", err);
    return NextResponse.redirect(
      `${SITE_URL}/sign-in?error=LinkedIn+sign-in+failed`
    );
  }
}
