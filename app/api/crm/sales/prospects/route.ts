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

/** Default outreach cadence steps auto-created for every new prospect */
const DEFAULT_CADENCE: {
  day_offset: number;
  type: string;
  channel: string;
  subject: string;
}[] = [
  { day_offset: 1,  type: "intro_cma",      channel: "email", subject: "Your Home's Current Market Value" },
  { day_offset: 7,  type: "neighbor_sold",   channel: "email", subject: "Recent Sale in Your Building" },
  { day_offset: 14, type: "follow_up",       channel: "email", subject: "Following Up \u2014 Market Update" },
  { day_offset: 21, type: "market_report",   channel: "email", subject: "Market Report for Your Area" },
  { day_offset: 30, type: "cost_analysis",   channel: "email", subject: "What It Actually Costs to Sell" },
  { day_offset: 60, type: "re_engage",       channel: "email", subject: "Updated Home Valuation" },
  { day_offset: 90, type: "re_engage",       channel: "email", subject: "Market Update \u2014 New Activity" },
];

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

  const body = await req.json();
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
      status: "new",
      assigned_agent_id: auth.userId,
      // Auto-create cadence steps
      cadence_steps: {
        createMany: {
          data: DEFAULT_CADENCE.map((step) => {
            const scheduled = new Date();
            scheduled.setDate(scheduled.getDate() + step.day_offset);
            return {
              day_offset: step.day_offset,
              type: step.type,
              channel: step.channel,
              subject: step.subject,
              status: "pending",
              scheduled_date: scheduled,
            };
          }),
        },
      },
      // Set next_follow_up to earliest step
      next_follow_up: new Date(Date.now() + 86400000), // tomorrow (day 1)
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

  return NextResponse.json({ prospect: serializeBigInts(prospect) }, { status: 201 });
}
