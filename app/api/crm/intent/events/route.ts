// /api/crm/intent/events
// POST: Record a buyer intent event
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import type { Prisma } from "@prisma/client";
import { INTENT_EVENT_TYPES } from "@/lib/buyer-intent/types";

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
  const lead_id = body.lead_id as string | undefined;
  const event_type = body.event_type as string | undefined;
  const payload = body.payload;
  const session_id = body.session_id as string | undefined;

  if (!lead_id || !event_type) {
    return NextResponse.json(
      { ok: false, error: "lead_id and event_type are required" },
      { status: 400 }
    );
  }

  if (!INTENT_EVENT_TYPES.includes(event_type as typeof INTENT_EVENT_TYPES[number])) {
    return NextResponse.json(
      { ok: false, error: `event_type must be one of: ${INTENT_EVENT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const leadId = BigInt(lead_id);

  // Verify lead exists and belongs to this agent (or broker)
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { agent_id: true },
  });

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
  }
  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const event = await prisma.intentEvent.create({
    data: {
      lead_id: leadId,
      event_type,
      payload: (payload ?? undefined) as Prisma.InputJsonValue | undefined,
      session_id: session_id || null,
    },
  });

  return NextResponse.json({
    ok: true,
    item: {
      ...event,
      id: event.id.toString(),
      lead_id: event.lead_id.toString(),
    },
  }, { status: 201 });
}
