// /api/cron/prospect-triggers — Daily 9am: cadence readiness, overdue alerts, follow-up sync, building activity
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getAccessToken } from "@/lib/idx/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INACTIVE_STATUSES = ["converted", "declined", "cold"];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || (() => { const expected = "Bearer " + (process.env.CRON_SECRET || ""); return authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected)); })()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const summary = {
    cadence_ready: 0,
    overdue_alerts: 0,
    follow_ups_updated: 0,
    building_events: 0,
  };

  try {
    // ──────────────────────────────────────────────────────────────
    // Step 1: Mark cadence steps as "ready" when scheduled_date <= now
    // ──────────────────────────────────────────────────────────────
    const readyResult = await prisma.outreachCadenceStep.updateMany({
      where: {
        status: "pending",
        scheduled_date: { lte: new Date() },
      },
      data: { status: "ready" },
    });
    summary.cadence_ready = readyResult.count;

    // ──────────────────────────────────────────────────────────────
    // Step 2: Detect overdue hot prospects (no contact in 48h)
    // ──────────────────────────────────────────────────────────────
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const overdueHotLeads = await prisma.sellerLead.findMany({
      where: {
        status: "hot",
        OR: [
          { last_contacted_at: null },
          { last_contacted_at: { lt: fortyEightHoursAgo } },
        ],
      },
      select: { id: true, address: true, owner_name: true, assigned_agent_id: true },
    });

    if (overdueHotLeads.length > 0) {
      await prisma.auditEvent.createMany({
        data: overdueHotLeads.map((lead) => ({
          action: "prospect_overdue_followup",
          entity_type: "seller_lead",
          entity_id: String(lead.id),
          user_type: "system",
          changes: {
            address: lead.address,
            owner_name: lead.owner_name,
            assigned_agent_id: lead.assigned_agent_id
              ? String(lead.assigned_agent_id)
              : null,
          },
        })),
      });
      summary.overdue_alerts = overdueHotLeads.length;
    }

    // ──────────────────────────────────────────────────────────────
    // Step 3: Update next_follow_up on all active prospects
    // ──────────────────────────────────────────────────────────────
    const activeLeads = await prisma.sellerLead.findMany({
      where: { status: { notIn: INACTIVE_STATUSES } },
      select: { id: true },
    });

    for (const lead of activeLeads) {
      const nextStep = await prisma.outreachCadenceStep.findFirst({
        where: {
          seller_lead_id: lead.id,
          status: { in: ["pending", "ready"] },
        },
        orderBy: { scheduled_date: "asc" },
        select: { scheduled_date: true },
      });

      if (nextStep?.scheduled_date) {
        await prisma.sellerLead.update({
          where: { id: lead.id },
          data: { next_follow_up: nextStep.scheduled_date },
        });
        summary.follow_ups_updated++;
      }
    }

    // ──────────────────────────────────────────────────────────────
    // Step 4: Trestle building activity detection (last 24 hours)
    // ──────────────────────────────────────────────────────────────
    try {
      const buildingRows = await prisma.sellerLead.findMany({
        where: {
          status: { notIn: INACTIVE_STATUSES },
          building_name: { not: null },
        },
        select: { building_name: true },
        distinct: ["building_name"],
      });

      const buildingNames = buildingRows
        .map((r) => r.building_name)
        .filter((name): name is string => Boolean(name));

      if (buildingNames.length > 0) {
        const token = await getAccessToken();
        const trestleBase =
          process.env.TRESTLE_API_URL ||
          process.env.IDX_ENDPOINT ||
          "https://api.cotality.com/trestle";
        const twentyFourHoursAgo = new Date(
          Date.now() - 24 * 60 * 60 * 1000
        ).toISOString();

        for (const buildingName of buildingNames) {
          try {
            // OData filter: match building + recent modification
            const escapedName = buildingName.replace(/'/g, "''");
            const filter = `BuildingName eq '${escapedName}' and ModificationTimestamp gt ${twentyFourHoursAgo}`;
            const select =
              "ListingId,StandardStatus,ListPrice,ClosePrice,StreetNumber,StreetName,UnitNumber";

            const url = `${trestleBase}/odata/Property?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=50`;

            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(10_000),
              cache: "no-store",
            });

            if (!res.ok) {
              console.warn(
                `[prospect-triggers] Trestle ${res.status} for building "${buildingName}"`
              );
              continue;
            }

            const data = await res.json();
            const listings = data?.value || [];

            const auditEvents: Array<{
              action: string;
              entity_type: string;
              entity_id: string;
              user_type: string;
              changes: Prisma.InputJsonValue;
            }> = [];

            for (const listing of listings) {
              const status = listing.StandardStatus;
              const listingId = listing.ListingId || "unknown";
              const address = [
                listing.StreetNumber,
                listing.StreetName,
                listing.UnitNumber ? `#${listing.UnitNumber}` : "",
              ]
                .filter(Boolean)
                .join(" ");

              if (status === "Active") {
                auditEvents.push({
                  action: "prospect_building_new_listing",
                  entity_type: "seller_lead",
                  entity_id: listingId,
                  user_type: "system",
                  changes: {
                    building_name: buildingName,
                    address,
                    list_price: listing.ListPrice,
                    status,
                  } as Prisma.InputJsonValue,
                });
              } else if (status === "Closed") {
                auditEvents.push({
                  action: "prospect_building_sold",
                  entity_type: "seller_lead",
                  entity_id: listingId,
                  user_type: "system",
                  changes: {
                    building_name: buildingName,
                    address,
                    close_price: listing.ClosePrice,
                    list_price: listing.ListPrice,
                    status,
                  },
                });
              }
            }

            if (auditEvents.length > 0) {
              await prisma.auditEvent.createMany({ data: auditEvents });
              summary.building_events += auditEvents.length;
            }
          } catch (buildingErr) {
            // Graceful: skip this building, continue to next
            console.warn(
              `[prospect-triggers] Trestle error for building "${buildingName}":`,
              buildingErr instanceof Error
                ? buildingErr.message
                : String(buildingErr)
            );
          }
        }
      }
    } catch (trestleErr) {
      // Graceful: if Trestle auth or overall call fails, don't block other steps
      console.warn(
        "[prospect-triggers] Trestle building scan skipped:",
        trestleErr instanceof Error
          ? trestleErr.message
          : String(trestleErr)
      );
    }

    // ──────────────────────────────────────────────────────────────
    // Log completion
    // ──────────────────────────────────────────────────────────────
    await prisma.auditEvent.create({
      data: {
        action: "cron_prospect_triggers",
        entity_type: "cron",
        entity_id: "prospect-triggers",
        user_type: "system",
        changes: JSON.parse(
          JSON.stringify({ ...summary, durationMs: Date.now() - started })
        ),
      },
    });

    return NextResponse.json({ ...summary, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.auditEvent
      .create({
        data: {
          action: "cron_prospect_triggers_error",
          entity_type: "cron",
          entity_id: "prospect-triggers",
          user_type: "system",
          changes: JSON.parse(JSON.stringify({ error: message })),
        },
      })
      .catch(() => {});

    console.error("[cron/prospect-triggers] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
