// GET /api/auth/facebook/callback — handle Facebook OAuth response
import { NextRequest, NextResponse } from "next/server";
import { handleOAuthLogin, SITE_URL } from "@/lib/auth/oauth";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      `${SITE_URL}/sign-in?error=Facebook+sign-in+cancelled`
    );
  }

  try {
    // Exchange code for token
    const tokenParams = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID!,
      client_secret: process.env.FACEBOOK_APP_SECRET!,
      redirect_uri: `${SITE_URL}/api/auth/facebook/callback`,
      code,
    });

    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams.toString()}`
    );
    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      console.error("Facebook [token redacted] error:", tokens);
      return NextResponse.redirect(
        `${SITE_URL}/sign-in?error=Facebook+sign-in+failed`
      );
    }

    // Get user profile
    const profileRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,first_name,last_name,email,picture.type(large)&access_token=${tokens.access_token}`
    );
    const profile = await profileRes.json();

    if (!profile.email) {
      return NextResponse.redirect(
        `${SITE_URL}/sign-in?error=No+email+from+Facebook.+Please+use+email+sign-in.`
      );
    }

    return handleOAuthLogin({
      email: profile.email,
      firstName: profile.first_name || "",
      lastName: profile.last_name || "",
      picture: profile.picture?.data?.url,
      provider: "facebook",
    });
  } catch (err) {
    console.error("Facebook OAuth error:", err);
    return NextResponse.redirect(
      `${SITE_URL}/sign-in?error=Facebook+sign-in+failed`
    );
  }
}
