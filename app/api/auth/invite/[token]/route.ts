// GET/POST /api/auth/invite/[token]
// GET: Validate invite token, return client info.
// POST: Set password for client portal, create session.
// Security: token is hashed for DB lookup, TTL enforced, single-use (consumed on accept).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword, createSession, SESSION_COOKIE } from "@/lib/auth";
import { hashPortalToken, isPortalTokenExpired } from "@/lib/auth/portal-token";
import { getSessionCookieConfig } from "@/lib/auth/cookie-config";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Hash the incoming token to match the stored hash
  const tokenHash = hashPortalToken(token);

  const lead = await prisma.lead.findUnique({
    where: { portal_token: tokenHash },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      portal_role: true,
      portal_token_expires_at: true,
    },
  });

  if (!lead) {
    return NextResponse.json(
      { error: "Invalid or expired invite link" },
      { status: 404 }
    );
  }

  // Enforce TTL — fail closed if no expiry or expired
  if (isPortalTokenExpired(lead.portal_token_expires_at)) {
    // Clean up expired token
    await prisma.lead.update({
      where: { id: lead.id },
      data: { portal_token: null, portal_token_expires_at: null },
    });
    return NextResponse.json(
      { error: "Invite link has expired. Please request a new invitation from your agent." },
      { status: 410 }
    );
  }

  return NextResponse.json({
    valid: true,
    name: `${lead.first_name} ${lead.last_name}`,
    email: lead.email,
    portalRole: lead.portal_role,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const body = await req.json();
    const { password } = body;

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Hash the incoming token to match the stored hash
    const tokenHash = hashPortalToken(token);

    const lead = await prisma.lead.findUnique({
      where: { portal_token: tokenHash },
    });

    if (!lead) {
      return NextResponse.json(
        { error: "Invalid or expired invite link" },
        { status: 404 }
      );
    }

    // Enforce TTL
    if (isPortalTokenExpired(lead.portal_token_expires_at)) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { portal_token: null, portal_token_expires_at: null },
      });
      return NextResponse.json(
        { error: "Invite link has expired. Please request a new invitation from your agent." },
        { status: 410 }
      );
    }

    const hash = await hashPassword(password);
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        password_hash: hash,
        portal_token: null, // Consume the token (single-use)
        portal_token_expires_at: null,
        email_verified_at: new Date(), // Invited clients are pre-verified by agent/broker
        status: "active",
      },
    });

    // Create session immediately
    const role = lead.portal_role || "buyer";
    const ip = req.headers.get("x-forwarded-for") ?? undefined;
    const ua = req.headers.get("user-agent") ?? undefined;
    const sessionToken = await createSession("lead", lead.id, role, ip, ua);

    const res = NextResponse.json({
      success: true,
      user: {
        id: lead.id.toString(),
        name: `${lead.first_name} ${lead.last_name}`,
        email: lead.email,
        role,
        userType: "lead",
      },
    });

    res.cookies.set(SESSION_COOKIE, sessionToken, getSessionCookieConfig("lead", role));

    return res;
  } catch (err) {
    console.error("Invite accept error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
