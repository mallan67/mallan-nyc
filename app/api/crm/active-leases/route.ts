/**
 * /api/crm/active-leases
 *
 * GET  — list all active leases (landlord portfolio view)
 *        ?landlord_id=N  — filter by landlord
 *        ?expiring_days=90  — expiring within N days
 *        ?renewal_status=unknown  — filter by renewal status
 *
 * POST — create a new active lease record (already-leased unit)
 *
 * 2026-10-27: every response goes through lib/crm/leases serializeLease (the raw Prisma row
 * carried BigInt ids and crashed JSON.stringify after the insert — the CRM showed "Failed" and
 * the retry inserted a duplicate), and a create resolves the tenancy's natural key first: an
 * existing tenancy for the same landlord, unit and term is returned (200, deduplicated: true),
 * never inserted twice.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { assertLeadAccess } from "@/lib/crm/access";
import { findExistingTenancy, parseLeaseDate, serializeLease } from "@/lib/crm/leases";

const PARTY_SELECT = { id: true, first_name: true, last_name: true, email: true, phone: true } as const;

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const landlordId = safeBigInt(sp.get("landlord_id") ?? "");
  const rawExpiring = sp.get("expiring_days");
  const parsedExpiring = rawExpiring ? parseInt(rawExpiring) : NaN;
  const expiringDays = Number.isFinite(parsedExpiring) ? parsedExpiring : null;
  const renewalStatus = sp.get("renewal_status") ?? null;

  const where: Record<string, unknown> = {};

  // Agent sees only own leases; broker sees all
  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  if (landlordId) where.landlord_lead_id = landlordId;
  if (renewalStatus) where.renewal_status = renewalStatus;

  if (expiringDays !== null) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + expiringDays);
    where.lease_end_date = { lte: cutoff };
  }

  const leases = await prisma.activeLease.findMany({
    where,
    orderBy: { lease_end_date: "asc" },
    take: 200,
    include: { landlord: { select: PARTY_SELECT }, tenant: { select: PARTY_SELECT } },
  });

  const now = new Date();
  const serialized = leases.map((l) => serializeLease(l, now));

  return NextResponse.json({ leases: serialized, total: serialized.length });
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Required fields
  const landlordId = safeBigInt(body.landlord_lead_id as string);
  if (!landlordId) return NextResponse.json({ error: "landlord_lead_id is required" }, { status: 400 });
  if (!body.address) return NextResponse.json({ error: "address is required" }, { status: 400 });
  if (!body.monthly_rent || Number(body.monthly_rent) <= 0) return NextResponse.json({ error: "monthly_rent is required" }, { status: 400 });
  if (!body.lease_start_date) return NextResponse.json({ error: "lease_start_date is required" }, { status: 400 });
  if (!body.lease_end_date) return NextResponse.json({ error: "lease_end_date is required" }, { status: 400 });
  const leaseStart = parseLeaseDate(body.lease_start_date);
  const leaseEnd = parseLeaseDate(body.lease_end_date);
  if (!leaseStart || !leaseEnd) return NextResponse.json({ error: "lease_start_date and lease_end_date must be dates" }, { status: 400 });
  if (leaseEnd.getTime() <= leaseStart.getTime()) return NextResponse.json({ error: "lease_end_date must be after lease_start_date" }, { status: 400 });

  // Verify landlord belongs to this agent
  const landlord = await prisma.lead.findFirst({
    where: {
      id: landlordId,
      ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}),
    },
    select: { id: true },
  });
  if (!landlord) return NextResponse.json({ error: "Landlord not found" }, { status: 404 });

  const tenantId = body.tenant_lead_id ? safeBigInt(body.tenant_lead_id as string) : null;
  if (tenantId) {
    const tenantAccess = await assertLeadAccess(auth, tenantId);
    if (tenantAccess) return tenantAccess;
  }

  // Idempotency: the same landlord, unit and term is one tenancy, however many times it is submitted
  const existing = await findExistingTenancy({
    landlord_lead_id: landlordId,
    address: body.address as string,
    unit: (body.unit as string) || null,
    lease_start_date: leaseStart,
    lease_end_date: leaseEnd,
  });
  if (existing) {
    const row = await prisma.activeLease.findUnique({
      where: { id: existing.id },
      include: { landlord: { select: PARTY_SELECT }, tenant: { select: PARTY_SELECT } },
    });
    await logAuditEvent("lease_create_deduplicated", "active_lease", existing.id.toString(), auth,
      { address: body.address, unit: (body.unit as string) || null, landlord_id: landlordId.toString() },
      req.headers.get("x-forwarded-for") ?? undefined
    );
    return NextResponse.json({ lease: row ? serializeLease(row) : { id: existing.id.toString() }, deduplicated: true }, { status: 200 });
  }

  const lease = await prisma.activeLease.create({
    data: {
      address: String(body.address).trim(),
      unit: (body.unit as string) || null,
      borough: (body.borough as string) || null,
      neighborhood: (body.neighborhood as string) || null,
      zip: (body.zip as string) || null,
      building_type: (body.building_type as string) || null,
      landlord_lead_id: landlordId,
      tenant_lead_id: tenantId,
      tenant_name: (body.tenant_name as string) || null,
      tenant_email: (body.tenant_email as string) || null,
      tenant_phone: (body.tenant_phone as string) || null,
      monthly_rent: Number(body.monthly_rent),
      lease_start_date: leaseStart,
      lease_end_date: leaseEnd,
      lease_type: (body.lease_type as string) || "standard_1yr",
      security_deposit: body.security_deposit ? Number(body.security_deposit) : null,
      pets_allowed: Boolean(body.pets_allowed),
      furnished: (body.furnished as string) || "unfurnished",
      renewal_status: (body.renewal_status as string) || "unknown",
      original_rent: body.monthly_rent ? Number(body.monthly_rent) : null,
      board_required: Boolean(body.board_required),
      agent_id: auth.userId,
      notes: (body.notes as string) || null,
      custom_fields: (body.custom_fields as object) || null,
    },
    include: { landlord: { select: PARTY_SELECT }, tenant: { select: PARTY_SELECT } },
  });

  await logAuditEvent("create", "lead", landlordId.toString(), auth,
    { lease_id: lease.id.toString(), address: body.address },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({ lease: serializeLease(lease), deduplicated: false }, { status: 201 });
}
