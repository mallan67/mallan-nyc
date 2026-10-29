/**
 * POST /api/crm/active-leases/[id]/renew
 *
 * A renewal is a new term on the same tenancy, never an overwrite of the prior one
 * (Master §13: "A renewal produces new terms and a new tenancy record. It never overwrites the
 * prior tenancy."). The prior row becomes `historical` with renewal_status `renewing`; the new row
 * carries the same unit, landlord and tenant, the new term and rent, original_rent from the prior
 * term and the rent-increase fields. Idempotent on the natural key: submitting the same renewal
 * twice returns the row the first call created.
 *
 * Body: { lease_start_date, lease_end_date, monthly_rent?, lease_type?, security_deposit?, notes? }
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { findExistingTenancy, parseLeaseDate, serializeLease } from "@/lib/crm/leases";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leaseId = safeBigInt(id);
  if (!leaseId) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prior = await prisma.activeLease.findFirst({
    where: { id: leaseId, ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}) },
  });
  if (!prior) return NextResponse.json({ error: "Lease not found" }, { status: 404 });

  const start = parseLeaseDate(body.lease_start_date);
  const end = parseLeaseDate(body.lease_end_date);
  if (!start || !end) return NextResponse.json({ error: "lease_start_date and lease_end_date are required dates" }, { status: 400 });
  if (end.getTime() <= start.getTime()) return NextResponse.json({ error: "lease_end_date must be after lease_start_date" }, { status: 400 });
  if (start.getTime() < prior.lease_start_date.getTime()) {
    return NextResponse.json({ error: "A renewal starts after the prior term began" }, { status: 400 });
  }
  const rentGiven = body.monthly_rent !== undefined && body.monthly_rent !== null && body.monthly_rent !== "";
  // A renewal rent that was not supplied is carried over from the prior term and recorded as such —
  // a confirmed rent and a carried-over rent are different facts (Maya, 2026-10-28).
  const rent = rentGiven ? Number(body.monthly_rent) : Number(prior.monthly_rent);
  if (!Number.isFinite(rent) || rent <= 0) return NextResponse.json({ error: "monthly_rent must be > 0" }, { status: 400 });
  const leaseType = body.lease_type ? String(body.lease_type) : prior.lease_type;
  if (!["standard_1yr", "standard_2yr", "month_to_month", "stabilized", "commercial"].includes(leaseType)) {
    return NextResponse.json({ error: "Invalid lease_type" }, { status: 400 });
  }

  const key = { landlord_lead_id: prior.landlord_lead_id, address: prior.address, unit: prior.unit, lease_start_date: start, lease_end_date: end };
  const existing = await findExistingTenancy(key);
  if (existing) {
    // Already recorded (a retry): make sure the prior term is closed and return the term that exists.
    if (existing.id !== prior.id && (prior.status === "active" || prior.status === "pending")) {
      await prisma.activeLease.update({ where: { id: prior.id }, data: { status: "historical", renewal_status: "renewing" } });
    }
    const row = await prisma.activeLease.findUnique({ where: { id: existing.id } });
    await logAuditEvent("lease_renew_deduplicated", "active_lease", existing.id.toString(), auth,
      { prior_lease_id: prior.id.toString() }, req.headers.get("x-forwarded-for") ?? undefined);
    return NextResponse.json({ lease: row ? serializeLease(row) : { id: existing.id.toString() }, prior_lease_id: prior.id.toString(), deduplicated: true }, { status: 200 });
  }

  const priorRent = Number(prior.monthly_rent);
  const increasePct = priorRent > 0 && rent !== priorRent ? Math.round(((rent - priorRent) / priorRent) * 10000) / 100 : null;

  const [created, closed] = await prisma.$transaction([
    prisma.activeLease.create({
      data: {
        status: "active",
        address: prior.address,
        unit: prior.unit,
        borough: prior.borough,
        neighborhood: prior.neighborhood,
        zip: prior.zip,
        building_type: prior.building_type,
        landlord_lead_id: prior.landlord_lead_id,
        tenant_lead_id: prior.tenant_lead_id,
        tenant_name: prior.tenant_name,
        tenant_email: prior.tenant_email,
        tenant_phone: prior.tenant_phone,
        monthly_rent: rent,
        lease_start_date: start,
        lease_end_date: end,
        lease_type: leaseType,
        security_deposit: body.security_deposit !== undefined ? (body.security_deposit ? Number(body.security_deposit) : null) : prior.security_deposit,
        pets_allowed: prior.pets_allowed,
        furnished: prior.furnished,
        renewal_status: "unknown",
        original_rent: prior.monthly_rent,
        last_rent_increase_date: increasePct !== null ? start : prior.last_rent_increase_date,
        last_rent_increase_pct: increasePct !== null ? increasePct : prior.last_rent_increase_pct,
        board_required: prior.board_required,
        agent_id: prior.agent_id ?? auth.userId,
        notes: body.notes ? String(body.notes) : null,
        custom_fields: { renewed_from_lease_id: prior.id.toString(), rent_carried_over: !rentGiven },
      },
    }),
    prisma.activeLease.update({
      where: { id: prior.id },
      data: { status: "historical", renewal_status: "renewing", renewal_rent: rent, renewal_notice_date: new Date() },
    }),
  ]);

  await logAuditEvent("lease_renewed", "active_lease", created.id.toString(), auth,
    { prior_lease_id: prior.id.toString(), term: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }, monthly_rent: rent, rent_carried_over: !rentGiven, increase_pct: increasePct },
    req.headers.get("x-forwarded-for") ?? undefined);

  return NextResponse.json({ lease: serializeLease(created), prior: serializeLease(closed), deduplicated: false }, { status: 201 });
}
