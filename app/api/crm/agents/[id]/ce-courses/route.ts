// /api/crm/agents/[id]/ce-courses — POST: add, DELETE: remove CE course
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  // Agents can only add to own profile, broker can add to anyone
  if (auth.role !== "BROKER" && auth.userId !== BigInt(id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const agent = await prisma.agent.findUnique({ where: { id: BigInt(id) } });
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const courseData = {
    course_name: body.course_name || body.name || "Unnamed Course",
    provider: body.provider || null,
    hours: Number(body.hours) || 0,
    completion_date: body.completion_date || null,
    certificate_url: body.certificate_url || null,
    agent_name: agent.full_name,
  };

  // Store as AuditEvent (no CE model exists)
  const event = await prisma.auditEvent.create({
    data: {
      action: "ce_course_added",
      entity_type: "ce_course",
      entity_id: id,
      user_type: "agent",
      user_id: BigInt(id),
      changes: JSON.parse(JSON.stringify(courseData)),
    },
  });

  return NextResponse.json({
    ok: true,
    course: { id: event.id.toString(), ...courseData },
  }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  // The "id" here is the agent ID, but we need the course (audit event) ID
  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) {
    return NextResponse.json({ error: "courseId query param required" }, { status: 400 });
  }

  const event = await prisma.auditEvent.findUnique({ where: { id: BigInt(courseId) } });
  if (!event || event.entity_type !== "ce_course") {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && event.user_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.auditEvent.delete({ where: { id: BigInt(courseId) } });

  return NextResponse.json({ ok: true });
}
