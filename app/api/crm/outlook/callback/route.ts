// GET /api/crm/outlook/callback
// Handles Microsoft OAuth callback — exchanges code for tokens, stores them
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/outlook/graph-client";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  if (error) {
    return NextResponse.redirect(
      new URL(`/crm/dashboard#outlook-error&message=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/crm/dashboard#outlook-error&message=missing_code", req.url)
    );
  }

  // Extract agent ID from state
  const agentId = state.split("_")[0];

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Store tokens in the Agent record
    await prisma.agent.update({
      where: { id: BigInt(agentId) },
      data: {
        outlook_access_token: tokens.access_token,
        outlook_refresh_token: tokens.refresh_token,
        outlook_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    return NextResponse.redirect(
      new URL("/crm/dashboard#outlook-connected", req.url)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed";
    console.error("Outlook callback error:", message);
    return NextResponse.redirect(
      new URL(`/crm/dashboard#outlook-error&message=${encodeURIComponent(message)}`, req.url)
    );
  }
}
