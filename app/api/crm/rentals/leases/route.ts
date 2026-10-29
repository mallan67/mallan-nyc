/**
 * POST /api/crm/rentals/leases
 * Creates an ActiveLease record linking landlord + tenant + property + lease terms.
 *
 * 2026-10-27: idempotent on the tenancy's natural key (landlord + unit + term): the Lease Tracker's
 * "Add Lease" and the client's "Add to Lease Tracker" can be clicked or retried without inserting a
 * second identical tenancy; the existing one comes back with deduplicated: true.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { serializeBigInts } from "@/lib/api/serialize";
import { assertLeadAccess } from "@/lib/crm/access";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { findExistingTenancy, parseLeaseDate, serializeLease } from "@/lib/crm/leases";

export async function POST(req: NextRequest) {
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    address,
    unit,
    borough,
    zip,
    monthly_rent,
    lease_start_date,
    lease_end_date,
    landlord_lead_id,
    tenant_lead_id,
    tenant_name,
    tenant_email,
    tenant_phone,
    lease_type,
  } = body as Record<string, string | number | undefined>;

  // Validate required fields
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }
  if (!monthly_rent || Number(monthly_rent) <= 0) {
    return NextResponse.json({ error: "monthly_rent must be > 0" }, { status: 400 });
  }
  if (!lease_start_date || !lease_end_date) {
    return NextResponse.json({ error: "lease_start_date and lease_end_date required" }, { status: 400 });
  }
  const start = parseLeaseDate(lease_start_date);
  const end = parseLeaseDate(lease_end_date);
  if (!start || !end) {
    return NextResponse.json({ error: "lease_start_date and lease_end_date must be dates" }, { status: 400 });
  }
  if (end.getTime() <= start.getTime()) {
    return NextResponse.json({ error: "lease_end_date must be after lease_start_date" }, { status: 400 });
  }
  if (!landlord_lead_id) {
    return NextResponse.json({ error: "landlord_lead_id is required" }, { status: 400 });
  }

  // Verify landlord exists
  const landlordId = safeBigInt(String(landlord_lead_id));
  if (!landlordId) {
    return NextResponse.json({ error: "Invalid landlord_lead_id" }, { status: 400 });
  }
  const landlord = await prisma.lead.findUnique({
    where: { id: landlordId },
    select: { id: true, first_name: true, last_name: true },
  });
  if (!landlord) {
    return NextResponse.json({ error: "Landlord not found" }, { status: 404 });
  }
  const landlordAccess = await assertLeadAccess(auth, landlordId);
  if (landlordAccess) return landlordAccess;

  // Verify tenant exists (if provided as lead ID)
  let tenantId: bigint | null = null;
  if (tenant_lead_id) {
    tenantId = safeBigInt(String(tenant_lead_id));
    if (!tenantId) {
      return NextResponse.json({ error: "Invalid tenant_lead_id" }, { status: 400 });
    }
    const tenant = await prisma.lead.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    const tenantAccess = await assertLeadAccess(auth, tenantId);
    if (tenantAccess) return tenantAccess;
  }

  const validTypes = ["standard_1yr", "standard_2yr", "month_to_month", "stabilized", "commercial"];
  const leaseType = lease_type ? String(lease_type) : "standard_1yr";
  if (!validTypes.includes(leaseType)) {
    return NextResponse.json({ error: `Invalid lease_type. Must be: ${validTypes.join(", ")}` }, { status: 400 });
  }

  // Idempotency: one tenancy per landlord, unit and term
  const existing = await findExistingTenancy({
    landlord_lead_id: landlordId,
    address: String(address),
    unit: unit ? String(unit) : null,
    lease_start_date: start,
    lease_end_date: end,
  });
  if (existing) {
    const row = await prisma.activeLease.findUnique({ where: { id: existing.id } });
    await logAuditEvent("lease_create_deduplicated", "active_lease", existing.id.toString(), auth,
      { address: String(address), unit: unit ? String(unit) : null, landlord_id: landlordId.toString() },
      req.headers.get("x-forwarded-for") ?? undefined);
    return NextResponse.json({ lease: row ? serializeLease(row) : { id: existing.id.toString() }, deduplicated: true }, { status: 200 });
  }

  const lease = await prisma.activeLease.create({
    data: {
      address: String(address).trim(),
      unit: unit ? String(unit).trim() : null,
      borough: borough ? String(borough) : null,
      zip: zip ? String(zip) : null,
      monthly_rent: Number(monthly_rent),
      original_rent: Number(monthly_rent),
      lease_start_date: start,
      lease_end_date: end,
      lease_type: leaseType,
      landlord_lead_id: landlordId,
      tenant_lead_id: tenantId,
      tenant_name: tenant_name ? String(tenant_name) : null,
      tenant_email: tenant_email ? String(tenant_email) : null,
      tenant_phone: tenant_phone ? String(tenant_phone) : null,
      status: "active",
      agent_id: auth.userId,
    },
  });

  await logAuditEvent(
    "lease_created",
    "active_lease",
    String(lease.id),
    auth,
    {
      address: lease.address,
      unit: lease.unit,
      landlord_id: String(landlordId),
      tenant_id: tenantId ? String(tenantId) : null,
      monthly_rent: Number(monthly_rent),
      lease_start: String(lease_start_date),
      lease_end: String(lease_end_date),
    },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return NextResponse.json(
    { lease: serializeLease(lease), deduplicated: false },
    { status: 201 },
  );
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const where: Record<string, unknown> = { status: "active" };
  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  const leases = await prisma.activeLease.findMany({
    where,
    include: {
      landlord: { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
      tenant: { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
    },
    orderBy: { lease_end_date: "asc" },
    take: 200,
  });

  return NextResponse.json({ leases: serializeBigInts(leases) });
}
