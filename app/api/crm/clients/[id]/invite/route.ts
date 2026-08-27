// POST /api/crm/clients/[id]/invite
// Generate a portal invite token for a client.
// Security: token is hashed before storage, has 72h TTL, raw token never returned in JSON.
import { NextRequest, NextResponse } from "next/server";
import { PORTAL_ROLE_VALUES, isPortalRole } from "@/lib/api/schemas/client";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { generatePortalToken } from "@/lib/auth/portal-token";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id: safeBigInt(id) ?? BigInt(-1) },
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

  // DEFENCE IN DEPTH. This value is copied verbatim into Session.role by every
  // login path, so an unconstrained string here is how "BROKER" reached the
  // staff authorization check. The boundary fix in requireRole makes that
  // harmless, but an invite must still never MINT a bad value — including from
  // a stale lead.portal_role or roles[0] carried forward by the ?? chain above.
  if (portalRole !== null && !isPortalRole(portalRole)) {
    return NextResponse.json(
      {
        error: "portal_role must be a client portal role",
        allowed: PORTAL_ROLE_VALUES,
      },
      { status: 400 },
    );
  }

  if (!portalRole) {
    return NextResponse.json(
      { error: "portal_role is required (set on client or pass in body)" },
      { status: 400 }
    );
  }

  // Generate token: raw for URL, hash for DB storage
  const { rawToken, tokenHash, expiresAt } = generatePortalToken();

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      portal_role: portalRole,
      portal_token: tokenHash,
      portal_token_expires_at: expiresAt,
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

  // Security: return only the invite URL — never the raw token in JSON.
  // The raw token is embedded in the URL which should only be sent via email.
  const inviteUrl = `/portal/invite?token=${rawToken}`;

  return NextResponse.json({
    success: true,
    inviteUrl,
    portalRole,
    expiresAt: expiresAt.toISOString(),
  });
}
