/**
 * Client Health Engine — computes suggested pipeline stage, health score,
 * urgency level, and reasons for each client.
 *
 * Called:
 * - When client workspace opens (via API)
 * - By the daily lead-scoring cron (bulk update)
 */

import prisma from "@/lib/prisma";

export interface ClientHealth {
  suggestedStage: string;
  healthScore: number; // 0-100
  urgencyLevel: "high" | "medium" | "low" | "none";
  reasons: string[];
}

export async function computeClientHealth(
  leadId: bigint
): Promise<ClientHealth> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  // Fetch client + recent activity in parallel
  const [lead, recentEvents, tasks, showings, listingActions] =
    await Promise.all([
      prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          status: true,
          pipeline_stage: true,
          roles: true,
          portal_role: true,
          lease_end_date: true,
          updated_at: true,
          created_at: true,
        },
      }),
      prisma.activityLog.findMany({
        where: { lead_id: leadId, created_at: { gte: thirtyDaysAgo } },
        orderBy: { created_at: "desc" },
        take: 50,
      }),
      prisma.followUpTask.findMany({
        where: { lead_id: leadId, status: { in: ["pending", "overdue"] } },
        orderBy: { due_date: "asc" },
        take: 10,
      }),
      prisma.showing.findMany({
        where: { lead_id: leadId, date: { gte: thirtyDaysAgo } },
        orderBy: { date: "desc" },
        take: 10,
      }),
      prisma.clientListingAction.findMany({
        where: { lead_id: leadId, created_at: { gte: thirtyDaysAgo } },
        take: 20,
      }),
    ]);

  if (!lead) {
    return {
      suggestedStage: "new",
      healthScore: 0,
      urgencyLevel: "none",
      reasons: ["Client not found"],
    };
  }

  const reasons: string[] = [];
  let healthScore = 50; // Start at neutral
  let suggestedStage = lead.pipeline_stage || lead.status || "new";
  let urgencyLevel: "high" | "medium" | "low" | "none" = "none";

  const clientType = (
    lead.portal_role ||
    (lead.roles && lead.roles[0]) ||
    ""
  ).toLowerCase();

  // Recent showing → stage should be 'showing'
  const recentShowings = showings.filter(
    (s) => new Date(s.date) >= sevenDaysAgo
  );
  if (recentShowings.length > 0) {
    suggestedStage = "showing";
    healthScore += 20;
    reasons.push(`${recentShowings.length} showing(s) in last 7 days`);
  }

  // Offer/deal activity
  const hasOffer = recentEvents.some(
    (e) =>
      e.activity_type === "offer" ||
      e.activity_type === "offer_submitted"
  );
  const hasDeal = recentEvents.some(
    (e) => e.activity_type === "deal" || e.activity_type === "deal_signed"
  );
  if (hasDeal) {
    suggestedStage = "deal";
    healthScore = 90;
    reasons.push("Deal activity detected");
  } else if (hasOffer) {
    suggestedStage = "offer";
    healthScore += 25;
    reasons.push("Offer activity detected");
  }

  // Listing engagement
  const likedCount = listingActions.filter(
    (a) => a.action === "liked"
  ).length;
  if (likedCount >= 3) {
    healthScore += 10;
    reasons.push(`Liked ${likedCount} listings`);
  }

  // No activity in 14+ days AND currently active → suggest nurturing
  const lastActivity = lead.updated_at || lead.created_at;
  const daysSinceActivity = Math.floor(
    (now.getTime() - lastActivity.getTime()) / 86400000
  );
  if (daysSinceActivity >= 14 && ["active", "contacted"].includes(suggestedStage)) {
    suggestedStage = "nurturing";
    healthScore -= 20;
    urgencyLevel = "medium";
    reasons.push(`No activity in ${daysSinceActivity} days`);
  }

  // New client, never contacted
  if (
    recentEvents.length === 0 &&
    showings.length === 0 &&
    listingActions.length === 0
  ) {
    if (suggestedStage === "new") {
      urgencyLevel = "medium";
      reasons.push("New client — not yet contacted");
    }
  }

  // Lease expiring on renter → flag for conversion
  if (
    (clientType === "renter" || clientType === "landlord") &&
    lead.lease_end_date
  ) {
    const daysLeft = Math.floor(
      (new Date(lead.lease_end_date).getTime() - now.getTime()) / 86400000
    );
    if (daysLeft > 0 && daysLeft <= 90) {
      urgencyLevel = "high";
      healthScore += 15;
      reasons.push(`Lease expires in ${daysLeft} days`);
    }
  }

  // Overdue tasks
  const overdueTasks = tasks.filter(
    (t) => t.due_date && new Date(t.due_date) < now
  );
  if (overdueTasks.length > 0) {
    urgencyLevel = urgencyLevel === "high" ? "high" : "medium";
    healthScore -= 10;
    reasons.push(`${overdueTasks.length} overdue task(s)`);
  }

  // Clamp score
  healthScore = Math.max(0, Math.min(100, healthScore));

  return {
    suggestedStage,
    healthScore,
    urgencyLevel,
    reasons,
  };
}
