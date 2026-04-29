/**
 * /api/crm/active-leases/[id]
 * GET / PATCH / DELETE a single active lease record
 */

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
  const leaseId = safeBigInt(id);
  if (!leaseId) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const lease = await prisma.activeLease.findFirst({
    where: {
      id: leaseId,
      ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}),
    },
    include: {
      landlord: { select: { id: true, first_name: true, last_name: true, email: true, phone: true, entity_name: true, entity_type: true } },
      tenant: { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
      agent: { select: { id: true, first_name: true, last_name: true } },
    },
  });

  if (!lease) return NextResponse.json({ error: "Lease not found" }, { status: 404 });

  const now = new Date();
  const daysToExpiry = Math.ceil((lease.lease_end_date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return NextResponse.json({
    lease: {
      ...lease,
      id: lease.id.toString(),
      landlord_lead_id: lease.landlord_lead_id.toString(),
      tenant_lead_id: lease.tenant_lead_id?.toString() ?? null,
      agent_id: lease.agent_id?.toString() ?? null,
      monthly_rent: lease.monthly_rent.toString(),
      security_deposit: lease.security_deposit?.toString() ?? null,
      renewal_rent: lease.renewal_rent?.toString() ?? null,
      original_rent: lease.original_rent?.toString() ?? null,
      days_to_expiry: daysToExpiry,
      urgency: daysToExpiry <= 30 ? "critical" : daysToExpiry <= 60 ? "high" : daysToExpiry <= 90 ? "medium" : "low",
    },
  });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leaseId = safeBigInt(id);
  if (!leaseId) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const existing = await prisma.activeLease.findFirst({
    where: { id: leaseId, ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}) },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Lease not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  const stringFields = ["address", "unit", "borough", "neighborhood", "zip", "building_type",
    "tenant_name", "tenant_email", "tenant_phone", "lease_type", "furnished",
    "renewal_status", "notes", "board_app_status"];
  const decimalFields = ["monthly_rent", "security_deposit", "renewal_rent", "original_rent", "last_rent_increase_pct"];
  const boolFields = ["pets_allowed", "board_required", "keys_given", "walkthrough_done", "commission_paid"];
  const dateFields = ["lease_start_date", "lease_end_date", "renewal_notice_date",
    "relist_target_date", "last_rent_increase_date", "outreach_90d_sent_at",
    "outreach_60d_sent_at", "outreach_30d_sent_at", "seller_comps_6mo_sent_at",
    "seller_comps_1yr_sent_at", "board_approved_at", "move_in_date"];

  for (const f of stringFields) {
    if (body[f] !== undefined) update[f] = body[f] || null;
  }
  for (const f of decimalFields) {
    if (body[f] !== undefined) update[f] = body[f] ? Number(body[f]) : null;
  }
  for (const f of boolFields) {
    if (body[f] !== undefined) update[f] = Boolean(body[f]);
  }
  for (const f of dateFields) {
    if (body[f] !== undefined) update[f] = body[f] ? new Date(body[f] as string) : null;
  }
  if (body.custom_fields !== undefined) update.custom_fields = body.custom_fields;
  if (body.tenant_lead_id !== undefined) {
    const tenantId = body.tenant_lead_id ? safeBigInt(body.tenant_lead_id as string) : null;
    if (body.tenant_lead_id && !tenantId) {
      return NextResponse.json({ error: "Invalid tenant_lead_id" }, { status: 400 });
    }
    if (tenantId) {
      const tenantAccess = await assertLeadAccess(auth, tenantId);
      if (tenantAccess) return tenantAccess;
    }
    update.tenant_lead_id = tenantId;
  }

  const updated = await prisma.activeLease.update({ where: { id: leaseId }, data: update });

  await logAuditEvent("update", "lead", updated.landlord_lead_id.toString(), auth,
    { lease_id: leaseId.toString() },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({ lease: { ...updated, id: updated.id.toString() } });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leaseId = safeBigInt(id);
  if (!leaseId) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const existing = await prisma.activeLease.findFirst({
    where: { id: leaseId, ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}) },
    select: { id: true, landlord_lead_id: true },
  });
  if (!existing) return NextResponse.json({ error: "Lease not found" }, { status: 404 });

  await prisma.activeLease.delete({ where: { id: leaseId } });

  await logAuditEvent("delete", "lead", existing.landlord_lead_id.toString(), auth,
    { lease_id: leaseId.toString() },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({ success: true });
}
