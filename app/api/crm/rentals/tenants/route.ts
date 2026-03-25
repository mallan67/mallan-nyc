// /api/crm/rentals/tenants — GET: current tenants with lease data, POST: create, PATCH: update
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeJson } from "@/lib/api/safe-json";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const where: Record<string, unknown> = {
    roles: { has: "renter" },
    pipeline_stage: "current_tenant",
  };

  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  const tenants = await prisma.lead.findMany({
    where,
    orderBy: { lease_end_date: "asc" },
    take: 200,
  });

  const enriched = tenants.map((t) => ({
    ...t,
    id: String(t.id),
    agent_id: t.agent_id ? String(t.agent_id) : null,
    name: `${t.first_name} ${t.last_name}`.trim(),
  }));

  return NextResponse.json({ tenants: enriched });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { first_name, last_name, email, phone, property_address, unit_number, lease_start_date, lease_end_date, renewal_status, notes } = body as Record<string, unknown>;

  if (!first_name || !last_name || !email) {
    return NextResponse.json({ error: "first_name, last_name, email required" }, { status: 400 });
  }

  const tenant = await prisma.lead.create({
    data: {
      first_name,
      last_name,
      email,
      phone: phone || "",
      roles: ["renter"],
      status: "active",
      pipeline_stage: "current_tenant",
      agent_id: auth.userId,
      source: "manual",
      property_address,
      unit_number,
      lease_start_date: lease_start_date ? new Date(lease_start_date) : undefined,
      lease_end_date: lease_end_date ? new Date(lease_end_date) : undefined,
      renewal_status: renewal_status || "pending",
      notes,
    },
  });

  await logAuditEvent("create_tenant", "lead", String(tenant.id), auth, { first_name, last_name });

  return NextResponse.json({
    tenant: { ...tenant, id: String(tenant.id), name: `${tenant.first_name} ${tenant.last_name}`.trim() },
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { id, ...updates } = body as Record<string, unknown>;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const existing = await prisma.lead.findFirst({
    where: { id: BigInt(id), ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}) },
  });

  if (!existing) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const allowed = [
    "first_name", "last_name", "email", "phone", "status", "pipeline_stage",
    "property_address", "unit_number",
    "lease_start_date", "lease_end_date", "renewal_status", "non_renewal_date",
    "notes", "next_follow_up", "last_contacted_at",
    "buyer_potential", "reengage_anchor_date",
    "secondary_first_name", "secondary_last_name", "secondary_email", "secondary_phone", "secondary_relationship",
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) {
      // Convert date strings to Date objects
      if (["lease_start_date", "lease_end_date", "non_renewal_date", "reengage_anchor_date", "next_follow_up", "last_contacted_at"].includes(key) && updates[key]) {
        data[key] = new Date(updates[key] as string);
      } else {
        data[key] = updates[key];
      }
    }
  }

  const updated = await prisma.lead.update({
    where: { id: BigInt(id) },
    data,
  });

  await logAuditEvent("update_tenant", "lead", String(updated.id), auth, { fields: Object.keys(data) });

  return NextResponse.json({
    tenant: { ...updated, id: String(updated.id), name: `${updated.first_name} ${updated.last_name}`.trim() },
  });
}
