// POST /api/auth/mfa/disable
// Disable MFA (authenticated broker only, requires current TOTP code).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth/middleware";
import { verifyTotpCode, decryptSecret } from "@/lib/auth/mfa";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireBroker(req);
    if (isAuthError(auth)) return auth;
    const ip = req.headers.get("x-forwarded-for") ?? undefined;

    const body = await req.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: "Enter your current TOTP code to disable MFA" },
        { status: 400 }
      );
    }

    const agent = await prisma.agent.findUnique({
      where: { id: auth.userId },
    });

    if (!agent || !agent.mfa_enabled || !agent.mfa_secret_enc) {
      return NextResponse.json(
        { error: "MFA is not enabled" },
        { status: 400 }
      );
    }

    const secret = decryptSecret(agent.mfa_secret_enc);
    if (!verifyTotpCode(secret, code.trim())) {
      return NextResponse.json({ error: "Invalid TOTP code" }, { status: 422 });
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        mfa_enabled: false,
        mfa_secret_enc: null,
        mfa_backup_hashes: [],
      },
    });

    await logAuditEvent(
      "mfa_disabled",
      "agent",
      agent.id.toString(),
      auth,
      {},
      ip
    );

    return NextResponse.json({
      success: true,
      message: "MFA has been disabled. You can re-enroll at any time.",
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("MFA disable error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
