// /api/crm/tasks/[id] — Update a task (complete, cancel, reschedule)
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import prisma from "@/lib/prisma";
import { safeJson } from "@/lib/api/safe-json";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { status, due_date } = body as Record<string, any>;

  const task = await prisma.followUpTask.findUnique({
    where: { id: BigInt(id) },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Agents can only update own tasks
  if (auth.role !== "BROKER" && task.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Not your task" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (status) {
    data.status = status;
    if (status === "completed") data.completed_at = new Date();
  }
  if (due_date) data.due_date = new Date(due_date);

  await prisma.followUpTask.update({
    where: { id: BigInt(id) },
    data,
  });

  // Log activity
  if (status === "completed") {
    await prisma.activityLog.create({
      data: {
        lead_id: task.lead_id,
        activity_type: "task_completed",
        title: `Task completed: ${task.title}`,
        actor_type: "agent",
        actor_id: auth.userId,
      },
    });

    // Update lead's last_contacted_at
    await prisma.lead.update({
      where: { id: task.lead_id },
      data: { last_contacted_at: new Date() },
    });
  }

  await logAuditEvent("update", "follow_up_task", id, auth, { status });

  return NextResponse.json({ ok: true, status: status || task.status });
}
