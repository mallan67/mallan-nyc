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
import {
  rejectNonCanonicalLicenseType,
  rejectUnverifiedMemberMlsId,
  rejectIncoherentLicenceRole,
  canonicalTitleFor,
} from "@/lib/agents/license-designation";
import {
  applyAgentStatusTransition,
  transitionAgentStatus,
  isAgentStatus,
  type AgentStatus,
} from "@/lib/agents/agent-lifecycle";

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
  const mlsIdError = rejectUnverifiedMemberMlsId(body.trestle_mls_id);
  if (mlsIdError) {
    return NextResponse.json({ error: mlsIdError }, { status: 400 });
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

  // The professional title is DERIVED from the resulting licence class and
  // authorisation role. A client-chosen title let an Associate Broker
  // (role AGENT) be styled "Licensed Real Estate Broker".
  {
    const nextLicence = (body.license_type as string | undefined) ?? agent.license_type;
    const coherence = rejectIncoherentLicenceRole(nextLicence, agent.role);
    if (coherence) {
      return NextResponse.json({ error: coherence }, { status: 400 });
    }
    const derived = canonicalTitleFor(nextLicence, agent.role);
    if (derived) update.title = derived;
  }
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

  // ONE OUTER TRANSACTION owns the COMPLETE requested mutation.
  //
  // Previously the generic field update committed first and the lifecycle
  // transition ran in its own transaction afterwards, so a failing revoke left
  // the profile fields already changed. Nesting a second transaction inside
  // the first is not the fix either - it is the same split with extra steps.
  // applyAgentStatusTransition takes the transaction client, so the whole
  // action commits together or not at all.
  const { updated, lifecycle } = await prisma.$transaction(async (tx) => {
    const row = Object.keys(update).length > 0
      ? await tx.agent.update({ where: { id: agent.id }, data: update })
      : agent;

    let life = null;
    if (statusTransition && statusTransition !== agent.status) {
      life = await applyAgentStatusTransition(tx, agent.id, statusTransition, auth, {
        previous: agent.status,
        ip: req.headers.get("x-forwarded-for"),
        reason: "edit_agent_status_change",
      });
    }
    return { updated: row, lifecycle: life };
  });

  return NextResponse.json({
    lifecycle,
    // the COMMITTED status. `updated` is the row from the field update and
    // predates the transition, so reading updated.status here reported the
    // old value to the caller.
    status: lifecycle ? lifecycle.status : updated.status,
    id: updated.id.toString(),
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
  const lifecycle = await transitionAgentStatus(
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
