// POST /api/auth/mfa/verify
// Validates an OTP code (sent via email/SMS) against an MFA session.
// On success: creates real session, sets cookie, destroys MFA session.
// On failure: increments attempts, destroys session after 5 failures.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword, createSession, SESSION_COOKIE } from "@/lib/auth";
import { getSessionCookieConfig } from "@/lib/auth/cookie-config";
import { MFA_MAX_ATTEMPTS } from "@/lib/auth/mfa";
import { logAuditEvent } from "@/lib/auth/middleware";
import type { SessionUser } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mfa_session, code } = body;

    if (!mfa_session || !code) {
      return NextResponse.json(
        { error: "MFA session token and code are required" },
        { status: 400 }
      );
    }

    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined;
    const ua = req.headers.get("user-agent") ?? undefined;

    // ── Find MFA session ──
    const mfaSess = await prisma.mfaSession.findUnique({
      where: { token: mfa_session },
    });

    if (!mfaSess) {
      return NextResponse.json(
        { error: "Invalid or expired code. Please log in again." },
        { status: 422 }
      );
    }

    // Check expiry
    if (mfaSess.expires_at < new Date()) {
      await prisma.mfaSession.delete({ where: { id: mfaSess.id } }).catch(() => {});
      return NextResponse.json(
        { error: "Code expired. Please log in again." },
        { status: 422 }
      );
    }

    // Check rate limit
    if (mfaSess.attempts >= MFA_MAX_ATTEMPTS) {
      await prisma.mfaSession.delete({ where: { id: mfaSess.id } }).catch(() => {});
      return NextResponse.json(
        { error: "Too many failed attempts. Please log in again." },
        { status: 429 }
      );
    }

    // ── Load agent ──
    const agent = await prisma.agent.findUnique({
      where: { id: mfaSess.agent_id },
    });

    if (!agent) {
      await prisma.mfaSession.delete({ where: { id: mfaSess.id } }).catch(() => {});
      return NextResponse.json({ error: "Account not found" }, { status: 400 });
    }

    // Audit helper
    const auditUser: SessionUser = {
      userId: agent.id,
      userType: "agent",
      role: agent.role,
      sessionId: "mfa-pending",
    };

    // ── Verify code against bcrypt hash ──
    const codeValid = await verifyPassword(code.trim(), mfaSess.code_hash);

    if (!codeValid) {
      await prisma.mfaSession.update({
        where: { id: mfaSess.id },
        data: { attempts: { increment: 1 } },
      });

      await logAuditEvent(
        "mfa_verify_fail",
        "agent",
        agent.id.toString(),
        auditUser,
        { attempts: mfaSess.attempts + 1 },
        ip
      );

      const remaining = MFA_MAX_ATTEMPTS - (mfaSess.attempts + 1);
      return NextResponse.json(
        { error: `Invalid code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` },
        { status: 422 }
      );
    }

    // ── Code valid — create real session ──
    // This is the ONLY path that may mint a principal-broker session in
    // production: the OTP was just verified immediately above.
    const sessionToken = await createSession("agent", agent.id, agent.role, ip, ua, {
      kind: "mfa_verified",
    });

    await prisma.agent.update({
      where: { id: agent.id },
      data: { last_login: new Date() },
    });

    // Destroy MFA session (single-use)
    await prisma.mfaSession.delete({ where: { id: mfaSess.id } }).catch(() => {});

    await logAuditEvent(
      "mfa_verify_success",
      "agent",
      agent.id.toString(),
      auditUser,
      { method: "email_otp" },
      ip
    );

    const res = NextResponse.json({
      success: true,
      user: {
        id: agent.id.toString(),
        name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
        email: agent.email,
        role: agent.role,
        userType: "agent",
      },
    });

    res.cookies.set(
      SESSION_COOKIE,
      sessionToken,
      getSessionCookieConfig("agent", agent.role)
    );

    return res;
  } catch (err) {
    console.error("MFA verify error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
