// GET /api/crm/outlook/callback
// Handles Microsoft OAuth callback — exchanges code for tokens, stores them
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { exchangeCodeForTokens } from "@/lib/outlook/graph-client";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  if (error) {
    return NextResponse.redirect(
      new URL(`/crm/dashboard#/ops/outlook&message=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/crm/dashboard#/ops/outlook&message=missing_code", req.url)
    );
  }

  // Verify the caller has an active agent/broker session
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) {
    return NextResponse.redirect(
      new URL("/crm/dashboard#/ops/outlook&message=session_expired", req.url)
    );
  }

  // Extract agent ID from state and verify it matches the authenticated user
  const agentId = state.split("_")[0];
  if (agentId !== String(auth.userId)) {
    return NextResponse.redirect(
      new URL("/crm/dashboard#/ops/outlook&message=session_mismatch", req.url)
    );
  }

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
      new URL("/crm/dashboard#/ops/outlook", req.url)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed";
    console.error("Outlook callback error:", message);
    return NextResponse.redirect(
      new URL(`/crm/dashboard#/ops/outlook&message=${encodeURIComponent(message)}`, req.url)
    );
  }
}
