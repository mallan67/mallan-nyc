// POST /api/auth/mfa/backup-codes
// Regenerate backup codes (authenticated broker only, requires current TOTP code).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth/middleware";
import { hashPassword } from "@/lib/auth/password";
import {
  verifyTotpCode,
  decryptSecret,
  generateBackupCodes,
} from "@/lib/auth/mfa";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireBroker(req);
    if (isAuthError(auth)) return auth;
    const ip = req.headers.get("x-forwarded-for") ?? undefined;

    const body = await req.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: "Enter your current TOTP code to regenerate backup codes" },
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

    const newCodes = generateBackupCodes();
    const newHashes = await Promise.all(newCodes.map((c) => hashPassword(c)));

    await prisma.agent.update({
      where: { id: agent.id },
      data: { mfa_backup_hashes: newHashes },
    });

    await logAuditEvent(
      "mfa_backup_codes_regenerated",
      "agent",
      agent.id.toString(),
      auth,
      { codes_generated: 10 },
      ip
    );

    return NextResponse.json({
      success: true,
      backup_codes: newCodes,
      message: "New backup codes generated. Previous codes are now invalid.",
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("Backup codes error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
