// PUT /api/crm/clients/[id]/preferences
// Save or replace client preferences (upsert).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAuth,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = safeBigInt(id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid client ID" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Agents/brokers can update their clients' preferences; clients can update their own
  if (auth.userType === "agent") {
    if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  } else if (auth.userType === "lead") {
    if (auth.userId !== leadId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = {
    property_types: (body.property_types as string[]) ?? [],
    neighborhoods: (body.neighborhoods as string[]) ?? [],
    boroughs: (body.boroughs as string[]) ?? [],
    min_beds: body.min_beds != null ? Number(body.min_beds) : null,
    max_beds: body.max_beds != null ? Number(body.max_beds) : null,
    min_baths: body.min_baths != null ? Number(body.min_baths) : null,
    min_price: body.min_price != null ? Number(body.min_price) : null,
    max_price: body.max_price != null ? Number(body.max_price) : null,
    min_sqft: body.min_sqft != null ? Number(body.min_sqft) : null,
    must_haves: (body.must_haves as string[]) ?? [],
    deal_breakers: (body.deal_breakers as string[]) ?? [],
    notes: (body.notes as string) ?? null,
  };

  const pref = await prisma.clientPreference.upsert({
    where: { lead_id: leadId },
    create: { lead_id: leadId, ...data },
    update: data,
  });

  await logAuditEvent(
    "update",
    "lead",
    id,
    auth,
    { action: "preferences_update" },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: pref.id.toString(),
    lead_id: pref.lead_id.toString(),
    property_types: pref.property_types,
    neighborhoods: pref.neighborhoods,
    boroughs: pref.boroughs,
    min_beds: pref.min_beds,
    max_beds: pref.max_beds,
    min_baths: pref.min_baths,
    min_price: pref.min_price?.toString() ?? null,
    max_price: pref.max_price?.toString() ?? null,
    min_sqft: pref.min_sqft,
    must_haves: pref.must_haves,
    deal_breakers: pref.deal_breakers,
    notes: pref.notes,
  });
}
