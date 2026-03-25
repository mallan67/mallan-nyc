// /api/crm/tasks — Follow-up task management
// GET: List tasks for agent (or all for broker). POST: Create task.
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import prisma from "@/lib/prisma";
import { safeJson } from "@/lib/api/safe-json";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const status = req.nextUrl.searchParams.get("status") || "pending";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);

  const where: Record<string, unknown> = {};
  if (status !== "all") where.status = status;
  // Agents see own tasks only; broker sees all
  if (auth.role !== "BROKER") where.agent_id = auth.userId;

  const tasks = await prisma.followUpTask.findMany({
    where,
    include: {
      lead: { select: { first_name: true, last_name: true, email: true, phone: true, portal_role: true, pipeline_stage: true } },
    },
    orderBy: { due_date: "asc" },
    take: limit,
  });

  // Mark overdue tasks
  const now = new Date();
  const serialized = tasks.map((t) => ({
    id: t.id.toString(),
    lead_id: t.lead_id.toString(),
    lead_name: `${t.lead.first_name} ${t.lead.last_name}`,
    lead_email: t.lead.email,
    lead_phone: t.lead.phone,
    lead_role: t.lead.portal_role,
    lead_stage: t.lead.pipeline_stage,
    title: t.title,
    description: t.description,
    due_date: t.due_date,
    priority: t.priority,
    status: t.status === "pending" && t.due_date < now ? "overdue" : t.status,
    task_type: t.task_type,
    completed_at: t.completed_at,
    created_at: t.created_at,
  }));

  const stats = {
    pending: serialized.filter((t) => t.status === "pending").length,
    overdue: serialized.filter((t) => t.status === "overdue").length,
    today: serialized.filter((t) => {
      const d = new Date(t.due_date);
      return d.toDateString() === now.toDateString() && t.status !== "completed";
    }).length,
  };

  return NextResponse.json({ tasks: serialized, stats });
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { lead_id, title, description, due_date, priority, task_type } = body;

  if (!lead_id || !title || !due_date) {
    return NextResponse.json({ error: "lead_id, title, and due_date required" }, { status: 400 });
  }

  // Ownership validation: agents can only create tasks for their own leads
  if (auth.role !== "BROKER") {
    const lead = await prisma.lead.findFirst({
      where: { id: BigInt(lead_id), agent_id: auth.userId },
      select: { id: true },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found or not assigned to you" }, { status: 403 });
    }
  }

  const task = await prisma.followUpTask.create({
    data: {
      lead_id: BigInt(lead_id),
      agent_id: auth.userId,
      title,
      description: description || null,
      due_date: new Date(due_date),
      priority: priority || "medium",
      task_type: task_type || "follow_up",
    },
  });

  // Update lead's next_follow_up
  await prisma.lead.update({
    where: { id: BigInt(lead_id) },
    data: { next_follow_up: new Date(due_date) },
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      lead_id: BigInt(lead_id),
      activity_type: "task_created",
      title: `Task: ${title}`,
      detail: `Due ${new Date(due_date).toLocaleDateString()}. Priority: ${priority || 'medium'}`,
      actor_type: "agent",
      actor_id: auth.userId,
    },
  });

  await logAuditEvent("create", "follow_up_task", task.id.toString(), auth, { lead_id, title });

  return NextResponse.json({ id: task.id.toString(), status: "pending" }, { status: 201 });
}
