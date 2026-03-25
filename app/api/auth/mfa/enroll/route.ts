// /api/auth/mfa/enroll
// GET  — Generate TOTP secret + QR code (authenticated broker only).
//        Does NOT persist the secret — returns it for the client to send back on POST.
// POST — Confirm enrollment by verifying a code + persisting the encrypted secret.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth/middleware";
import { hashPassword } from "@/lib/auth/password";
import {
  generateTotpSecret,
  verifyTotpCode,
  encryptSecret,
  generateBackupCodes,
  generateQrDataUrl,
} from "@/lib/auth/mfa";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireBroker(req);
    if (isAuthError(auth)) return auth;
    const ip = req.headers.get("x-forwarded-for") ?? undefined;

    const agent = await prisma.agent.findUnique({
      where: { id: auth.userId },
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.mfa_enabled) {
      return NextResponse.json(
        { error: "MFA is already enabled. Disable it first to re-enroll." },
        { status: 400 }
      );
    }

    // Generate new secret — NOT saved to DB yet (saved on POST after code verification)
    const secret = generateTotpSecret();
    const qrDataUrl = await generateQrDataUrl(secret, agent.email);

    await logAuditEvent(
      "mfa_enroll_start",
      "agent",
      agent.id.toString(),
      auth,
      {},
      ip
    );

    return NextResponse.json({
      secret: secret,
      qr_code: qrDataUrl,
      message: "Scan the QR code with your authenticator app, then POST a code to confirm.",
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("MFA enroll GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireBroker(req);
    if (isAuthError(auth)) return auth;
    const ip = req.headers.get("x-forwarded-for") ?? undefined;

    const body = await req.json();
    const { code, secret } = body;

    if (!code || !secret) {
      return NextResponse.json(
        { error: "Both code and secret are required" },
        { status: 400 }
      );
    }

    const agent = await prisma.agent.findUnique({
      where: { id: auth.userId },
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.mfa_enabled) {
      return NextResponse.json(
        { error: "MFA is already enabled" },
        { status: 400 }
      );
    }

    // Verify the code against the secret from the client
    const valid = verifyTotpCode(secret, code.trim());

    if (!valid) {
      return NextResponse.json(
        { error: "Invalid code. Make sure your authenticator app shows a 6-digit code and try again." },
        { status: 422 }
      );
    }

    // ── Code valid — persist encrypted secret + enable MFA ──
    const backupCodes = generateBackupCodes();
    const backupHashes = await Promise.all(
      backupCodes.map((c) => hashPassword(c))
    );

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        mfa_enabled: true,
        mfa_secret_enc: encryptSecret(secret),
        mfa_backup_hashes: backupHashes,
      },
    });

    await logAuditEvent(
      "mfa_enroll_complete",
      "agent",
      agent.id.toString(),
      auth,
      { backup_codes_generated: 10 },
      ip
    );

    return NextResponse.json({
      success: true,
      backup_codes: backupCodes,
      message: "MFA enabled. Save these backup codes — they will not be shown again.",
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("MFA enroll POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
