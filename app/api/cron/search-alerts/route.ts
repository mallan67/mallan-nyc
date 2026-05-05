// GET /api/cron/search-alerts
// Daily cron: runs saved searches through the shared SearchCore and emails
// new compliant matches. Protected by CRON_SECRET header (Vercel Cron).
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/sendgrid";
import { listingAlertEmail } from "@/lib/email/templates";
import { escapeHtml } from "@/lib/sanitize";
import { formatSearchAlertAddress, runProjectionListingSearch } from "@/lib/search/core";
import { recordSearchRun } from "@/lib/search/search-run-recorder";
import { canEnableAlertForCriteria } from "@/lib/search/criteria-to-prisma";

export const maxDuration = 60;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://mallan.nyc";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    !authHeader ||
    authHeader.length !== ("Bearer " + cronSecret).length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
    let skippedUnsupported = 0;

    for (const search of searches) {
      try {
        // P0-3 cron-side alert-gate: defense in depth. The
        // POST/PATCH gate at app/api/crm/saved-searches blocks NEW
        // alert-enabled rows whose criteria are projection-unsupported,
        // but pre-existing rows from before the gate landed may still
        // be `alert_enabled=true` with unsupported criteria. Skip them
        // here rather than silently sending mail derived from a strict
        // subset of the criteria. The savedSearch is left intact (no
        // last_alert_sent bump) so the agent's UI continues to surface
        // the alert as configured — the saved-search list-endpoint and
        // the modal both label these clearly.
        const criteria = search.criteria as Record<string, unknown>;
        const gate = canEnableAlertForCriteria(criteria || {});
        if (!gate.ok) {
          skippedUnsupported++;
          await prisma.auditEvent.create({
            data: {
              action: "search_alerts_cron_skipped_unsupported",
              entity_type: "saved_search",
              entity_id: search.id.toString(),
              user_type: "system",
              user_id: null,
              changes: {
                code: gate.code,
                unsupported_criteria: gate.unsupported,
              },
            },
          }).catch(() => {});
          continue;
        }

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

        const email = search.alert_email || search.lead?.email || search.agent?.email;
        if (!email) {
          skipped++;
          continue;
        }

        const clientName = search.lead
          ? `${search.lead.first_name || ""} ${search.lead.last_name || ""}`.trim()
          : search.agent
            ? `${search.agent.first_name || ""} ${search.agent.last_name || ""}`.trim()
            : "there";

        const since = search.last_alert_sent || new Date(now.getTime() - 24 * 60 * 60 * 1000);
        // PR 5E — second reader migrated to listing_search_projection.
        // modifiedSince is supported by the projection runner via the
        // mirrored `modified_at` column. Address suppression flows through
        // the included Listing's permission flags via formatSearchAlertAddress
        // below, preserving the existing alert formatting unchanged.
        const searchRun = await runProjectionListingSearch(prisma, criteria, {
          limit: 10,
          offset: 0,
          modifiedSince: since,
        });

        await recordSearchRun({
          savedSearchId: search.id.toString(),
          actor: {
            userType: "system",
            userId: null,
          },
          resultCount: searchRun.total,
          limit: searchRun.limit,
          offset: searchRun.offset,
          source: "search_alert_cron",
          criteria,
        });

        const newListings = searchRun.listings;
        if (newListings.length === 0) {
          await prisma.savedSearch.update({
            where: { id: search.id },
            data: { last_alert_sent: now },
          });
          skipped++;
          continue;
        }

        const formattedListings = newListings.map((listing) => ({
          address: formatSearchAlertAddress(listing),
          price: `$${Number(listing.list_price).toLocaleString()}`,
          beds: listing.bedrooms_total || 0,
          baths: listing.bathrooms_full || 0,
          url: `${BASE_URL}/listing/${listing.listing_id}`,
        }));

        const html = listingAlertEmail(formattedListings, escapeHtml(clientName || "there"));
        const subject = `${newListings.length} New Listing${newListings.length !== 1 ? "s" : ""} Matching "${search.name}"`;
        const result = await sendEmail(email, subject, html);

        if (result.success) {
          sent++;
          await prisma.savedSearch.update({
            where: { id: search.id },
            data: { last_alert_sent: now, result_count: searchRun.total },
          });

          if (search.lead_id) {
            for (const listing of newListings) {
              await prisma.clientListingAction.upsert({
                where: {
                  lead_id_listing_id_action: {
                    lead_id: search.lead_id,
                    listing_id: listing.id,
                    action: "sent",
                  },
                },
                update: { created_at: now },
                create: {
                  lead_id: search.lead_id,
                  listing_id: listing.id,
                  action: "sent",
                },
              }).catch(() => {});
            }
          }
        } else {
          errored++;
          // ── SMTP fail-loud (P0-B compliance gate) ──────────────────
          // When sendEmail returns _devMode=true the entire cron run
          // is doomed — every saved search will fail the same way.
          // Bail out early instead of churning through hundreds of
          // searches with no chance of delivery, write a loud audit
          // event, and return 503 so Vercel cron logs surface the
          // misconfiguration in ops dashboards. Lead/SavedSearch rows
          // are unaffected (cron is read-only on those).
          if (
            (result as { _devMode?: boolean })._devMode === true
          ) {
            const isProd =
              process.env.NODE_ENV === "production" ||
              process.env.VERCEL_ENV === "production";
            if (isProd) {
              console.error(
                "[Search Alerts Cron] SMTP_NOT_CONFIGURED — bailing out after first failed send. " +
                "Sent=" + sent + " skipped=" + skipped + " errored=" + errored + " of " + searches.length + ". " +
                "Set SMTP_USER and SMTP_PASS in Vercel production env."
              );
              await prisma.auditEvent.create({
                data: {
                  action: "search_alerts_cron_smtp_unconfigured",
                  entity_type: "saved_search",
                  entity_id: "bulk",
                  user_type: "system",
                  user_id: null,
                  changes: {
                    total: searches.length,
                    sent,
                    skipped,
                    errored,
                    skippedUnsupported,
                    code: "SMTP_NOT_CONFIGURED",
                  },
                },
              });
              return NextResponse.json(
                {
                  error: "SMTP not configured — cron bailed out",
                  code: "SMTP_NOT_CONFIGURED",
                  total: searches.length,
                  sent,
                  skipped,
                  errored,
                  skippedUnsupported,
                },
                { status: 503 }
              );
            }
          }
        }
      } catch (err) {
        console.error(`[Search Alerts] Error processing search ${search.id}:`, err);
        errored++;
      }
    }

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
          skippedUnsupported,
        },
      },
    });

    return NextResponse.json({
      success: true,
      total: searches.length,
      sent,
      skipped,
      errored,
      skippedUnsupported,
    });
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
