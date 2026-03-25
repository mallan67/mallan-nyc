/**
 * /api/crm/sales/prospects — GET: list, POST: create seller prospects
 *
 * Seller prospects are pre-pipeline records enriched with NYC public data
 * (ACRIS, DOB, DOF, PLUTO) before conversion to active seller clients.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { serializeBigInts } from "@/lib/api/serialize";
import { safeJson } from "@/lib/api/safe-json";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? null;
  const source = sp.get("source") ?? null;
  const search = sp.get("search") ?? null;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50", 10) || 50));
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Record<string, unknown> = {};

  // Agent sees only own; broker sees all
  if (auth.role !== "BROKER") {
    where.assigned_agent_id = auth.userId;
  }

  // Status filter — exclude converted by default unless explicitly requested
  if (status) {
    where.status = status;
  } else {
    where.converted_at = null;
  }

  if (source) {
    where.source = source;
  }

  // Search: address OR owner_name OR owner_email (case-insensitive)
  if (search) {
    const term = search.trim();
    where.OR = [
      { address: { contains: term, mode: "insensitive" } },
      { owner_name: { contains: term, mode: "insensitive" } },
      { owner_email: { contains: term, mode: "insensitive" } },
    ];
  }

  const [prospects, total] = await Promise.all([
    prisma.sellerLead.findMany({
      where,
      orderBy: { updated_at: "desc" },
      skip,
      take: limit,
      include: {
        cadence_steps: {
          where: { status: "pending" },
          orderBy: { day_offset: "asc" },
          take: 1,
        },
      },
    }),
    prisma.sellerLead.count({ where }),
  ]);

  return NextResponse.json({
    prospects: serializeBigInts(prospects),
    total,
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const {
    address,
    unit,
    borough,
    bbl,
    owner_name,
    owner_email,
    owner_phone,
    source,
    source_detail,
    entity_type,
    entity_name,
    secondary_name,
    secondary_email,
    secondary_phone,
    secondary_relationship,
    authorized_signatories,
  } = body;

  if (!address || typeof address !== "string" || !address.trim()) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  // Check for duplicate (same address + unit for this agent)
  const existing = await prisma.sellerLead.findFirst({
    where: {
      address: address.trim(),
      unit: unit?.trim() || "",
      assigned_agent_id: auth.userId,
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "A prospect with this address already exists", existing_id: String(existing.id) },
      { status: 409 },
    );
  }

  const prospect = await prisma.sellerLead.create({
    data: {
      address: address.trim(),
      unit: unit?.trim() || "",
      borough: borough || null,
      bbl: bbl || null,
      owner_name: owner_name || null,
      owner_email: owner_email || null,
      owner_phone: owner_phone || null,
      source: source || "manual",
      source_detail: source_detail || null,
      entity_type: entity_type || null,
      entity_name: entity_name || null,
      secondary_name: secondary_name || null,
      secondary_email: secondary_email || null,
      secondary_phone: secondary_phone || null,
      secondary_relationship: secondary_relationship || null,
      authorized_signatories: authorized_signatories || null,
      status: "new",
      assigned_agent_id: auth.userId,
      // Cadence steps are added manually by the agent via the Outreach tab.
      // No default cadence auto-created — agents decide their own outreach strategy.
    },
    include: {
      cadence_steps: { orderBy: { day_offset: "asc" } },
    },
  });

  await logAuditEvent(
    "seller_prospect_created",
    "seller_lead",
    String(prospect.id),
    auth,
    { address: prospect.address, source: prospect.source },
  );

  // Auto-trigger research in background (non-blocking)
  // The research endpoint handles PLUTO + ACRIS + DOF + DOB
  if (prospect.address && prospect.borough) {
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/crm/sales/prospects/${prospect.id}/research`, {
      method: "POST",
      headers: { cookie: req.headers.get("cookie") || "" },
    }).catch(() => {/* non-blocking */});
  }

  return NextResponse.json({ prospect: serializeBigInts(prospect) }, { status: 201 });
}
