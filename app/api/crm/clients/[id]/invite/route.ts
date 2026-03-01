// POST /api/crm/clients/[id]/invite
// Generate a portal invite token for a client.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id: BigInt(parseInt(id)) },
  });

  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional — portal_role can come from lead.roles[0]
  }

  const portalRole =
    (body.portal_role as string) ??
    lead.portal_role ??
    lead.roles[0] ??
    null;

  if (!portalRole) {
    return NextResponse.json(
      { error: "portal_role is required (set on client or pass in body)" },
      { status: 400 }
    );
  }

  const portalToken = randomUUID();

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      portal_role: portalRole,
      portal_token: portalToken,
    },
  });

  await logAuditEvent(
    "create",
    "lead",
    lead.id.toString(),
    auth,
    { action: "portal_invite", portal_role: portalRole },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    inviteUrl: `/portal/invite?token=${portalToken}`,
    portalToken,
    portalRole,
  });
}
