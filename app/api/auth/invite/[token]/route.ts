// GET/POST /api/auth/invite/[token]
// GET: Validate invite token, return client info.
// POST: Set password for client portal, create session.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword, createSession, SESSION_COOKIE } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const lead = await prisma.lead.findUnique({
    where: { portal_token: token },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      portal_role: true,
    },
  });

  if (!lead) {
    return NextResponse.json(
      { error: "Invalid or expired invite link" },
      { status: 404 }
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

    const lead = await prisma.lead.findUnique({
      where: { portal_token: token },
    });

    if (!lead) {
      return NextResponse.json(
        { error: "Invalid or expired invite link" },
        { status: 404 }
      );
    }

    const hash = await hashPassword(password);
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        password_hash: hash,
        portal_token: null, // Consume the token
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

    res.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60,
    });

    return res;
  } catch (err) {
    console.error("Invite accept error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
