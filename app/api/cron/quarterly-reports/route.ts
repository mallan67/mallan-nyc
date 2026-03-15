// /api/cron/quarterly-reports — Send quarterly market reports to all clients
// Runs on 1st of Jan, Apr, Jul, Oct at 9am
// Generates a market report and creates notifications for all active leads
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createNotification } from "@/lib/notifications/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

function verifyCron(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q} ${now.getFullYear()}`;
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = getCurrentQuarter();

  // Get all active leads with agents
  const leads = await prisma.lead.findMany({
    where: {
      agent_id: { not: null },
      status: { not: "closed" },
    },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      portal_role: true,
      agent_id: true,
    },
  });

  let sent = 0;

  for (const lead of leads) {
    if (!lead.agent_id) continue;

    const roleLabel =
      lead.portal_role === "seller" || lead.portal_role === "landlord"
        ? "seller"
        : "buyer";

    // Notify the lead (if they have portal access)
    try {
      await createNotification({
        recipient_type: "lead",
        recipient_id: lead.id,
        type: "system",
        title: `${period} Manhattan Market Report`,
        body: `Your quarterly market report is ready. Log in to your portal to view the latest pricing trends, inventory levels, and market conditions for Manhattan real estate.`,
        data: { period, type: "quarterly_report" },
      });
      sent++;
    } catch {
      // Skip leads without notification preferences
    }

    // Also notify their agent
    try {
      await createNotification({
        recipient_type: "agent",
        recipient_id: lead.agent_id,
        type: "system",
        title: `Quarterly report sent to ${lead.first_name} ${lead.last_name}`,
        body: `${period} market report notification sent to your ${roleLabel} client. Follow up to discuss market conditions and strategy.`,
        data: { lead_id: lead.id.toString(), period },
      });
    } catch {
      // Skip if agent notification fails
    }

    // Create follow-up task for agent
    try {
      await prisma.followUpTask.create({
        data: {
          lead_id: lead.id,
          agent_id: lead.agent_id,
          title: `Quarterly check-in: ${lead.first_name} ${lead.last_name}`,
          description: `${period} market report sent. Follow up to discuss market conditions, pricing strategy, and next steps.`,
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          priority: "medium",
          task_type: "follow_up",
        },
      });
    } catch {
      // Skip duplicate tasks
    }
  }

  // Log
  await prisma.activityLog.create({
    data: {
      lead_id: leads[0]?.id || BigInt(1),
      activity_type: "system",
      title: `${period} quarterly reports sent`,
      detail: `Sent to ${sent} clients. Follow-up tasks created for agents.`,
      actor_type: "system",
    },
  }).catch(() => {});

  return NextResponse.json({
    period,
    total_leads: leads.length,
    notifications_sent: sent,
    timestamp: new Date().toISOString(),
  });
}
