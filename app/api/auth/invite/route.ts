// POST /api/auth/invite
// Agent generates a portal invite link for a client and sends invite email.
// Security: token hashed before storage, 72h TTL, raw token only in email link.
import { NextRequest, NextResponse } from "next/server";
import { PORTAL_ROLE_VALUES, isPortalRole } from "@/lib/api/schemas/client";
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
import { escapeHtml } from "@/lib/sanitize";

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

    // THE CANONICAL VOCABULARY, not a local copy.
    //
    // This route kept its own list — ["buyer","tenant","seller","landlord"] —
    // which omits "renter". Since requirePortalRole normalises tenant -> renter
    // and both spellings exist on real rows, a renter client could not be
    // invited to their own portal at all. A second role list is also how the
    // vocabularies drift apart in the first place.
    if (!isPortalRole(portalRole)) {
      return NextResponse.json(
        { error: `portalRole must be one of: ${PORTAL_ROLE_VALUES.join(", ")}` },
        { status: 400 }
      );
    }

    const lead = await prisma.lead.findUnique({
      where: { id: BigInt(leadId) },
      select: { id: true, agent_id: true, email: true, first_name: true, last_name: true },
    });
    if (!lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // OWNERSHIP, NOT JUST ROLE.
    //
    // This looked the lead up by raw id with no agent_id filter, so ANY
    // authenticated agent could repoint portal_role on ANY lead in the
    // brokerage — including another agent's client — and trigger a live portal
    // invite email carrying a working credential to that person.
    //
    // The acting agent never sees the raw token (it is not returned in the
    // response), so this is not credential theft. It is an unauthorised
    // mutation of another agent's client record plus unsolicited contact with
    // that client, which is a brokerage-conduct surface as much as a technical
    // one.
    //
    // The sibling route app/api/crm/clients/[id]/invite already scopes exactly
    // this way; this one simply never did.
    if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
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

    const emailHtml = portalInviteEmail(escapeHtml(clientName), rawToken, escapeHtml(agentName), portalRole);
    const emailResult = await sendEmail(
      lead.email,
      "You're Invited to Your Client Portal — Mallan Real Estate",
      emailHtml,
      auth,
      { transactional: true }
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
