// /api/cron/tenant-nurture — Daily 8:30am: advance tenant nurture cadence
// Checks leads with active drips, evaluates engagement (ListingView), advances stages,
// creates Notification for agent to review and send listings.
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (
    !authHeader ||
    (() => {
      const expected = "Bearer " + (process.env.CRON_SECRET || "");
      return (
        authHeader.length !== expected.length ||
        !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
      );
    })()
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results = { checked: 0, advanced: 0, notifications: 0, completed: 0, errors: 0 };

  // Find all leads in an active nurture cadence
  const leads = await prisma.lead.findMany({
    where: {
      OR: [{ sales_drip_on: true }, { rental_drip_on: true }],
      nurture_paused: false,
    },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      agent_id: true,
      reengage_anchor_date: true,
      sales_drip_on: true,
      sales_drip_status: true,
      rental_drip_on: true,
      rental_drip_status: true,
      outreach_6mo_date: true,
      outreach_90d_date: true,
      outreach_60d_date: true,
      outreach_30d_date: true,
    },
  });

  results.checked = leads.length;

  for (const lead of leads) {
    try {
      const anchor = lead.reengage_anchor_date;
      if (!anchor || !lead.agent_id) continue;

      // Check for recent engagement (views since last outreach)
      const lastOutreach =
        lead.outreach_30d_date ||
        lead.outreach_60d_date ||
        lead.outreach_90d_date ||
        lead.outreach_6mo_date ||
        anchor;

      const recentViews = await prisma.listingView.count({
        where: {
          lead_id: lead.id,
          viewed_at: { gte: lastOutreach },
        },
      });

      // If engaged (has views since last outreach), stay at current stage
      if (recentViews > 0) continue;

      const status = lead.sales_drip_status || "6mo";
      const name =
        `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Client";

      // Determine if it's time to advance
      let shouldAdvance = false;
      let nextStatus = status;
      let stageLabel = "";
      let dateField = "";

      if (status === "6mo" || !lead.outreach_6mo_date) {
        const sixMonths = new Date(anchor);
        sixMonths.setMonth(sixMonths.getMonth() + 6);
        if (now >= sixMonths) {
          shouldAdvance = true;
          nextStatus = "90d";
          stageLabel = "6-month sales listings";
          dateField = "outreach_6mo_date";
        }
      } else if (status === "90d") {
        const target = new Date(lead.outreach_6mo_date!);
        target.setDate(target.getDate() + 90);
        if (now >= target) {
          shouldAdvance = true;
          nextStatus = "60d";
          stageLabel = "90-day mixed listings";
          dateField = "outreach_90d_date";
        }
      } else if (status === "60d") {
        const target = new Date(lead.outreach_90d_date!);
        target.setDate(target.getDate() + 60);
        if (now >= target) {
          shouldAdvance = true;
          nextStatus = "30d";
          stageLabel = "60-day mixed listings";
          dateField = "outreach_60d_date";
        }
      } else if (status === "30d") {
        const target = new Date(lead.outreach_60d_date!);
        target.setDate(target.getDate() + 30);
        if (now >= target) {
          // End of cadence
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              sales_drip_on: false,
              rental_drip_on: false,
              sales_drip_status: "completed",
              rental_drip_status: "completed",
              outreach_30d_date: now,
            },
          });
          results.completed++;
          continue;
        }
      }

      if (shouldAdvance && dateField) {
        // Update drip status + outreach date
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            sales_drip_status: nextStatus,
            [dateField]: now,
          },
        });

        // Create notification for agent to review
        await prisma.notification.create({
          data: {
            recipient_type: "agent",
            recipient_id: lead.agent_id,
            channel: "in_app",
            type: "nurture_draft",
            title: `Nurture: listings ready for ${name}`,
            body: `${stageLabel} based on ${name}'s search criteria. Review and send.`,
            data: {
              lead_id: lead.id.toString(),
              stage: nextStatus,
            },
            status: "pending",
          },
        });

        results.advanced++;
        results.notifications++;
      }
    } catch {
      results.errors++;
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
    ran_at: now.toISOString(),
  });
}
