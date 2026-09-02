// /api/crm/agents/[id]
// PATCH: Update agent. DELETE: Deactivate agent (soft delete). Broker-only.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { rejectNonCanonicalLicenseType } from "@/lib/agents/license-designation";
import { applyAgentStatusTransition, isAgentStatus, type AgentStatus } from "@/lib/agents/agent-lifecycle";

type RouteParams = { params: Promise<{ id: string }> };

async function findAgent(id: string) {
  const numericId = parseInt(id);
  if (!isNaN(numericId)) {
    return prisma.agent.findUnique({ where: { id: BigInt(numericId) } });
  }
  return null;
}

/**
 * GET /api/crm/agents/[id]
 * Return single agent detail. Broker-only.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const agent = await findAgent(id);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({
    agent: {
      id: agent.id.toString(),
      first_name: agent.first_name,
      last_name: agent.last_name,
      full_name: agent.full_name,
      name: agent.full_name,
      email: agent.email,
      phone: agent.phone,
      license_no: agent.license_no,
      // Cotality Member.MemberMlsId. Distinct from MemberAORMlsId,
      // MemberNationalAssociationId (NRDS) and MemberStateLicense.
      trestle_mls_id: agent.trestle_mls_id,
      license_type: agent.license_type,
      license_expiry: agent.license_expiry,
      sale_split: agent.sale_split?.toString() ?? null,
      rental_split: agent.rental_split?.toString() ?? null,
      role: agent.role,
      status: agent.status,
      title: agent.title,
      bio: agent.bio,
      photo: agent.photo,
      public_slug: agent.public_slug,
      featured: agent.featured,
      specialties: agent.specialties,
      languages: agent.languages,
    },
  });
}

/**
 * PATCH /api/crm/agents/[id]
 * Update agent fields. Broker-only.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const agent = await findAgent(id);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.first_name !== undefined) {
    update.first_name = String(body.first_name);
  }
  if (body.last_name !== undefined) {
    update.last_name = String(body.last_name);
  }
  if (body.first_name !== undefined || body.last_name !== undefined) {
    update.full_name = `${body.first_name ?? agent.first_name} ${body.last_name ?? agent.last_name}`;
  }
  if (body.phone !== undefined) update.phone = body.phone as string | null;
  if (body.license_no !== undefined) update.license_no = body.license_no as string | null;
  const licenseTypeError = rejectNonCanonicalLicenseType(body.license_type);
  if (licenseTypeError) {
    return NextResponse.json({ error: licenseTypeError }, { status: 400 });
  }
  if (body.license_type !== undefined) update.license_type = body.license_type as string | null;
  if (body.trestle_mls_id !== undefined) {
    update.trestle_mls_id = body.trestle_mls_id as string | null;
  }
  if (body.license_expiry !== undefined) {
    update.license_expiry = body.license_expiry
      ? new Date(body.license_expiry as string)
      : null;
  }
  if (body.sale_split !== undefined) {
    update.sale_split = body.sale_split != null ? Number(body.sale_split) : null;
  }
  if (body.rental_split !== undefined) {
    update.rental_split = body.rental_split != null ? Number(body.rental_split) : null;
  }
  // ACCOUNT STATE IS NOT A GENERIC FIELD.
  //
  // This used to write Agent.status directly, which made PATCH a second state
  // writer alongside DELETE - and unlike DELETE it revoked nothing. Because
  // validateSession() reads only the Session row (and even extends it), an
  // agent edited to "inactive" here kept a working, accepted CRM session.
  //
  // Status is therefore stripped out of the generic field update and applied
  // through the single lifecycle authority AFTER it, so every transition
  // revokes sessions and writes its own audit event.
  let statusTransition: AgentStatus | null = null;
  if (body.status !== undefined) {
    if (!isAgentStatus(body.status)) {
      return NextResponse.json(
        { error: "status must be: active, inactive, or suspended" },
        { status: 400 }
      );
    }
    statusTransition = body.status;
  }

  if (body.title !== undefined) update.title = body.title as string | null;
  if (body.bio !== undefined) update.bio = body.bio as string | null;
  if (body.photo !== undefined) update.photo = body.photo as string | null;
  if (body.public_slug !== undefined) update.public_slug = body.public_slug as string | null;
  if (body.featured !== undefined) update.featured = Boolean(body.featured);
  if (body.specialties !== undefined) {
    update.specialties = Array.isArray(body.specialties) ? body.specialties.map(String) : [];
  }
  if (body.languages !== undefined) {
    update.languages = Array.isArray(body.languages) ? body.languages.map(String) : [];
  }

  // A status-only request is legitimate: status is deliberately NOT part of the
  // generic field update any more, so it would otherwise look like an empty
  // body here.
  if (Object.keys(update).length === 0 && !statusTransition) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const updated = Object.keys(update).length > 0
    ? await prisma.agent.update({ where: { id: agent.id }, data: update })
    : agent;

  // Account state, if requested, goes through the ONE lifecycle authority so
  // it revokes sessions and audits itself exactly as Deactivate does.
  let lifecycle = null;
  if (statusTransition && statusTransition !== agent.status) {
    lifecycle = await applyAgentStatusTransition(
      prisma,
      agent.id,
      statusTransition,
      auth,
      {
        previous: agent.status,
        ip: req.headers.get("x-forwarded-for"),
        reason: "edit_agent_status_change",
      }
    );
  }

  await logAuditEvent(
    "update",
    "agent",
    agent.id.toString(),
    auth,
    { fields: Object.keys(update) },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    lifecycle,
    id: updated.id.toString(),
    status: updated.status,
  });
}

/**
 * DELETE /api/crm/agents/[id]
 * Deactivate an agent (soft delete). Broker-only.
 * Sets status = "inactive" and deletes all active sessions.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const agent = await findAgent(id);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Soft delete: set status to inactive
  // Same authority as the PATCH path, so the two can never drift apart again.
  const lifecycle = await applyAgentStatusTransition(
    prisma,
    agent.id,
    "inactive",
    auth,
    {
      previous: agent.status,
      ip: req.headers.get("x-forwarded-for"),
      reason: "deactivate_agent",
    }
  );


  await logAuditEvent(
    "delete",
    "agent",
    agent.id.toString(),
    auth,
    { action: "deactivate" },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: agent.id.toString(),
    status: lifecycle.status,
    sessions_revoked: lifecycle.sessions_revoked,
    mfa_sessions_revoked: lifecycle.mfa_sessions_revoked,
  });
}
