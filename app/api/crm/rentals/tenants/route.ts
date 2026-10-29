// /api/crm/rentals/tenants — GET: current tenants with lease data, POST: create, PATCH: update
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeJson } from "@/lib/api/safe-json";
import { serializeBigInts } from "@/lib/api/serialize";
import { scanTextForFairHousing } from "@/lib/compliance/rls-enforcement";

/**
 * GET — current tenants. 2026-10-27: derived from the canonical tenancy (ActiveLease, status active
 * or pending, with a linked tenant client) — the Rentals CRM list used to read `Lead.pipeline_stage =
 * current_tenant`, which nothing sets when a lease is recorded, so it showed "No current tenants"
 * while the Lease Tracker held the signed leases. Lease facts (unit, rent, term, renewal status) come
 * from the tenancy. Leads still carrying the legacy `current_tenant` stage without a tenancy are
 * appended (source: "lead") so nothing disappears.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const agentScope = auth.role !== "BROKER" ? { agent_id: auth.userId } : {};
  // Latest term first, so a tenant with several rows (a renewal, or retry duplicates of an old term)
  // is shown with the current term.
  const leases = await prisma.activeLease.findMany({
    where: { status: { in: ["active", "pending"] }, tenant_lead_id: { not: null }, ...agentScope },
    include: { tenant: true },
    orderBy: [{ lease_end_date: "desc" }, { id: "desc" }],
    take: 500,
  });

  const seen = new Set<string>();
  const tenants: Record<string, unknown>[] = [];
  for (const l of leases) {
    if (!l.tenant) continue;
    const id = String(l.tenant.id);
    if (seen.has(id)) continue;
    seen.add(id);
    tenants.push({
      ...serializeBigInts(l.tenant),
      id,
      agent_id: l.tenant.agent_id ? String(l.tenant.agent_id) : null,
      name: `${l.tenant.first_name} ${l.tenant.last_name}`.trim(),
      source: "tenancy",
      lease_id: String(l.id),
      property_address: l.address,
      unit_number: l.unit ?? null,
      rent_per_month: l.monthly_rent == null ? null : Number(l.monthly_rent),
      lease_start_date: l.lease_start_date,
      lease_end_date: l.lease_end_date,
      renewal_status: l.renewal_status,
      lease_status: l.status,
    });
  }

  const legacy = await prisma.lead.findMany({
    where: { roles: { has: "renter" }, pipeline_stage: "current_tenant", ...agentScope },
    orderBy: { lease_end_date: "asc" },
    take: 200,
  });
  for (const t of legacy) {
    const id = String(t.id);
    if (seen.has(id)) continue;
    seen.add(id);
    tenants.push({
      ...serializeBigInts(t),
      id,
      agent_id: t.agent_id ? String(t.agent_id) : null,
      name: `${t.first_name} ${t.last_name}`.trim(),
      source: "lead",
      lease_id: null,
    });
  }

  return NextResponse.json({
    tenants,
    from_tenancies: tenants.filter((t) => t.source === "tenancy").length,
    legacy_only: tenants.filter((t) => t.source === "lead").length,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { first_name, last_name, email, phone, property_address, unit_number, lease_start_date, lease_end_date, renewal_status, notes } = body;

  if (!first_name || !last_name || !email) {
    return NextResponse.json({ error: "first_name, last_name, email required" }, { status: 400 });
  }

  const fhViolations = scanTextForFairHousing(notes, "notes");
  if (fhViolations.length > 0) {
    return NextResponse.json(
      { error: "Fair Housing violation in notes", violations: fhViolations },
      { status: 422 }
    );
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
  const { id, ...updates } = body;

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

  if (typeof data.notes === "string") {
    const fhViolations = scanTextForFairHousing(data.notes, "notes");
    if (fhViolations.length > 0) {
      return NextResponse.json(
        { error: "Fair Housing violation in notes", violations: fhViolations },
        { status: 422 }
      );
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
