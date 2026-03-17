// GET /api/crm/outlook/auth
// Initiates Microsoft OAuth flow — redirects user to Microsoft login
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { getAuthUrl } from "@/lib/outlook/graph-client";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // State parameter: agent ID + random nonce for CSRF protection
  const state = `${auth.userId}_${crypto.randomBytes(16).toString("hex")}`;

  const url = getAuthUrl(state);
  return NextResponse.redirect(url);
}
