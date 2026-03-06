// GET /api/auth/linkedin — redirect to LinkedIn OAuth
import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/auth/oauth";

export async function GET() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${SITE_URL}/sign-in?error=LinkedIn+sign-in+not+configured`);
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `${SITE_URL}/api/auth/linkedin/callback`,
    scope: "openid profile email",
  });

  return NextResponse.redirect(
    `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
  );
}
