/**
 * /api/crm/leads/[id]/parties
 *
 * GET  — list all parties on this lead
 * POST — add a party
 * PUT  — update a party (?party_id=N)
 * DELETE — remove a party (?party_id=N)
 *
 * Applies to all client types: buyers, sellers, renters, landlords, investors.
 * Parties include: co-buyers, spouses, partners, guarantors, trustees,
 * LLC/Trust/Corp members, family members, authorized signatories, observers.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";

type RouteParams = { params: Promise<{ id: string }> };

// Valid party roles
const VALID_ROLES = [
  "co_buyer", "co_renter", "co_seller", "co_owner",
  "spouse", "partner", "parent", "child", "family_member",
  "guarantor", "co_signer", "authorized_signatory",
  "trustee", "managing_member", "llc_member", "corporate_officer",
  "observer",
] as const;

// Valid entity types
const VALID_ENTITY_TYPES = ["llc", "trust", "corp", "inc", "lp", "lllp"] as const;

// Valid signing capacities
const VALID_SIGNING_CAPACITIES = [
  "individually", "as_trustee", "as_managing_member",
  "as_authorized_signatory", "as_guarantor", "as_corporate_officer",
] as const;

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = safeBigInt(id);
  if (!leadId) return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });

  // Verify agent access to this lead
  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}),
    },
    select: { id: true, first_name: true, last_name: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const parties = await prisma.leadParty.findMany({
    where: { lead_id: leadId },
    orderBy: { created_at: "asc" },
  });

  return NextResponse.json({
    parties: parties.map(p => ({
      ...p,
      id: p.id.toString(),
      lead_id: p.lead_id.toString(),
    })),
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = safeBigInt(id);
  if (!leadId) return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });

  // Verify agent access
  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}),
    },
    select: { id: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const firstName = (body.first_name as string)?.trim();
  const lastName = (body.last_name as string)?.trim();
  const role = body.role as string;

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "first_name and last_name are required" }, { status: 400 });
  }
  if (!role || !VALID_ROLES.includes(role as any)) {
    return NextResponse.json({
      error: `role must be one of: ${VALID_ROLES.join(", ")}`,
    }, { status: 400 });
  }

  // Validate entity type if this is an entity purchase
  const isEntity = Boolean(body.is_entity);
  const entityType = body.entity_type as string | undefined;
  if (isEntity && entityType && !VALID_ENTITY_TYPES.includes(entityType as any)) {
    return NextResponse.json({
      error: `entity_type must be one of: ${VALID_ENTITY_TYPES.join(", ")}`,
    }, { status: 400 });
  }

  const signingCapacity = body.signing_capacity as string | undefined;
  if (signingCapacity && !VALID_SIGNING_CAPACITIES.includes(signingCapacity as any)) {
    return NextResponse.json({
      error: `signing_capacity must be one of: ${VALID_SIGNING_CAPACITIES.join(", ")}`,
    }, { status: 400 });
  }

  const party = await prisma.leadParty.create({
    data: {
      lead_id: leadId,
      first_name: firstName,
      last_name: lastName,
      email: (body.email as string) || null,
      phone: (body.phone as string) || null,
      address: (body.address as string) || null,
      role,
      signs_documents: Boolean(body.signs_documents),
      signing_capacity: signingCapacity || null,
      appears_on_deed: Boolean(body.appears_on_deed),
      appears_on_lease: Boolean(body.appears_on_lease),
      appears_on_board: Boolean(body.appears_on_board),
      is_entity: isEntity,
      entity_type: isEntity ? (entityType || null) : null,
      entity_name: isEntity ? ((body.entity_name as string) || null) : null,
      entity_ein: isEntity ? ((body.entity_ein as string) || null) : null,
      entity_state: isEntity ? ((body.entity_state as string) || null) : null,
      annual_income: body.annual_income ? Number(body.annual_income) : null,
      credit_score_range: (body.credit_score_range as string) || null,
      employer: (body.employer as string) || null,
      work_title: (body.work_title as string) || null,
      has_portal_access: Boolean(body.has_portal_access),
      portal_email: (body.portal_email as string) || null,
      notes: (body.notes as string) || null,
    },
  });

  await logAuditEvent("create", "lead", leadId.toString(), auth,
    { party_id: party.id.toString(), role, name: `${firstName} ${lastName}` },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    party: { ...party, id: party.id.toString(), lead_id: party.lead_id.toString() },
  }, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = safeBigInt(id);
  const partyId = safeBigInt(req.nextUrl.searchParams.get("party_id") ?? "");
  if (!leadId || !partyId) {
    return NextResponse.json({ error: "Invalid lead_id or party_id" }, { status: 400 });
  }

  // Verify ownership
  const existing = await prisma.leadParty.findFirst({
    where: { id: partyId, lead_id: leadId },
  });
  if (!existing) return NextResponse.json({ error: "Party not found" }, { status: 404 });

  // Verify agent access to lead
  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}),
    },
    select: { id: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Build update object from provided fields only
  const update: Record<string, unknown> = {};
  const fields = [
    "first_name", "last_name", "email", "phone", "address", "role",
    "signs_documents", "signing_capacity", "appears_on_deed", "appears_on_lease",
    "appears_on_board", "is_entity", "entity_type", "entity_name", "entity_ein",
    "entity_state", "annual_income", "credit_score_range", "employer", "work_title",
    "has_portal_access", "portal_email", "notes",
  ];
  for (const field of fields) {
    if (body[field] !== undefined) {
      if (field === "annual_income") {
        update[field] = body[field] ? Number(body[field]) : null;
      } else if (["signs_documents", "appears_on_deed", "appears_on_lease", "appears_on_board", "is_entity", "has_portal_access"].includes(field)) {
        update[field] = Boolean(body[field]);
      } else {
        update[field] = body[field] || null;
      }
    }
  }

  const updated = await prisma.leadParty.update({
    where: { id: partyId },
    data: update,
  });

  await logAuditEvent("update", "lead", leadId.toString(), auth,
    { party_id: partyId.toString() },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    party: { ...updated, id: updated.id.toString(), lead_id: updated.lead_id.toString() },
  });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = safeBigInt(id);
  const partyId = safeBigInt(req.nextUrl.searchParams.get("party_id") ?? "");
  if (!leadId || !partyId) {
    return NextResponse.json({ error: "Invalid lead_id or party_id" }, { status: 400 });
  }

  const existing = await prisma.leadParty.findFirst({
    where: { id: partyId, lead_id: leadId },
  });
  if (!existing) return NextResponse.json({ error: "Party not found" }, { status: 404 });

  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}),
    },
    select: { id: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  await prisma.leadParty.delete({ where: { id: partyId } });

  await logAuditEvent("delete", "lead", leadId.toString(), auth,
    { party_id: partyId.toString(), role: existing.role },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({ success: true });
}
