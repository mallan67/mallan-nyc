// POST /api/auth/reset-password
// Validates token and sets new password. Creates session on success.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  hashPassword,
  createSession,
  isPrincipalBrokerRole,
  SESSION_COOKIE,
} from "@/lib/auth";
import { validateResetToken } from "@/lib/auth/reset-token";
import { logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { getSessionCookieConfig } from "@/lib/auth/cookie-config";

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const { token, password } = body;

    if (!token || !password) {
      return NextResponse.json(
        { error: "Token and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // We need to decode the token to get the userId + userType, then fetch the
    // current password hash to fully validate (hash prefix check).
    // Decode without full validation first to get userId/userType.
    let decoded: string;
    try {
      decoded = Buffer.from(token, "base64url").toString("utf-8");
    } catch {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }

    const parts = decoded.split(":");
    if (parts.length !== 5) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }

    const [userIdStr, userType] = parts;
    if (userType !== "agent" && userType !== "lead") {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }

    const userId = BigInt(userIdStr);

    // Fetch current password hash for full validation
    let currentHash: string | null = null;
    let userName: string | null = null;
    let userEmail: string | null = null;
    let role: string = "buyer";

    if (userType === "agent") {
      const agent = await prisma.agent.findUnique({
        where: { id: userId },
        select: { password_hash: true, full_name: true, first_name: true, last_name: true, email: true, role: true },
      });
      if (!agent) {
        return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
      }
      currentHash = agent.password_hash;
      userName = agent.full_name || `${agent.first_name} ${agent.last_name}`;
      userEmail = agent.email;
      role = agent.role;
    } else {
      const lead = await prisma.lead.findUnique({
        where: { id: userId },
        select: { password_hash: true, first_name: true, last_name: true, email: true, portal_role: true },
      });
      if (!lead?.password_hash) {
        return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
      }
      currentHash = lead.password_hash;
      userName = `${lead.first_name} ${lead.last_name}`;
      userEmail = lead.email;
      role = lead.portal_role || "buyer";
    }

    // Full validation with current hash
    const validated = validateResetToken(token, currentHash);
    if (!validated) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }

    // Set new password
    const newHash = await hashPassword(password);

    if (userType === "agent") {
      await prisma.agent.update({
        where: { id: userId },
        data: { password_hash: newHash },
      });
    } else {
      await prisma.lead.update({
        where: { id: userId },
        data: { password_hash: newHash },
      });
    }

    await logAuditEvent(
      "update",
      userType,
      userId.toString(),
      { userId, userType, role } as Parameters<typeof logAuditEvent>[3],
      { field: "password_hash", method: "reset_token" }
    );

    const user = {
      id: userId.toString(),
      name: userName,
      email: userEmail,
      role,
      userType,
    };

    // ── Principal brokers get NO session from a password reset ──
    // Possession of a reset token proves control of the mailbox; it does not
    // prove broker MFA. Minting a broker session here would let the reset path
    // skip the OTP challenge that POST /api/auth/login enforces. The broker
    // must sign in normally, which issues that challenge. `requires_signin`
    // tells the client to route to sign-in instead of a dashboard it cannot
    // reach. Non-broker principals keep the existing sign-in-on-reset flow.
    if (userType === "agent" && isPrincipalBrokerRole(role)) {
      return NextResponse.json({ success: true, requires_signin: true, user });
    }

    // Create session so user is logged in immediately
    const ip = req.headers.get("x-forwarded-for") ?? undefined;
    const ua = req.headers.get("user-agent") ?? undefined;
    const sessionToken = await createSession(userType, userId, role, ip, ua);

    const res = NextResponse.json({ success: true, user });

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
