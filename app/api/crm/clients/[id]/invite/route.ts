// POST /api/crm/clients/[id]/invite
// Generate a portal invite token for a client.
// Security: token is hashed before storage, has 72h TTL, raw token never returned in JSON.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { isLeadExplicitlyInactive, LEAD_PORTAL_ACCESS_REVOKED } from "@/lib/auth/lead-access";
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

  // No invitations to a deactivated client, and deliberately NO "reactivate and invite" shortcut.
  // Reactivation is a separate, deliberate lifecycle action a licensee takes knowingly.
  if (isLeadExplicitlyInactive(lead.status)) {
    return NextResponse.json({ error: LEAD_PORTAL_ACCESS_REVOKED }, { status: 409 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional — portal_role can come from lead.roles[0]
  }

  const candidateRole =
    (body.portal_role as string) ??
    lead.portal_role ??
    lead.roles[0] ??
    null;

  if (!candidateRole) {
    return NextResponse.json(
      { error: "portal_role is required (set on client or pass in body)" },
      { status: 400 }
    );
  }

  // roles[] says 'renter'; the legacy portal_role vocabulary says 'tenant'. That conversion is not
  // introduced here - it already exists at app/api/auth/me:201, portal/complete-profile:31 and :39,
  // sign-up:145 and lib/auth/middleware:189. Refusing a roles[0] === 'renter' fallback would reject a
  // client every other surface accepts.
  const portalRole = candidateRole === "renter" ? "tenant" : candidateRole;

  // The vocabulary prisma/schema.prisma:187 documents for portal_role. This check came from the
  // retired POST /api/auth/invite, which validated the role while this route did not - so deleting the
  // duplicate would have silently dropped a real protection. It is carried across rather than lost,
  // and it runs BEFORE any token is generated or any field written.
  const VALID_PORTAL_ROLES = ["buyer", "tenant", "seller", "landlord"];
  if (!VALID_PORTAL_ROLES.includes(portalRole)) {
    return NextResponse.json(
      { error: `portal_role must be one of: ${VALID_PORTAL_ROLES.join(', ')}` },
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
  // /portal/accept is the ONLY page that reads ?token= and the one the acceptance route
  // serves. This used to emit /portal/invite, which has no page and no rewrite - every issued
  // link 404'd. Retiring the duplicate issuer without this would have left one authority
  // whose output could not be used.
  const inviteUrl = `/portal/accept?token=${rawToken}`;

  return NextResponse.json({
    success: true,
    inviteUrl,
    portalRole,
    expiresAt: expiresAt.toISOString(),
  });
}
