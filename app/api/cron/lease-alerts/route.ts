// /api/cron/lease-alerts — Renter lease expiry alerts + buyer conversion flags
// Runs daily. Checks for leases expiring in 90/60/30 days.
// Flags renters with strong financials as buyer conversion candidates.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createNotification } from "@/lib/notifications/engine";

export const runtime = "nodejs";
export const maxDuration = 30;

// Verify cron secret
function verifyCron(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const day30 = new Date(now); day30.setDate(day30.getDate() + 30);
  const day60 = new Date(now); day60.setDate(day60.getDate() + 60);
  const day90 = new Date(now); day90.setDate(day90.getDate() + 90);

  let alertsSent = 0;
  let conversionFlags = 0;

  // Find renters with lease_end_date in next 90 days
  const expiringRenters = await prisma.lead.findMany({
    where: {
      portal_role: { in: ["tenant", "renter"] },
      lease_end_date: { gte: now, lte: day90 },
      agent_id: { not: null },
    },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      agent_id: true,
      lease_end_date: true,
      annual_income: true,
      credit_score_range: true,
      pre_approved: true,
      pre_approved_amount: true,
      pipeline_stage: true,
    },
  });

  for (const renter of expiringRenters) {
    const daysUntilExpiry = Math.ceil(
      ((renter.lease_end_date as Date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Determine alert tier
    let alertTier: string | null = null;
    if (daysUntilExpiry <= 30) alertTier = "30_day";
    else if (daysUntilExpiry <= 60) alertTier = "60_day";
    else if (daysUntilExpiry <= 90) alertTier = "90_day";

    if (!alertTier || !renter.agent_id) continue;

    // Check if we already sent this tier's alert (dedup via activity log)
    const existing = await prisma.activityLog.findFirst({
      where: {
        lead_id: renter.id,
        activity_type: "lease_alert",
        detail: { contains: alertTier },
        created_at: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }, // within 7 days
      },
    });
    if (existing) continue;

    const name = `${renter.first_name} ${renter.last_name}`;

    // Send notification to agent
    await createNotification({
      recipient_type: "agent",
      recipient_id: renter.agent_id,
      type: "listing_expiration",
      title: `Lease expiring in ${daysUntilExpiry} days`,
      body: `${name}'s lease expires ${(renter.lease_end_date as Date).toLocaleDateString()}. ${
        daysUntilExpiry <= 30
          ? "Urgent — schedule renewal discussion or transition plan."
          : daysUntilExpiry <= 60
            ? "Start the conversation about renewal or next steps."
            : "Good time to check in about renewal plans."
      }`,
      data: { lead_id: renter.id.toString(), alert_tier: alertTier, days_until: daysUntilExpiry },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        lead_id: renter.id,
        activity_type: "lease_alert",
        title: `Lease alert: ${daysUntilExpiry} days until expiry`,
        detail: `${alertTier} alert sent to agent. Lease ends ${(renter.lease_end_date as Date).toLocaleDateString()}.`,
        actor_type: "system",
      },
    });
    alertsSent++;

    // Buyer conversion check — strong financials
    const income = renter.annual_income ? Number(renter.annual_income) : 0;
    const hasGoodCredit = renter.credit_score_range === "excellent" || renter.credit_score_range === "good";
    const isPreApproved = renter.pre_approved;

    // NYC rule of thumb: annual income >= $80k AND good/excellent credit = potential buyer
    const isConversionCandidate = income >= 80000 && hasGoodCredit;

    if ((isConversionCandidate || isPreApproved) && renter.pipeline_stage !== "buyer_conversion") {
      // Flag for buyer conversion
      await createNotification({
        recipient_type: "agent",
        recipient_id: renter.agent_id,
        type: "system",
        title: `Buyer conversion opportunity: ${name}`,
        body: `${name}'s lease expires in ${daysUntilExpiry} days. ${
          isPreApproved
            ? `Pre-approved for $${Number(renter.pre_approved_amount || 0).toLocaleString()}.`
            : `Income: $${income.toLocaleString()}/yr, credit: ${renter.credit_score_range}.`
        } Strong candidate for buyer conversion.`,
        data: {
          lead_id: renter.id.toString(),
          conversion_reason: isPreApproved ? "pre_approved" : "strong_financials",
          income,
          credit: renter.credit_score_range,
        },
      });

      // Log conversion flag
      await prisma.activityLog.create({
        data: {
          lead_id: renter.id,
          activity_type: "conversion_flag",
          title: "Flagged for buyer conversion",
          detail: `Lease expiring in ${daysUntilExpiry}d. ${isPreApproved ? 'Pre-approved' : `Income $${income.toLocaleString()}, ${renter.credit_score_range} credit`}. Auto-flagged by system.`,
          actor_type: "system",
        },
      });
      conversionFlags++;
    }
  }

  return NextResponse.json({
    checked: expiringRenters.length,
    alerts_sent: alertsSent,
    conversion_flags: conversionFlags,
    timestamp: now.toISOString(),
  });
}
