// GET /api/cron/search-alerts
// Daily cron: runs alert-enabled saved searches on the canonical Search universe and emails
// new matches. Protected by CRON_SECRET header (Vercel Cron).
//
// Search Consolidation Packet 2 — the pipeline is separated, in this order:
//   canonical Saved Search universe (the SAME executor as live Agent Search)
//   → alert delta ("new since last alert"): a delivery rule over the COMPLETE universe,
//     decided by source modification time, never a Search criterion and never a page filter
//   → delivery cap / universe order
//   → email.
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/sendgrid";
import { listingAlertEmail } from "@/lib/email/templates";
import { escapeHtml } from "@/lib/sanitize";
import { CRITERIA_VERSION, resolveStoredCriteria } from "@/lib/search/engine/saved-search";
import { hydrateRows, rowsModifiedSince, settledUniverseFor } from "@/lib/search/engine/executor";
import { SEARCH_SELECT_FIELDS } from "@/lib/search/engine/select";
import { recordSearchRun } from "@/lib/search/search-run-recorder";

export const maxDuration = 60;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://mallan.nyc";
/** Listings delivered per alert email (the email template renders at most this many). */
export const ALERT_DELIVERY_CAP = 10;

/**
 * Alert line for one DTO.
 *
 * REBNY §2.05 address-display gate: the DTO's `addressDisplayYN` is the mapper's reading of
 * the provider's InternetAddressDisplayYN (explicit false = withheld; null = displayable under
 * the IDX Plus pre-filter). The mapper already replaces a withheld address, and this line
 * gates on the flag AGAIN so an email can never print a suppressed address whatever the
 * upstream text was.
 */
export function alertLine(l: Record<string, unknown>): { address: string; price: string; beds: number | string; baths: number | string; url: string } {
  const addressWithheld = l.addressDisplayYN === false;
  const address = addressWithheld ? "Address Available on Request" : String(l.address || "Address Available on Request");
  const unit = l.unit ? ` #${String(l.unit)}` : "";
  const area = String(l.neighborhood || l.borough || "New York");
  const price = typeof l.price === "number" ? `$${l.price.toLocaleString()}` : "Price on request";
  return {
    address: `${address}${unit}, ${area}`,
    price,
    beds: typeof l.beds === "number" ? l.beds : "—",
    baths: typeof l.baths === "number" ? l.baths : "—",
    url: `${BASE_URL}/listing/${String(l.id)}`,
  };
}

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
        // A saved search whose stored criteria the executor cannot reproduce EXACTLY gets no
        // alert — never a broader one. The row is left intact (no last_alert_sent bump) and the
        // skip is audited by name.
        const resolved = resolveStoredCriteria(search.criteria);
        if (resolved.state === "invalid") {
          skippedUnsupported++;
          await prisma.auditEvent.create({
            data: {
              action: "search_alerts_cron_skipped_unsupported",
              entity_type: "saved_search",
              entity_id: search.id.toString(),
              user_type: "system",
              user_id: null,
              changes: {
                code: "invalid_criteria",
                reasons: resolved.reasons,
                unsupported_criteria: resolved.unsupported,
              },
            },
          }).catch(() => {});
          continue;
        }

        // Cadence is a delivery rule; it never changes what the search means.
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

        // 1. The canonical universe — complete, same membership and order as live Search.
        const { universe } = await settledUniverseFor(resolved.criteria, false);
        // 2. The delta over the COMPLETE universe (never the first page).
        const delta = rowsModifiedSince(universe, since);
        // 3. Delivery cap in universe order.
        const delivered = delta.rows.slice(0, ALERT_DELIVERY_CAP);

        await recordSearchRun({
          savedSearchId: search.id.toString(),
          actor: { userType: "system", userId: null, actorUserId: null },
          resultCount: universe.total,
          limit: ALERT_DELIVERY_CAP,
          offset: 0,
          source: "search_alert_cron",
          criteria: { criteria_version: CRITERIA_VERSION, params: resolved.params, criteria_state: resolved.state },
          universe: { total: universe.total, countMeaning: universe.countMeaning },
          delta: { since: since.toISOString(), matched: delta.rows.length, delivered: delivered.length, unknownTimestamp: delta.unknownTimestamp },
        });

        if (delivered.length === 0) {
          await prisma.savedSearch.update({
            where: { id: search.id },
            data: { last_alert_sent: now, result_count: universe.total },
          });
          skipped++;
          continue;
        }

        // 4. Email. The template has no image, so no media is fetched for these rows.
        const hydrated = await hydrateRows(delivered, { select: SEARCH_SELECT_FIELDS, media: false });
        const newListings = hydrated.listings;
        if (newListings.length === 0) {
          // Every delivered row failed hydration or a gate: nothing may be shown in its place.
          errored++;
          await prisma.auditEvent.create({
            data: {
              action: "search_alerts_cron_delivery_unavailable",
              entity_type: "saved_search",
              entity_id: search.id.toString(),
              user_type: "system",
              user_id: null,
              changes: { delivered: delivered.length, missing: hydrated.missing, gateExcluded: hydrated.gateExcluded },
            },
          }).catch(() => {});
          continue;
        }

        const formattedListings = newListings.map(alertLine);

        const html = listingAlertEmail(formattedListings, escapeHtml(clientName || "there"));
        const subject = `${newListings.length} New Listing${newListings.length !== 1 ? "s" : ""} Matching "${search.name}"`;
        const result = await sendEmail(email, subject, html);

        if (result.success) {
          sent++;
          await prisma.savedSearch.update({
            where: { id: search.id },
            data: { last_alert_sent: now, result_count: universe.total },
          });

          // Durable per-client record of what was sent. ClientListingAction references the local
          // Listing row; a provider listing with no local row (not yet synced) cannot be linked.
          if (search.lead_id) {
            const ids = newListings.map((l) => String(l.id));
            const local = await prisma.listing.findMany({ where: { listing_id: { in: ids } }, select: { id: true, listing_id: true } });
            for (const row of local) {
              await prisma.clientListingAction.upsert({
                where: {
                  lead_id_listing_id_action: {
                    lead_id: search.lead_id,
                    listing_id: row.id,
                    action: "sent",
                  },
                },
                update: { created_at: now },
                create: {
                  lead_id: search.lead_id,
                  listing_id: row.id,
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
