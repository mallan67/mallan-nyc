// GET /api/crm/protected-periods/[id] — detail
// PATCH /api/crm/protected-periods/[id] — update (notice upload, status)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";

function serialize(p: Awaited<ReturnType<typeof prisma.protectedPeriod.findUnique>> & { protected_buyers?: unknown[] }) {
  if (!p) return null;
  return {
    ...p,
    id: (p.id as bigint).toString(),
    listing_id: (p.listing_id as bigint).toString(),
    agent_id: (p.agent_id as bigint).toString(),
    notice_document_id: p.notice_document_id?.toString() ?? null,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const period = await prisma.protectedPeriod.findUnique({
    where: { id: BigInt(id) },
    include: {
      protected_buyers: true,
      listing: {
        select: { listing_id: true, address: true, listing_type: true, list_price: true },
      },
      agent: {
        select: { id: true, full_name: true, email: true },
      },
    },
  });

  if (!period) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Access control: agent sees only their own
  if (auth.role !== "BROKER" && period.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return NextResponse.json({
    ...serialize(period),
    agent: { ...period.agent, id: period.agent.id.toString() },
    listing: period.listing,
    protected_buyers: period.protected_buyers.map((b) => ({
      ...b,
      id: b.id.toString(),
      protected_period_id: b.protected_period_id.toString(),
      deal_price: b.deal_price?.toString() ?? null,
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const period = await prisma.protectedPeriod.findUnique({
    where: { id: BigInt(id) },
  });
  if (!period) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (auth.role !== "BROKER" && period.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: {
    notice_document_id?: number;
    status?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  // Notice upload
  if (body.notice_document_id !== undefined) {
    data.notice_document_id = BigInt(body.notice_document_id);
    data.notice_uploaded_at = new Date();
  }

  // Status change (broker only for manual overrides)
  if (body.status && auth.role === "BROKER") {
    const validStatuses = ["pending_names", "active", "expired", "converted", "missed_deadline"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }

  const updated = await prisma.protectedPeriod.update({
    where: { id: BigInt(id) },
    data,
  });

  await logAuditEvent(
    "update",
    "protected_period",
    id,
    auth,
    { changes: body }
  );

  return NextResponse.json(serialize(updated));
}
