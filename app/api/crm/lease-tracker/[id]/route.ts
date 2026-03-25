/**
 * PATCH /api/crm/lease-tracker/[id]
 *
 * Update an ActiveLease record's editable fields:
 *   monthly_rent, lease_start_date, lease_end_date, lease_type,
 *   renewal_status, tenant_name, tenant_email, tenant_phone,
 *   security_deposit, building_type, neighborhood
 *
 * Tenant financial fields (annual_income, credit_score_range) are on the Lead
 * model — use PATCH /api/crm/clients/[tenantId] for those.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { serializeBigInts } from "@/lib/api/serialize";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leaseId = safeBigInt(id);
  if (!leaseId) {
    return NextResponse.json({ error: "Invalid lease ID" }, { status: 400 });
  }

  const lease = await prisma.activeLease.findUnique({
    where: { id: leaseId },
    select: { id: true, agent_id: true },
  });

  if (!lease) {
    return NextResponse.json({ error: "Lease not found" }, { status: 404 });
  }

  // Agent scoping: agents can only edit their own leases
  if (auth.role !== "BROKER" && lease.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  // Lease terms
  if (body.monthly_rent !== undefined) {
    const rent = parseFloat(String(body.monthly_rent));
    if (isNaN(rent) || rent <= 0) {
      return NextResponse.json({ error: "monthly_rent must be > 0" }, { status: 400 });
    }
    update.monthly_rent = rent;
  }

  if (body.lease_start_date !== undefined) {
    const d = new Date(String(body.lease_start_date));
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid lease_start_date" }, { status: 400 });
    }
    update.lease_start_date = d;
  }

  if (body.lease_end_date !== undefined) {
    const d = new Date(String(body.lease_end_date));
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid lease_end_date" }, { status: 400 });
    }
    update.lease_end_date = d;
  }

  if (body.lease_type !== undefined) {
    const valid = ["standard_1yr", "standard_2yr", "month_to_month", "stabilized", "commercial"];
    const lt = String(body.lease_type);
    if (!valid.includes(lt)) {
      return NextResponse.json({ error: `Invalid lease_type. Must be: ${valid.join(", ")}` }, { status: 400 });
    }
    update.lease_type = lt;
  }

  if (body.renewal_status !== undefined) {
    const valid = ["unknown", "renewing", "not_renewing", "pending_decision"];
    const rs = String(body.renewal_status);
    if (!valid.includes(rs)) {
      return NextResponse.json({ error: `Invalid renewal_status. Must be: ${valid.join(", ")}` }, { status: 400 });
    }
    update.renewal_status = rs;
  }

  if (body.security_deposit !== undefined) {
    update.security_deposit = body.security_deposit ? parseFloat(String(body.security_deposit)) : null;
  }

  // Inline tenant fields (for tenants not linked to a Lead record)
  if (body.tenant_name !== undefined) update.tenant_name = body.tenant_name ? String(body.tenant_name) : null;
  if (body.tenant_email !== undefined) update.tenant_email = body.tenant_email ? String(body.tenant_email) : null;
  if (body.tenant_phone !== undefined) update.tenant_phone = body.tenant_phone ? String(body.tenant_phone) : null;

  // Property details
  if (body.building_type !== undefined) update.building_type = body.building_type ? String(body.building_type) : null;
  if (body.neighborhood !== undefined) update.neighborhood = body.neighborhood ? String(body.neighborhood) : null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.activeLease.update({
    where: { id: leaseId },
    data: update,
  });

  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  await logAuditEvent("update_lease", "active_lease", leaseId.toString(), auth, {
    fields: Object.keys(update),
  }, ip);

  return NextResponse.json(serializeBigInts({ success: true, lease: updated }));
}
