// POST /api/auth/reset-password
// Validates SMS code + reset_session token, sets new password, signs user in.
//
// Body: { reset_session: string, code: string, password: string }
//
// Rate limit: 5 attempts per session, 5-minute TTL.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword, verifyPassword, createSession, SESSION_COOKIE, logAuditEvent } from "@/lib/auth";
import { MFA_MAX_ATTEMPTS } from "@/lib/auth/mfa";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { getSessionCookieConfig } from "@/lib/auth/cookie-config";

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const { reset_session, code, password } = body;

    if (!reset_session || !code || !password) {
      return NextResponse.json(
        { error: "reset_session, code, and password are required" },
        { status: 400 }
      );
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: "Code must be 6 digits" },
        { status: 400 }
      );
    }

    // Look up the reset session
    const session = await prisma.passwordResetSession.findUnique({
      where: { token: reset_session },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired reset session" },
        { status: 400 }
      );
    }

    if (session.user_type !== "agent" && session.user_type !== "lead") {
      return NextResponse.json(
        { error: "Invalid reset session" },
        { status: 400 }
      );
    }
    const userType: "agent" | "lead" = session.user_type;

    if (session.verified_at) {
      return NextResponse.json(
        { error: "This reset session has already been used" },
        { status: 400 }
      );
    }

    if (session.expires_at < new Date()) {
      return NextResponse.json(
        { error: "Reset code has expired. Request a new one." },
        { status: 400 }
      );
    }

    if (session.attempts >= MFA_MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many failed attempts. Request a new code." },
        { status: 429 }
      );
    }

    // Verify the code (bcrypt timing-safe). Always increment attempts first
    // so a failed attempt is recorded regardless of code validity.
    const valid = await verifyPassword(code, session.code_hash);

    if (!valid) {
      await prisma.passwordResetSession.update({
        where: { id: session.id },
        data: { attempts: { increment: 1 } },
      });
      return NextResponse.json(
        { error: "Incorrect code", attempts_remaining: MFA_MAX_ATTEMPTS - session.attempts - 1 },
        { status: 400 }
      );
    }

    // Code valid — set new password atomically.
    const newHash = await hashPassword(password);

    let role = "buyer";
    let userName: string | null = null;
    let userEmail: string | null = null;

    if (userType === "agent") {
      const agent = await prisma.agent.update({
        where: { id: session.user_id },
        data: { password_hash: newHash },
        select: { full_name: true, first_name: true, last_name: true, email: true, role: true },
      });
      role = agent.role;
      userName = agent.full_name || `${agent.first_name} ${agent.last_name}`;
      userEmail = agent.email;
    } else {
      const lead = await prisma.lead.update({
        where: { id: session.user_id },
        data: { password_hash: newHash },
        select: { first_name: true, last_name: true, email: true, portal_role: true },
      });
      role = lead.portal_role || "buyer";
      userName = `${lead.first_name} ${lead.last_name}`;
      userEmail = lead.email;
    }

    // Mark session as used so the same code can't replay
    await prisma.passwordResetSession.update({
      where: { id: session.id },
      data: { verified_at: new Date() },
    });

    await logAuditEvent(
      "update",
      userType,
      session.user_id.toString(),
      { userId: session.user_id, userType: userType, role } as Parameters<typeof logAuditEvent>[3],
      { field: "password_hash", method: "sms_reset" }
    );

    // Create session — user is signed in
    const ip = req.headers.get("x-forwarded-for") ?? undefined;
    const ua = req.headers.get("user-agent") ?? undefined;
    const sessionToken = await createSession(userType, session.user_id, role, ip, ua);

    const res = NextResponse.json({
      success: true,
      user: {
        id: session.user_id.toString(),
        name: userName,
        email: userEmail,
        role,
        userType: userType,
      },
    });

    res.cookies.set(SESSION_COOKIE, sessionToken, getSessionCookieConfig(userType, role));

    return res;
  } catch (err) {
    console.error("Reset [redacted] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
