// PATCH /api/crm/showings/[id]
// Update showing status (confirm/cancel/complete), reschedule.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

type RouteParams = { params: Promise<{ id: string }> };

const VALID_TRANSITIONS: Record<string, string[]> = {
  requested: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const showing = await prisma.showing.findUnique({
    where: { id: BigInt(parseInt(id)) },
  });

  if (!showing) {
    return NextResponse.json({ error: "Showing not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && showing.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const newStatus = body.status as string;
    const allowed = VALID_TRANSITIONS[showing.status] ?? [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Cannot transition from '${showing.status}' to '${newStatus}'. Allowed: ${allowed.join(", ") || "none"}`,
        },
        { status: 400 }
      );
    }
    update.status = newStatus;
  }

  if (body.date !== undefined) update.date = new Date(body.date as string);
  if (body.time !== undefined) update.time = body.time as string | null;
  if (body.notes !== undefined) update.notes = body.notes as string | null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const updated = await prisma.showing.update({
    where: { id: showing.id },
    data: update,
  });

  await logAuditEvent(
    "update",
    "showing",
    showing.id.toString(),
    auth,
    { fields: Object.keys(update) },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: updated.id.toString(),
    status: updated.status,
  });
}
