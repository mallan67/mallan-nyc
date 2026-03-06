// /api/crm/clients/[id]
// GET: Full client profile with preferences and actions.
// PATCH: Update client fields.
// Ownership enforced: agent sees only their clients.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

type RouteParams = { params: Promise<{ id: string }> };

async function findLead(id: string) {
  const numericId = parseInt(id);
  if (!isNaN(numericId)) {
    return prisma.lead.findUnique({ where: { id: BigInt(numericId) } });
  }
  return null;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id: BigInt(parseInt(id)) },
    include: {
      preferences: true,
      actions: {
        include: {
          listing: {
            select: {
              id: true,
              listing_id: true,
              address: true,
              list_price: true,
              status: true,
              listing_type: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return NextResponse.json({
    id: lead.id.toString(),
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    phone: lead.phone,
    roles: lead.roles,
    status: lead.status,
    portal_role: lead.portal_role,
    agent_id: lead.agent_id?.toString() ?? null,
    source: lead.source,
    created_at: lead.created_at,
    updated_at: lead.updated_at,
    preferences: lead.preferences
      ? {
          ...lead.preferences,
          id: lead.preferences.id.toString(),
          lead_id: lead.preferences.lead_id.toString(),
          min_price: lead.preferences.min_price?.toString() ?? null,
          max_price: lead.preferences.max_price?.toString() ?? null,
        }
      : null,
    actions: lead.actions.map((a) => ({
      id: a.id.toString(),
      listing_id: a.listing_id.toString(),
      action: a.action,
      comment: a.comment,
      created_at: a.created_at,
      listing: {
        ...a.listing,
        id: a.listing.id.toString(),
        list_price: a.listing.list_price.toString(),
      },
    })),
  });
}

/**
 * PATCH /api/crm/clients/[id]
 * Update client fields. Owner agent or broker.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const lead = await findLead(id);

  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.first_name !== undefined) update.first_name = String(body.first_name);
  if (body.last_name !== undefined) update.last_name = String(body.last_name);
  if (body.phone !== undefined) update.phone = String(body.phone);
  if (body.status !== undefined) update.status = String(body.status);
  if (body.portal_role !== undefined) update.portal_role = body.portal_role as string | null;
  if (body.notes !== undefined) update.source = String(body.source ?? lead.source);
  if (body.roles !== undefined) {
    const validRoles = ["buyer", "renter", "seller", "landlord"];
    const roles = body.roles as string[];
    if (!roles.every((r) => validRoles.includes(r))) {
      return NextResponse.json(
        { error: "roles must be from: buyer, renter, seller, landlord" },
        { status: 400 }
      );
    }
    update.roles = roles;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: update,
  });

  await logAuditEvent(
    "update",
    "lead",
    lead.id.toString(),
    auth,
    { fields: Object.keys(update) },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: updated.id.toString(),
    status: updated.status,
  });
}

/**
 * DELETE /api/crm/clients/[id]
 * Delete a client/lead. Broker only.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // Broker only — agents cannot delete clients
  if (auth.role !== "BROKER") {
    return NextResponse.json({ error: "Only broker can delete clients" }, { status: 403 });
  }

  const { id } = await params;
  const lead = await findLead(id);

  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Delete related records first (preferences, actions, sessions)
  await prisma.leadPreferences.deleteMany({ where: { lead_id: lead.id } });
  await prisma.leadAction.deleteMany({ where: { lead_id: lead.id } });
  await prisma.session.deleteMany({ where: { user_id: lead.id, user_type: "lead" } });
  await prisma.lead.delete({ where: { id: lead.id } });

  await logAuditEvent(
    "delete",
    "lead",
    lead.id.toString(),
    auth,
    { email: lead.email },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({ success: true, deleted: lead.email });
}
