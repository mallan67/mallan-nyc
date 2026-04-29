/**
 * POST /api/crm/rentals/leases
 * Creates an ActiveLease record linking landlord + tenant + property + lease terms.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { serializeBigInts } from "@/lib/api/serialize";
import { assertLeadAccess } from "@/lib/crm/access";

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
  if (!landlord_lead_id) {
    return NextResponse.json({ error: "landlord_lead_id is required" }, { status: 400 });
  }

  // Verify landlord exists
  const landlordId = BigInt(String(landlord_lead_id));
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
    tenantId = BigInt(String(tenant_lead_id));
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

  const lease = await prisma.activeLease.create({
    data: {
      address: String(address).trim(),
      unit: unit ? String(unit).trim() : null,
      borough: borough ? String(borough) : null,
      zip: zip ? String(zip) : null,
      monthly_rent: Number(monthly_rent),
      lease_start_date: new Date(String(lease_start_date)),
      lease_end_date: new Date(String(lease_end_date)),
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
    { lease: serializeBigInts(lease) },
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
