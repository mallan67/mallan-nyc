// POST /api/auth/mfa/verify
// Validates a TOTP code (or backup code) against an MFA session.
// On success: creates real session, sets cookie, destroys MFA session.
// On failure: increments attempts, destroys session after 5 failures.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { getSessionCookieConfig } from "@/lib/auth/cookie-config";
import {
  verifyTotpCode,
  decryptSecret,
  findBackupCodeIndex,
  MFA_MAX_ATTEMPTS,
} from "@/lib/auth/mfa";
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
        { error: "Invalid or expired MFA session" },
        { status: 422 }
      );
    }

    // Check expiry
    if (mfaSess.expires_at < new Date()) {
      await prisma.mfaSession.delete({ where: { id: mfaSess.id } }).catch(() => {});
      return NextResponse.json(
        { error: "MFA session expired. Please log in again." },
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

    if (!agent || !agent.mfa_secret_enc) {
      await prisma.mfaSession.delete({ where: { id: mfaSess.id } }).catch(() => {});
      return NextResponse.json({ error: "MFA not configured" }, { status: 400 });
    }

    // Audit helper (agent not yet authenticated — build partial SessionUser)
    const auditUser: SessionUser = {
      userId: agent.id,
      userType: "agent",
      role: agent.role,
      sessionId: "mfa-pending",
    };

    // ── Try TOTP code first ──
    const secret = decryptSecret(agent.mfa_secret_enc);
    const totpValid = verifyTotpCode(secret, code.trim());

    if (!totpValid) {
      // ── Try backup code ──
      const backupIdx = await findBackupCodeIndex(
        code.trim().toLowerCase(),
        agent.mfa_backup_hashes
      );

      if (backupIdx === -1) {
        // Both failed — increment attempts
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
          {
            error: `Invalid code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
          },
          { status: 422 }
        );
      }

      // ── Backup code matched — remove it ──
      const updatedHashes = [...agent.mfa_backup_hashes];
      updatedHashes.splice(backupIdx, 1);
      await prisma.agent.update({
        where: { id: agent.id },
        data: { mfa_backup_hashes: updatedHashes },
      });

      await logAuditEvent(
        "mfa_backup_code_used",
        "agent",
        agent.id.toString(),
        auditUser,
        { remaining_codes: updatedHashes.length },
        ip
      );
    }

    // ── MFA verified — create real session ──
    const sessionToken = await createSession("agent", agent.id, agent.role, ip, ua);

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
      { method: totpValid ? "totp" : "backup_code" },
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
