// GET /api/auth/facebook — redirect to Facebook OAuth
import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/auth/oauth";

export async function GET() {
  const appId = process.env.FACEBOOK_APP_ID;
  if (!appId) {
    return NextResponse.redirect(`${SITE_URL}/sign-in?error=Facebook+sign-in+not+configured`);
  }

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: `${SITE_URL}/api/auth/facebook/callback`,
    scope: "email,public_profile",
    response_type: "code",
  });

  return NextResponse.redirect(
    `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`
  );
}
