// GET /api/cron/search-alerts
// Daily cron: runs alert-enabled saved searches on the canonical Search universe and emails
// new matches. Protected by CRON_SECRET header (Vercel Cron).
//
// Search Consolidation Packet 2 — the pipeline is separated, in this order:
//   canonical Saved Search universe (the SAME executor as live Agent Search; identical
//     canonical criteria are settled ONCE per invocation and reused)
//   → alert delta ("modified since last alert"): a delivery rule over the COMPLETE universe,
//     decided by source modification time, never a Search criterion and never a page filter
//   → remove listings ALREADY DELIVERED — ONE history per audience: a Lead's canonical
//     ClientListingAction "sent" (any saved search, any workflow); an agent-only alert's own
//     search_alert_delivered audit trail — a later modification never re-sends "New"
//   → delivery cap / universe order
//   → hydrate
//   → lead-linked: ensure a LOCAL Listing identity for every provider DTO before sending
//     (the CRM's own ensure-listing mechanism; Cotality-source-owned; no fabricated facts) —
//     a listing that cannot be ensured is not sent
//   → email
//   → after a successful send, ONE transaction: client history + delivery evidence + cadence.
//   → the search_run audit records what ACTUALLY happened (emailed = listings in the sent email).
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/sendgrid";
import { listingAlertEmail } from "@/lib/email/templates";
import { escapeHtml } from "@/lib/sanitize";
import { CRITERIA_VERSION, resolveStoredCriteria } from "@/lib/search/engine/saved-search";
import { hydrateRows, rowsModifiedSince, settledUniverseFor, universeKeyOf } from "@/lib/search/engine/executor";
import type { SettledUniverse } from "@/lib/search/engine/universe";
import { canonicalizeForLead, commitDelivery, excludeDelivered, loadDeliveryHistory } from "@/lib/search/alert-delivery-history";
import { SEARCH_SELECT_FIELDS } from "@/lib/search/engine/select";
import { recordSearchRun, type SearchRunDelta } from "@/lib/search/search-run-recorder";

export const maxDuration = 60;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://mallan.nyc";
/** Listings delivered per alert email (the email template renders at most this many). */
export const ALERT_DELIVERY_CAP = 10;

/**
 * Alert line for one DTO.
 *
 * REBNY §2.05 address-display gate: the DTO's `addressDisplayYN` is the mapper's reading of
 * the provider's InternetAddressDisplayYN (explicit false = withheld; null = displayable under
 * the IDX Plus pre-filter). When withheld, the STREET and the UNIT are both suppressed — a unit
 * number is part of the address. The permitted neighborhood / borough may still be shown.
 */
