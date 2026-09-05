// /api/crm/financial-scenarios
// GET: Fetch saved financial scenarios for a client.
// POST: Create a new financial scenario.
// Scenarios are stored as audit_events with action='financial_scenario'.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { assertLeadIdStringAccess } from "@/lib/crm/access";

/**
 * GET /api/crm/financial-scenarios?client_id=X
 */
export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const clientId = req.nextUrl.searchParams.get("client_id");
  if (!clientId) {
    return NextResponse.json({ error: "client_id required" }, { status: 400 });
  }

  const access = await assertLeadIdStringAccess(auth, clientId);
  if (access.response) return access.response;

  const events = await prisma.auditEvent.findMany({
    where: {
      action: "financial_scenario",
      entity_id: clientId,
      entity_type: "client",
    },
    orderBy: { created_at: "desc" },
    take: 50,
  });

  const scenarios = events.map((e) => {
    const data = (e.changes as Record<string, unknown>) ?? {};
    return {
      id: e.id.toString(),
      type: (data.type as string) || "mortgage",
      label: (data.label as string) || "Scenario",
      values: (data.values as Record<string, unknown>) || {},
      date: e.created_at.toISOString(),
      createdBy: e.user_id?.toString() || null,
    };
  });

  return NextResponse.json({ scenarios });
}

/**
 * POST /api/crm/financial-scenarios
 */
export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clientId = body.client_id as string;
  const type = body.type as string;
  const label = body.label as string;
  const values = body.values as Record<string, unknown>;

  if (!clientId || !type) {
    return NextResponse.json({ error: "client_id and type required" }, { status: 400 });
  }
  const access = await assertLeadIdStringAccess(auth, clientId);
  if (access.response) return access.response;

  const event = await prisma.auditEvent.create({
    data: {
      action: "financial_scenario",
      entity_type: "client",
      entity_id: clientId,
      user_type: "agent",
      user_id: auth.userId,
      actor_user_id: auth.actorUserId ?? null,  // broker actor when delegated; null otherwise
      changes: { type, label: label || type, values: values || {} } as unknown as import("@prisma/client").Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    scenario: {
      id: event.id.toString(),
      type,
      label: label || type,
      values: values || {},
      date: event.created_at.toISOString(),
      createdBy: auth.userId.toString(),
    },
  }, { status: 201 });
}
