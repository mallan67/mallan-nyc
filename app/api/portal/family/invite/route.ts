// POST /api/portal/family/invite
// Client invites a family member to follow along.
// Creates the family member as a new Lead (if needed) and links them.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError, hashPassword, logAuditEvent } from "@/lib/auth";
import { generatePortalToken } from "@/lib/auth/portal-token";
import { sendEmail } from "@/lib/email/sendgrid";
import { portalInviteEmail } from "@/lib/email/templates";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  if (auth.userType !== "lead") {
    return NextResponse.json(
      { error: "Portal access requires a client account" },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email as string)?.trim().toLowerCase();
  const firstName = (body.first_name as string)?.trim();
  const lastName = (body.last_name as string)?.trim();
  const relationship = (body.relationship as string) ?? "other";

  if (!email || !firstName || !lastName) {
    return NextResponse.json(
      { error: "email, first_name, and last_name are required" },
      { status: 400 }
    );
  }

  // Get the inviting client's info
  const inviter = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      portal_role: true,
      agent_id: true,
    },
  });
  if (!inviter) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Limit: max 5 family members per client
  const existingCount = await prisma.familyMember.count({
    where: { lead_id: auth.userId },
  });
  if (existingCount >= 5) {
    return NextResponse.json(
      { error: "Maximum of 5 family members allowed" },
      { status: 400 }
    );
  }

  // Check if the family member already exists as a Lead
  let memberLead = await prisma.lead.findUnique({ where: { email } });

  if (!memberLead) {
    // Create the family member as a new Lead with same portal role and agent
    const { rawToken, tokenHash, expiresAt } = generatePortalToken();

    memberLead = await prisma.lead.create({
      data: {
        first_name: firstName,
        last_name: lastName,
        email,
        phone: (body.phone as string) ?? "",
        roles: inviter.portal_role ? [inviter.portal_role] : [],
        status: "new",
        portal_role: inviter.portal_role,
        agent_id: inviter.agent_id,
        source: "family_invite",
        portal_token: tokenHash,
        portal_token_expires_at: expiresAt,
      },
    });

    // Send invite email
    const inviterName = `${inviter.first_name} ${inviter.last_name}`;
    const html = portalInviteEmail(
      firstName,
      rawToken,
      inviterName,
      inviter.portal_role || "buyer"
    );
    await sendEmail(
      email,
      `${inviterName} invited you to Mallan Real Estate`,
      html
    );
  }

  // Check if already linked
  const existingLink = await prisma.familyMember.findUnique({
    where: {
      lead_id_member_lead_id: {
        lead_id: auth.userId,
        member_lead_id: memberLead.id,
      },
    },
  });

  if (existingLink) {
    return NextResponse.json(
      { error: "This person is already added as a family member" },
      { status: 409 }
    );
  }

  // Prevent self-invite
  if (memberLead.id === auth.userId) {
    return NextResponse.json(
      { error: "You cannot invite yourself" },
      { status: 400 }
    );
  }

  // Create the family link
  await prisma.familyMember.create({
    data: {
      lead_id: auth.userId,
      member_lead_id: memberLead.id,
      relationship,
    },
  });

  await logAuditEvent(
    "create",
    "family_member",
    memberLead.id.toString(),
    auth,
    { relationship, member_email: email },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json(
    {
      success: true,
      member: {
        id: memberLead.id.toString(),
        name: `${firstName} ${lastName}`,
        email,
        relationship,
      },
    },
    { status: 201 }
  );
}