export function alertLine(l: Record<string, unknown>): { address: string; price: string; beds: number | string; baths: number | string; url: string } {
  const addressWithheld = l.addressDisplayYN === false;
  const area = String(l.neighborhood || l.borough || "New York");
  const street = addressWithheld ? "Address Available on Request" : String(l.address || "Address Available on Request");
  const unit = !addressWithheld && l.unit ? ` #${String(l.unit)}` : "";
  const price = typeof l.price === "number" ? `$${l.price.toLocaleString()}` : "Price on request";
  return {
    address: `${street}${unit}, ${area}`,
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
    // One settle per canonical universe per invocation. Keyed by the exact universe identity
    // (criteria without paging). Identical criteria across saved searches reuse it.
    const universeMemo = new Map<string, Promise<SettledUniverse>>();
    let universeSettles = 0;
    let universeReuses = 0;
    let providerPages = 0;
    const universeFor = (c: Parameters<typeof settledUniverseFor>[0]): Promise<SettledUniverse> => {
      const key = universeKeyOf(c);
      const hit = universeMemo.get(key);
      if (hit) { universeReuses++; return hit; }
      universeSettles++;
      const pending = settledUniverseFor(c, false).then((r) => { providerPages += r.universe.providerPages; return r.universe; });
      universeMemo.set(key, pending);
      return pending;
    };
    const startedAt = Date.now();

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
        const runCriteria = { criteria_version: CRITERIA_VERSION, params: resolved.params, criteria_state: resolved.state };
        const recordRun = (delta: SearchRunDelta, universe: SettledUniverse) => recordSearchRun({
          savedSearchId: search.id.toString(),
          actor: { userType: "system", userId: null, actorUserId: null },
          resultCount: universe.total,
          limit: ALERT_DELIVERY_CAP,
          offset: 0,
          source: "search_alert_cron",
          criteria: runCriteria,
          universe: { total: universe.total, countMeaning: universe.countMeaning },
          delta,
        });

        // 1. The canonical universe — complete, same membership and order as live Search.
        const universe = await universeFor(resolved.criteria);
        // 2. The delta over the COMPLETE universe (never the first page).
        const delta = rowsModifiedSince(universe, since);
        // 3. Never "New" twice: ONE history per audience, decided BEFORE the cap, over the whole delta.
        const history = await loadDeliveryHistory({ savedSearchId: search.id, leadId: search.lead_id, candidateListingIds: delta.rows.map((r) => r.listingId) });
        const { fresh, excluded } = excludeDelivered(delta.rows, history);
        // 4. Delivery cap in universe order.
        const capped = fresh.slice(0, ALERT_DELIVERY_CAP);
        const runDelta: SearchRunDelta = {
          since: since.toISOString(),
          matched: delta.rows.length,
          unknownTimestamp: delta.unknownTimestamp,
          alreadyDelivered: excluded.byAlertHistory,
          alreadySentToLead: excluded.bySentToLead,
          candidates: fresh.length,
          capped: capped.length,
          hydrationMissing: 0,
          gateExcluded: 0,
          unrepresentable: 0,
          emailed: 0,
          delivered: 0,
          sendSuccess: false,
        };

        if (capped.length === 0) {
          // Nothing new for this audience: the clock advances (the delta window moves on), the
          // stored total is refreshed, and the run is recorded with emailed = 0.
          await prisma.savedSearch.update({
            where: { id: search.id },
            data: { last_alert_sent: now, result_count: universe.total },
          });
          await recordRun(runDelta, universe);
          skipped++;
          continue;
        }

        // 5. Hydrate. The template has no image, so no media is fetched for these rows.
        const hydrated = await hydrateRows(capped, { select: SEARCH_SELECT_FIELDS, media: false });
        runDelta.hydrationMissing = hydrated.missing.length;
        runDelta.gateExcluded = hydrated.gateExcluded.length;
        let toDeliver = hydrated.listings;
        let localIds: ReadonlyMap<string, bigint> = history.localIdByListingId;

        // 6. Lead-linked: canonical local identity BEFORE the send. "Do not send an item to a
        //    Lead unless the system can durably remember that the Lead received it." The
        //    inventory type is the saved search's own (sale / rental universe), never inferred.
        if (search.lead_id != null && toDeliver.length > 0) {
          const c = await canonicalizeForLead(toDeliver, history.localIdByListingId, resolved.criteria.workflow === "rental" ? "rent" : "sale");
          localIds = c.localIdByListingId;
          toDeliver = c.deliverable;
          runDelta.unrepresentable = c.unrepresentable.length;
          if (c.unrepresentable.length > 0) {
            await prisma.auditEvent.create({
              data: {
                action: "search_alerts_cron_delivery_unrepresentable",
                entity_type: "saved_search",
                entity_id: search.id.toString(),
                user_type: "system",
                user_id: null,
                changes: { lead_id: search.lead_id.toString(), listings: c.unrepresentable },
              },
            }).catch(() => {});
          }
        }

        if (toDeliver.length === 0) {
          // Every candidate failed hydration, a gate, or canonicalization: nothing may be shown
          // in its place. Recorded; the clock does not advance.
          errored++;
          await prisma.auditEvent.create({
            data: {
              action: "search_alerts_cron_delivery_unavailable",
              entity_type: "saved_search",
              entity_id: search.id.toString(),
              user_type: "system",
              user_id: null,
              changes: { capped: capped.length, missing: hydrated.missing, gateExcluded: hydrated.gateExcluded, unrepresentable: runDelta.unrepresentable },
            },
          }).catch(() => {});
          await recordRun(runDelta, universe);
          continue;
        }

        // 7. Email.
        const formattedListings = toDeliver.map(alertLine);
        const html = listingAlertEmail(formattedListings, escapeHtml(clientName || "there"));
        const subject = `${toDeliver.length} New Listing${toDeliver.length !== 1 ? "s" : ""} Matching "${search.name}"`;
        const result = await sendEmail(email, subject, html);

        if (result.success) {
          // 8. ONE transaction: client history + delivery evidence + cadence/result. Only the
          //    listings actually in the email. (The window between the provider accepting the
          //    message and this commit is the unavoidable external-service gap — see the
          //    delivery-history module.) A failed commit is an error: the email went out, the
          //    database does not remember it, and the next run may re-send — reported, not hidden.
          const emailedIds = toDeliver.map((l) => String(l.id));
          const emailedKeys = emailedIds.map((id) => capped.find((r) => r.listingId === id)?.listingKey ?? null);
          try {
            await commitDelivery({ savedSearchId: search.id, leadId: search.lead_id, listingIds: emailedIds, listingKeys: emailedKeys, localIdByListingId: localIds, now, resultCount: universe.total });
          } catch (commitErr) {
            errored++;
            runDelta.emailed = emailedIds.length;
            runDelta.delivered = 0;
            runDelta.sendSuccess = true;
            await prisma.auditEvent.create({
              data: {
                action: "search_alerts_cron_history_commit_failed",
                entity_type: "saved_search",
                entity_id: search.id.toString(),
                user_type: "system",
                user_id: null,
                changes: { emailed: emailedIds, error: commitErr instanceof Error ? commitErr.message : String(commitErr) },
              },
            }).catch(() => {});
            await recordRun(runDelta, universe);
            continue;
          }
          sent++;
          runDelta.emailed = emailedIds.length;
          runDelta.delivered = emailedIds.length;
          runDelta.sendSuccess = true;
          await recordRun(runDelta, universe);
        } else {
          errored++;
          await recordRun(runDelta, universe);
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

    const elapsedMs = Date.now() - startedAt;
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
          universeSettles,
          universeReuses,
          providerPages,
          elapsedMs,
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
      universeSettles,
      universeReuses,
      providerPages,
      elapsedMs,
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
