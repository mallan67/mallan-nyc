// POST /api/auth/invite
// Agent generates a portal invite link for a client and sends invite email.
// Security: token hashed before storage, 72h TTL, raw token only in email link.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { generatePortalToken } from "@/lib/auth/portal-token";
import { sendEmail } from "@/lib/email/sendgrid";
import { portalInviteEmail } from "@/lib/email/templates";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const { leadId, portalRole } = body;

    if (!leadId || !portalRole) {
      return NextResponse.json(
        { error: "leadId and portalRole are required" },
        { status: 400 }
      );
    }

    const validRoles = ["buyer", "tenant", "seller", "landlord"];
    if (!validRoles.includes(portalRole)) {
      return NextResponse.json(
        { error: `portalRole must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    const lead = await prisma.lead.findUnique({
      where: { id: BigInt(leadId) },
    });
    if (!lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Generate token: raw for email URL, hash for DB storage
    const { rawToken, tokenHash, expiresAt } = generatePortalToken();

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        portal_role: portalRole,
        portal_token: tokenHash,
        portal_token_expires_at: expiresAt,
      },
    });

    await logAuditEvent("create", "lead", lead.id.toString(), auth, {
      action: "portal_invite",
      portalRole,
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://mallan.nyc";
    const inviteUrl = `${baseUrl}/portal/accept?token=${rawToken}`;

    // Send invite email via SendGrid — raw token goes ONLY in the email link
    const agent = await prisma.agent.findUnique({
      where: { id: auth.userId },
      select: { full_name: true, first_name: true, last_name: true },
    });
    const agentName = agent?.full_name || `${agent?.first_name || ""} ${agent?.last_name || ""}`.trim() || "Your Agent";
    const clientName = `${lead.first_name} ${lead.last_name}`;

    const emailHtml = portalInviteEmail(clientName, rawToken, agentName, portalRole);
    const emailResult = await sendEmail(
      lead.email,
      "You're Invited to Your Client Portal — Mallan Real Estate",
      emailHtml,
      auth
    );

    // Security: never return raw token or hash in JSON response
    return NextResponse.json({
      success: true,
      inviteUrl,
      emailSent: emailResult.success,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("Invite error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
