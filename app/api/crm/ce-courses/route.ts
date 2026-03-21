// /api/crm/ce-courses — GET: list CE courses (stored as audit events)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const agentId = req.nextUrl.searchParams.get("agent_id");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "100"), 500);

  const where: Record<string, unknown> = {
    action: "ce_course_added",
    entity_type: "ce_course",
  };

  if (auth.role !== "BROKER") {
    where.user_id = auth.userId;
  } else if (agentId) {
    where.user_id = BigInt(agentId);
  }

  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: limit,
  });

  const courses = events.map((e) => {
    const data = (e.changes || {}) as Record<string, unknown>;
    return {
      id: e.id.toString(),
      agent_id: e.user_id?.toString() ?? null,
      course_name: data.course_name || null,
      provider: data.provider || null,
      hours: data.hours || 0,
      completion_date: data.completion_date || null,
      certificate_url: data.certificate_url || null,
      created_at: e.created_at.toISOString(),
    };
  });

  return NextResponse.json({ ok: true, courses, total: courses.length });
}
