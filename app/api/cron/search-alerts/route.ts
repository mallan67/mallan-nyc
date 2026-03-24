// GET /api/cron/search-alerts
// Daily cron — finds saved searches with alert_enabled=true,
// executes them against the listings DB, and emails new results.
// Protected by CRON_SECRET header (Vercel Cron).
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/sendgrid";
import { listingAlertEmail } from "@/lib/email/templates";
import type { Prisma } from "@prisma/client";
import { escapeHtml } from "@/lib/sanitize";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://mallan.nyc";

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader || authHeader.length !== ("Bearer " + cronSecret).length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find all enabled alerts that are due
    const now = new Date();
    const searches = await prisma.savedSearch.findMany({
      where: {
        alert_enabled: true,
        alert_frequency: { not: null },
      },
      include: {
        lead: { select: { id: true, first_name: true, last_name: true, email: true } },
        agent: { select: { id: true, first_name: true, last_name: true, email: true } },
      },
    });

    let sent = 0;
    let skipped = 0;
    let errored = 0;

    for (const search of searches) {
      try {
        // Check frequency — skip if not yet due
        if (search.last_alert_sent) {
          const hoursSinceLastAlert = (now.getTime() - search.last_alert_sent.getTime()) / (1000 * 60 * 60);
          if (search.alert_frequency === "daily" && hoursSinceLastAlert < 23) {
            skipped++;
            continue;
          }
          if (search.alert_frequency === "weekly" && hoursSinceLastAlert < 167) {
            skipped++;
            continue;
          }
        }

        // Determine recipient email
        const email = search.alert_email
          || search.lead?.email
          || search.agent?.email;
        if (!email) {
          skipped++;
          continue;
        }

        const clientName = search.lead
          ? `${search.lead.first_name || ""} ${search.lead.last_name || ""}`.trim()
          : search.agent
            ? `${search.agent.first_name || ""} ${search.agent.last_name || ""}`.trim()
            : "there";

        // Execute search criteria against DB
        const criteria = search.criteria as Record<string, unknown>;
        const where = criteriaToPrismaWhere(criteria);

        // Only find listings newer than last alert (or last 24h for first run)
        const since = search.last_alert_sent || new Date(now.getTime() - 24 * 60 * 60 * 1000);
        where.modification_timestamp = { gte: since };

        const newListings = await prisma.listing.findMany({
          where,
          take: 10,
          orderBy: { modification_timestamp: "desc" },
          select: {
            listing_id: true,
            list_price: true,
            bedrooms_total: true,
            bathrooms_full: true,
            address: true,
          },
        });

        if (newListings.length === 0) {
          // No new listings — update last_alert_sent but don't email
          await prisma.savedSearch.update({
            where: { id: search.id },
            data: { last_alert_sent: now },
          });
          skipped++;
          continue;
        }

        // Format listings for email
        const formattedListings = newListings.map((l) => {
          const addr = l.address as Record<string, string> | null;
          const address = addr
            ? `${addr.full || `${addr.streetNumber || ""} ${addr.streetName || ""}`.trim()}, ${addr.city || "New York"}`
            : "Address Available on Request";
          return {
            address,
            price: `$${Number(l.list_price).toLocaleString()}`,
            beds: l.bedrooms_total || 0,
            baths: l.bathrooms_full || 0,
            url: `${BASE_URL}/listing/${l.listing_id}`,
          };
        });

        // Send email
        const html = listingAlertEmail(formattedListings, escapeHtml(clientName || "there"));
        const subject = `${newListings.length} New Listing${newListings.length !== 1 ? "s" : ""} Matching "${search.name}"`;
        const result = await sendEmail(email, subject, html);

        if (result.success) {
          sent++;
          await prisma.savedSearch.update({
            where: { id: search.id },
            data: { last_alert_sent: now, result_count: newListings.length },
          });

          // Also create ClientListingAction records so listings appear in portal
          if (search.lead_id) {
            for (const listing of newListings) {
              const listingRecord = await prisma.listing.findUnique({
                where: { listing_id: listing.listing_id },
                select: { id: true },
              });
              if (listingRecord) {
                await prisma.clientListingAction.upsert({
                  where: {
                    lead_id_listing_id_action: {
                      lead_id: search.lead_id,
                      listing_id: listingRecord.id,
                      action: "sent",
                    },
                  },
                  update: { created_at: now },
                  create: {
                    lead_id: search.lead_id,
                    listing_id: listingRecord.id,
                    action: "sent",
                  },
                }).catch(() => {}); // Non-blocking — don't fail cron on individual insert errors
              }
            }
          }
        } else {
          errored++;
        }
      } catch (err) {
        console.error(`[Search Alerts] Error processing search ${search.id}:`, err);
        errored++;
      }
    }

    // Audit log
    await prisma.auditEvent.create({
      data: {
        action: "search_alerts_cron",
        entity_type: "saved_search",
        entity_id: "bulk",
        user_type: "system",
        user_id: null,
        changes: {
          total: searches.length,
          sent,
          skipped,
          errored,
        },
      },
    });

    return NextResponse.json({ success: true, total: searches.length, sent, skipped, errored });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Search Alerts Cron] Error:", msg);

    await prisma.auditEvent.create({
      data: {
        action: "search_alerts_cron_error",
        entity_type: "saved_search",
        entity_id: "bulk",
        user_type: "system",
        user_id: null,
        changes: { error: msg },
      },
    }).catch(() => {});

    return NextResponse.json({ error: `Alert cron failed: ${msg}` }, { status: 500 });
  }
}

/** Convert saved search criteria JSON to a Prisma where clause. */
function criteriaToPrismaWhere(criteria: Record<string, unknown>): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {};

  if (criteria.listing_type) {
    where.listing_type = criteria.listing_type === "sale" ? "sale" : "rent";
  }

  if (criteria.property_type && Array.isArray(criteria.property_type)) {
    where.property_type = { in: criteria.property_type as string[] };
  }

  if (criteria.borough) {
    where.borough = criteria.borough as string;
  }

  if (criteria.neighborhoods && Array.isArray(criteria.neighborhoods) && criteria.neighborhoods.length > 0) {
    where.neighborhood = { in: criteria.neighborhoods as string[] };
  }

  if (criteria.min_price || criteria.max_price) {
    where.list_price = {};
    if (criteria.min_price) {
      where.list_price.gte = criteria.min_price as number;
    }
    if (criteria.max_price) {
      where.list_price.lte = criteria.max_price as number;
    }
  }

  if (criteria.min_beds) {
    where.bedrooms_total = { gte: criteria.min_beds as number };
  }

  if (criteria.min_baths) {
    where.bathrooms_full = { gte: criteria.min_baths as number };
  }

  if (criteria.min_sqft) {
    where.living_area = { gte: criteria.min_sqft as number };
  }

  if (criteria.status && Array.isArray(criteria.status)) {
    where.status = { in: criteria.status as string[] };
  } else {
    where.status = "Active";
  }

  // Always filter to displayable listings
  where.idx_display_yn = true;
  where.owner_opt_out = false;

  return where;
}
