// PATCH /api/crm/deals/[id]/status
// Deal status transitions. Approve/reject requires broker role.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

// Deal status state machine
const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted"],
  submitted: ["approved", "rejected"],
  approved: ["closed"],
  rejected: ["submitted"], // Agent can re-submit after fixing
  closed: [], // Terminal
};

// Statuses that require broker role
const BROKER_ONLY_STATUSES = ["approved", "rejected"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const numericId = parseInt(id);

  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
  }

  const deal = await prisma.deal.findUnique({
    where: { id: BigInt(numericId) },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && deal.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: { status: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const newStatus = body.status;
  if (!newStatus) {
    return NextResponse.json(
      { error: "Missing 'status' field" },
      { status: 400 }
    );
  }

  // Validate transition
  const currentStatus = deal.status;
  const allowed = STATUS_TRANSITIONS[currentStatus];

  if (!allowed) {
    return NextResponse.json(
      { error: `Unknown current status: ${currentStatus}` },
      { status: 400 }
    );
  }

  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      {
        error: `Invalid status transition: ${currentStatus} → ${newStatus}`,
        current: currentStatus,
        allowed,
      },
      { status: 422 }
    );
  }

  // Broker-only statuses
  if (BROKER_ONLY_STATUSES.includes(newStatus) && auth.role !== "BROKER") {
    return NextResponse.json(
      { error: `${newStatus} requires broker approval` },
      { status: 403 }
    );
  }

  const updateData: Record<string, unknown> = { status: newStatus };

  // Set contract_closed timestamp when deal closes
  if (newStatus === "closed") {
    updateData.contract_closed = new Date();
  }

  await prisma.deal.update({
    where: { id: deal.id },
    data: updateData,
  });

  await logAuditEvent(
    "status_change",
    "deal",
    deal.id.toString(),
    auth,
    { previous_status: currentStatus, new_status: newStatus },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: deal.id.toString(),
    previous_status: currentStatus,
    status: newStatus,
  });
}
