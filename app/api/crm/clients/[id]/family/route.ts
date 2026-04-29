// /api/crm/clients/[id]/family
// POST: Link two clients as family members (spouse, partner, co-owner, etc.)
// GET: List family members for a client
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { assertLeadAccess } from "@/lib/crm/access";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = safeBigInt(id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid client ID" }, { status: 400 });
  }
  const access = await assertLeadAccess(auth, leadId);
  if (access) return access;

  const members = await prisma.familyMember.findMany({
    where: { lead_id: leadId },
    include: {
      member: { select: { id: true, first_name: true, last_name: true, email: true, phone: true, roles: true } },
    },
  });

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      relationship: m.relationship,
      member: {
        id: m.member.id,
        first_name: m.member.first_name,
        last_name: m.member.last_name,
        email: m.member.email,
        phone: m.member.phone,
        roles: m.member.roles,
      },
    })),
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = safeBigInt(id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid client ID" }, { status: 400 });
  }
  const access = await assertLeadAccess(auth, leadId);
  if (access) return access;

  let body: { member_lead_id?: string | number; relationship?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const memberLeadId = safeBigInt(String(body.member_lead_id || ""));
  if (!memberLeadId) {
    return NextResponse.json({ error: "member_lead_id is required" }, { status: 400 });
  }
  const memberAccess = await assertLeadAccess(auth, memberLeadId);
  if (memberAccess) return memberAccess;

  const relationship = body.relationship || "spouse";

  // Create bidirectional link
  try {
    await prisma.$transaction([
      prisma.familyMember.upsert({
        where: { lead_id_member_lead_id: { lead_id: leadId, member_lead_id: memberLeadId } },
        update: { relationship },
        create: { lead_id: leadId, member_lead_id: memberLeadId, relationship },
      }),
      prisma.familyMember.upsert({
        where: { lead_id_member_lead_id: { lead_id: memberLeadId, member_lead_id: leadId } },
        update: { relationship },
        create: { lead_id: memberLeadId, member_lead_id: leadId, relationship },
      }),
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Failed to link: " + message }, { status: 500 });
  }

  await logAuditEvent(
    "create",
    "family_member",
    String(leadId),
    auth,
    { member_lead_id: String(memberLeadId), relationship },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({ linked: true, lead_id: String(leadId), member_lead_id: String(memberLeadId), relationship }, { status: 201 });
}
