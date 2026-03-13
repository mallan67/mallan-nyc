// /api/crm/seller-leads
// GET: List seller leads with filtering/pagination. POST: Create a new seller lead.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const grade = searchParams.get("grade");
  const minScore = parseInt(searchParams.get("min_score") || "0");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");
  const sort = searchParams.get("sort") || "readiness_score";
  const order = searchParams.get("order") === "asc" ? "asc" as const : "desc" as const;

  const where: Record<string, unknown> = {};

  // Ownership: agent sees only assigned, broker sees all
  if (auth.role !== "BROKER") {
    where.assigned_agent_id = auth.userId;
  }

  if (status) where.status = status;
  if (grade) where.score_grade = grade;
  if (minScore > 0) where.readiness_score = { gte: minScore };

  const orderBy: Record<string, string> = {};
  const allowedSorts = ["readiness_score", "created_at", "updated_at", "status"];
  orderBy[allowedSorts.includes(sort) ? sort : "readiness_score"] = order;

  const [leads, total] = await Promise.all([
    prisma.sellerLead.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      include: {
        assigned_agent: {
          select: { id: true, full_name: true, email: true },
        },
        _count: {
          select: { signals: true, outreach_events: true },
        },
      },
    }),
    prisma.sellerLead.count({ where }),
  ]);

  const serialized = leads.map((l) => ({
    ...l,
    id: l.id.toString(),
    assigned_agent_id: l.assigned_agent_id?.toString() ?? null,
    assigned_agent: l.assigned_agent
      ? { ...l.assigned_agent, id: l.assigned_agent.id.toString() }
      : null,
  }));

  return NextResponse.json({ ok: true, total, items: serialized });
}

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const address = body.address as string | undefined;
  const unit = body.unit as string | undefined;
  const borough = body.borough as string | undefined;
  const neighborhood = body.neighborhood as string | undefined;
  const postal_code = body.postal_code as string | undefined;
  const bbl = body.bbl as string | undefined;
  const bin = body.bin as string | undefined;
  const owner_name = body.owner_name as string | undefined;
  const owner_email = body.owner_email as string | undefined;
  const owner_phone = body.owner_phone as string | undefined;
  const notes = body.notes as string | undefined;

  if (!address || typeof address !== "string" || address.trim().length < 3) {
    return NextResponse.json({ ok: false, error: "address is required (min 3 chars)" }, { status: 400 });
  }

  // Check for duplicate
  const existing = await prisma.sellerLead.findUnique({
    where: { address_unit: { address: address.trim(), unit: unit?.trim() || '' } },
  });

  if (existing) {
    return NextResponse.json(
      { ok: false, error: "A seller lead already exists for this address/unit" },
      { status: 409 }
    );
  }

  const lead = await prisma.sellerLead.create({
    data: {
      address: address.trim(),
      unit: unit?.trim() || undefined,
      borough: borough?.trim() || undefined,
      neighborhood: neighborhood?.trim() || undefined,
      postal_code: postal_code?.trim() || undefined,
      bbl: bbl?.trim() || undefined,
      bin: bin?.trim() || undefined,
      owner_name: owner_name?.trim() || undefined,
      owner_email: owner_email?.trim() || undefined,
      owner_phone: owner_phone?.trim() || undefined,
      notes: notes?.trim() || undefined,
      assigned_agent_id: auth.role === "BROKER" ? undefined : auth.userId,
    },
  });

  await logAuditEvent("create", "seller_lead", lead.id.toString(), auth);

  return NextResponse.json({
    ok: true,
    item: { ...lead, id: lead.id.toString(), assigned_agent_id: lead.assigned_agent_id?.toString() ?? null },
  }, { status: 201 });
}
