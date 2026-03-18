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
import { safeBigInt } from "@/lib/utils/safe-bigint";

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
    where: { id: safeBigInt(id) ?? BigInt(-1) },
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

  // Fetch recent activity logs
  const activityLogs = await prisma.activityLog.findMany({
    where: { lead_id: lead.id },
    orderBy: { created_at: "desc" },
    take: 10,
  }).catch(() => []);

  return NextResponse.json({
    id: lead.id.toString(),
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    phone: lead.phone,
    roles: lead.roles,
    status: lead.status,
    pipeline_stage: lead.pipeline_stage,
    portal_role: lead.portal_role,
    agent_id: lead.agent_id?.toString() ?? null,
    source: lead.source,
    notes: lead.notes,
    annual_income: lead.annual_income?.toString() ?? null,
    bonuses: lead.bonuses?.toString() ?? null,
    credit_score_range: lead.credit_score_range,
    pre_approved: lead.pre_approved,
    pre_approved_amount: lead.pre_approved_amount?.toString() ?? null,
    down_payment: lead.down_payment?.toString() ?? null,
    available_funds: lead.available_funds?.toString() ?? null,
    monthly_debt: lead.monthly_debt?.toString() ?? null,
    employer: lead.employer,
    work_title: lead.work_title,
    lease_start_date: lead.lease_start_date,
    lease_end_date: lead.lease_end_date,
    rent_per_month: lead.rent_per_month?.toString() ?? null,
    rental_deposit: lead.rental_deposit?.toString() ?? null,
    total_monthly_expense: lead.total_monthly_expense?.toString() ?? null,
    secondary_first_name: lead.secondary_first_name,
    secondary_last_name: lead.secondary_last_name,
    secondary_email: lead.secondary_email,
    secondary_phone: lead.secondary_phone,
    secondary_relationship: lead.secondary_relationship,
    property_address: lead.property_address,
    home_address: lead.home_address,
    unit_number: lead.unit_number,
    legal_ownership_name: lead.legal_ownership_name,
    created_at: lead.created_at,
    updated_at: lead.updated_at,
    activity_logs: activityLogs.map((a) => ({
      id: a.id.toString(),
      activity_type: a.activity_type,
      title: a.title,
      detail: a.detail,
      created_at: a.created_at,
    })),
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
  if (body.notes !== undefined) update.notes = body.notes ? String(body.notes) : null;
  if (body.source !== undefined) update.source = String(body.source);
  if (body.pipeline_stage !== undefined) {
    const validStages = ["new", "contacted", "nurturing", "active", "showing", "offer", "deal", "closed", "past"];
    const stage = String(body.pipeline_stage);
    if (validStages.includes(stage)) update.pipeline_stage = stage;
  }

  // Financial fields
  if (body.annual_income !== undefined) update.annual_income = body.annual_income ? parseFloat(String(body.annual_income)) : null;
  if (body.bonuses !== undefined) update.bonuses = body.bonuses ? parseFloat(String(body.bonuses)) : null;
  if (body.credit_score_range !== undefined) update.credit_score_range = body.credit_score_range ? String(body.credit_score_range) : null;
  if (body.pre_approved !== undefined) update.pre_approved = Boolean(body.pre_approved);
  if (body.pre_approved_amount !== undefined) update.pre_approved_amount = body.pre_approved_amount ? parseFloat(String(body.pre_approved_amount)) : null;
  if (body.down_payment !== undefined) update.down_payment = body.down_payment ? parseFloat(String(body.down_payment)) : null;
  if (body.available_funds !== undefined) update.available_funds = body.available_funds ? parseFloat(String(body.available_funds)) : null;
  if (body.monthly_debt !== undefined) update.monthly_debt = body.monthly_debt ? parseFloat(String(body.monthly_debt)) : null;
  if (body.employer !== undefined) update.employer = body.employer ? String(body.employer) : null;
  if (body.work_title !== undefined) update.work_title = body.work_title ? String(body.work_title) : null;
  if (body.rent_per_month !== undefined) update.rent_per_month = body.rent_per_month ? parseFloat(String(body.rent_per_month)) : null;
  if (body.rental_deposit !== undefined) update.rental_deposit = body.rental_deposit ? parseFloat(String(body.rental_deposit)) : null;
  if (body.total_monthly_expense !== undefined) update.total_monthly_expense = body.total_monthly_expense ? parseFloat(String(body.total_monthly_expense)) : null;
  if (body.lease_start_date !== undefined) update.lease_start_date = body.lease_start_date ? new Date(String(body.lease_start_date)) : null;
  if (body.lease_end_date !== undefined) update.lease_end_date = body.lease_end_date ? new Date(String(body.lease_end_date)) : null;
  // Agent reassignment (broker only)
  if (body.agent_id !== undefined) {
    if (auth.role !== "BROKER") {
      return NextResponse.json({ error: "Only broker can reassign clients" }, { status: 403 });
    }
    update.agent_id = BigInt(String(body.agent_id));
  }

  if (body.roles !== undefined) {
    const validRoles = ["buyer", "renter", "seller", "landlord", "uncategorized"];
    const roles = body.roles as string[];
    if (!roles.every((r) => validRoles.includes(r))) {
      return NextResponse.json(
        { error: "roles must be from: buyer, renter, seller, landlord, uncategorized" },
        { status: 400 }
      );
    }
    update.roles = roles;
  }

  // Secondary person fields
  if (body.secondary_first_name !== undefined) update.secondary_first_name = body.secondary_first_name ? String(body.secondary_first_name) : null;
  if (body.secondary_last_name !== undefined) update.secondary_last_name = body.secondary_last_name ? String(body.secondary_last_name) : null;
  if (body.secondary_email !== undefined) update.secondary_email = body.secondary_email ? String(body.secondary_email) : null;
  if (body.secondary_phone !== undefined) update.secondary_phone = body.secondary_phone ? String(body.secondary_phone) : null;
  if (body.secondary_relationship !== undefined) update.secondary_relationship = body.secondary_relationship ? String(body.secondary_relationship) : null;

  // Address fields
  if (body.property_address !== undefined) update.property_address = body.property_address ? String(body.property_address) : null;
  if (body.home_address !== undefined) update.home_address = body.home_address ? String(body.home_address) : null;
  if (body.unit_number !== undefined) update.unit_number = body.unit_number ? String(body.unit_number) : null;
  if (body.legal_ownership_name !== undefined) update.legal_ownership_name = body.legal_ownership_name ? String(body.legal_ownership_name) : null;

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
  await prisma.clientPreference.deleteMany({ where: { lead_id: lead.id } });
  await prisma.clientListingAction.deleteMany({ where: { lead_id: lead.id } });
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
