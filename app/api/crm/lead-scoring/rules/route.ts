// /api/crm/lead-scoring/rules — GET: list, POST: create assignment rules (broker only)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const rules = await prisma.leadAssignmentRule.findMany({
    orderBy: { priority: "desc" },
    include: { agent: { select: { id: true, full_name: true, email: true } } },
  });

  return NextResponse.json({ items: rules.map(r => ({
      ...r, id: r.id.toString(), agent_id: r.agent_id.toString(),
      agent: r.agent ? { ...r.agent, id: r.agent.id.toString() } : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const agent_id = body.agent_id as string | undefined;
  const criteria = body.criteria;
  const priority = body.priority as number | undefined;
  const max_leads_per_month = body.max_leads_per_month as number | undefined;

  if (!agent_id) return NextResponse.json({ error: "agent_id is required" }, { status: 400 });

  const rule = await prisma.leadAssignmentRule.create({
    data: {
      agent_id: BigInt(agent_id),
      criteria: (criteria ?? {}) as Prisma.InputJsonValue,
      priority: priority ?? 50,
      max_leads_per_month: max_leads_per_month ?? 50,
    },
  });

  await logAuditEvent("create", "assignment_rule", rule.id.toString(), auth);

  return NextResponse.json({ item: { ...rule, id: rule.id.toString(), agent_id: rule.agent_id.toString() },
  }, { status: 201 });
}
