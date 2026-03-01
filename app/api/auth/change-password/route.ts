// POST /api/auth/change-password
// Authenticated user changes their own password.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAuth,
  isAuthError,
  verifyPassword,
  hashPassword,
  logAuditEvent,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "currentPassword and newPassword are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 }
      );
    }

    let existingHash: string | null = null;

    if (auth.userType === "agent") {
      const agent = await prisma.agent.findUnique({
        where: { id: auth.userId },
        select: { password_hash: true },
      });
      existingHash = agent?.password_hash ?? null;
    } else {
      const lead = await prisma.lead.findUnique({
        where: { id: auth.userId },
        select: { password_hash: true },
      });
      existingHash = lead?.password_hash ?? null;
    }

    if (!existingHash) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const valid = await verifyPassword(currentPassword, existingHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      );
    }

    const newHash = await hashPassword(newPassword);

    if (auth.userType === "agent") {
      await prisma.agent.update({
        where: { id: auth.userId },
        data: { password_hash: newHash },
      });
    } else {
      await prisma.lead.update({
        where: { id: auth.userId },
        data: { password_hash: newHash },
      });
    }

    await logAuditEvent(
      "update",
      auth.userType,
      auth.userId.toString(),
      auth,
      { field: "password_hash" }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Change password error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
