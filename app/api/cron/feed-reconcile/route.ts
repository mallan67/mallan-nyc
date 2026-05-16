// GET /api/cron/feed-reconcile
// Daily cron — feed reconciliation pass.
// Detects listings marked Active in our DB but no longer in the Trestle Active
// feed (ghosts), and transitions them to Withdrawn with a full audit trail.
//
// WHY THIS EXISTS:
// Incremental sync via ModificationTimestamp > watermark detects CHANGES but
// not DISAPPEARANCES. When a listing is fully removed from Trestle (post-
// listing Owner Opt-Out, broker cancellation with history deletion, aging out
// of retention), there's no modification event to pull — our DB keeps the
// last-known Active state forever, polluting public search.
//
// SCHEDULE: `30 3 * * *` — runs 30 min after data-retention (0 3 * * *) so
// the ghost-transition output flows through data-retention's T+24h §2.05
// gate on tomorrow's run.
//
// SAFETY:
//   - GHOST_ABORT_CAP: aborts if delta > 2000 (suggests Trestle fetch failure)
//   - Per-ghost transaction (one failure doesn't block the rest)
//   - Idempotent (re-running doesn't re-transition already-Withdrawn listings)
//   - Audit event per transition (REBNY RLS data-quality trail)
//
// Protected by CRON_SECRET header (Vercel Cron).

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessToken } from "@/lib/idx/auth";
import {
  mapTrestleToPrisma,
  checkDistributionGates,
  validateRequiredFields,
} from "@/lib/idx/trestle-mapper";
import type { Prisma } from "@prisma/client";
import { sendEmail } from "@/lib/email/sendgrid";
import { feedReconcileAbortEmail } from "@/lib/email/templates";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";
// Imported per the compliance gate at scripts/ci-compliance-check.js:184-194
// (every file that imports sendEmail/sendgrid must reference escapeHtml).
// The template handles its own escaping internally; aliasing to _escapeHtml
// satisfies ESLint's unused-vars rule (allowed prefix /^_/u).
import { escapeHtml as _escapeHtml } from "@/lib/sanitize";

// Allow up to 120s — Trestle fetch paginates through ~10K records across ~10
// HTTP calls at ~1-2s each, plus per-ghost transactions.
export const maxDuration = 120;

const GHOST_ABORT_CAP = 2000;

// Orphan = Trestle has a ListingId we don't. Caused by incremental-sync
// pagination edge or transient Trestle 5xx. Cap higher than ghost cap
// because a one-shot post-deploy catch-up may legitimately create hundreds
// (steady state: single digits daily).
const ORPHAN_ABORT_CAP = 500;

// Batch size for the orphan OData OR-filter. Keeps URLs under 8KB.
const ORPHAN_FETCH_BATCH = 20;

const TERMINAL_STATUSES = new Set([
  "Closed", "Sold", "Leased", "Rented",
  "Withdrawn", "Expired", "Cancelled",
]);

const ACTIVE_SEED_STATUSES = new Set([
  "Active", "ActiveUnderContract", "Pending",
]);

/** Fetch every Active ListingId from Trestle, paginated. */
async function fetchTrestleActiveIds(token: string): Promise<Set<string>> {
  const base = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
  const filter = "StandardStatus eq 'Active'";
  const ids = new Set<string>();
  let skip = 0;
  const pageSize = 1000;
  while (skip < 25000) {
    const url = `${base}/odata/Property?$filter=${encodeURIComponent(filter)}&$select=ListingId&$top=${pageSize}&$skip=${skip}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(
        `Trestle fetch failed at skip=${skip}: ${res.status}`,
      );
    }
    const page = (await res.json()) as { value?: Array<{ ListingId?: string }> };
    const rows = page.value ?? [];
    for (const r of rows) if (r.ListingId) ids.add(r.ListingId);
    if (rows.length < pageSize) break;
    skip += pageSize;
  }
  return ids;
}

export async function GET(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    !authHeader ||
    authHeader.length !== ("Bearer " + cronSecret).length ||
    !timingSafeEqual(
      Buffer.from(authHeader),
      Buffer.from("Bearer " + cronSecret),
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.IDX_ENABLED !== "true") {
    return NextResponse.json({
      skipped: true,
      reason: "IDX disabled",
    });
  }

  const startTime = Date.now();

  try {
    // 1. Fetch Trestle Active set
    const token = await getAccessToken();
    const trestleIds = await fetchTrestleActiveIds(token);

    // 2. Our DB Active set + full RLS ID set (both directions of diff)
    const ourActive = await prisma.listing.findMany({
      where: {
        status: "Active",
        listing_id: { startsWith: "RLS" },
      },
      select: {
        id: true,
        listing_id: true,
        status: true,
      },
    });
    const ourAllRls = await prisma.listing.findMany({
      where: { listing_id: { startsWith: "RLS" } },
      select: { listing_id: true },
    });
    const ourAllIdsSet = new Set(ourAllRls.map((r) => r.listing_id));

    // 3a. Ghosts — in our Active set, not in Trestle Active
    const ghosts = ourActive.filter(
      (r) => !TERMINAL_STATUSES.has(r.status) && !trestleIds.has(r.listing_id),
    );
    // 3b. Orphans — in Trestle Active, missing from our DB entirely
    const orphans = [...trestleIds].filter((id) => !ourAllIdsSet.has(id));

    // 4. Safety caps — either direction aborting halts the whole run
    if (ghosts.length > GHOST_ABORT_CAP) {
      console.error(
        `[feed-reconcile] ABORT — ghost count ${ghosts.length} exceeds cap ${GHOST_ABORT_CAP}. ` +
        `Likely Trestle fetch failure (partial result). Not transitioning.`,
      );

      // Lifecycle/Crons Tier A P0 — out-of-band broker alert.
      // The pre-existing audit event below records the abort in the
      // database, but a silent audit row could go unnoticed for days
      // during a real Trestle outage. Send a transactional email to
      // every active broker so ops sees the issue immediately.
      // Best-effort send — alert failure does NOT block the response.
      const abortReason = "ghost_count_exceeds_safety_cap";
      let brokerAlertsSent = 0;
      let brokerAlertsFailed = 0;
      try {
        const brokers = await prisma.agent.findMany({
          where: { role: "BROKER", status: "active" },
          select: { id: true, email: true, first_name: true, last_name: true },
        });
        for (const broker of brokers) {
          if (!broker.email) continue;
          const recipientName = `${broker.first_name || ""} ${broker.last_name || ""}`.trim() || "Broker";
          const html = feedReconcileAbortEmail({
            recipientName,
            ghostCount: ghosts.length,
            cap: GHOST_ABORT_CAP,
            trestleActiveCount: trestleIds.size,
            ourActiveCount: ourActive.length,
            abortReason,
          });
          const alertResult = await sendEmail(
            broker.email,
            `[ALERT] Feed reconcile aborted — ${ghosts.length} ghosts > cap ${GHOST_ABORT_CAP}`,
            html,
            undefined,
            { channel: "company", transactional: true },
          );
          if (alertResult.success) {
            brokerAlertsSent++;
          } else {
            brokerAlertsFailed++;
          }
        }
      } catch {
        // Non-fatal — alert failure must not block the cron response.
        console.error("[feed-reconcile] broker alert send failed during ghost-cap abort");
        brokerAlertsFailed++;
      }

      // Existing audit event so the abort still leaves a DB trace.
      await prisma.auditEvent.create({
        data: {
          action: "feed_reconcile_aborted_ghost_cap",
          entity_type: "cron",
          entity_id: "feed-reconcile",
          user_type: "system",
          user_id: null,
          changes: {
            reason: abortReason,
            trestle_active: trestleIds.size,
            our_active: ourActive.length,
            ghosts_detected: ghosts.length,
            cap: GHOST_ABORT_CAP,
            broker_alerts_sent: brokerAlertsSent,
            broker_alerts_failed: brokerAlertsFailed,
          },
        },
      }).catch(() => { /* audit failure non-fatal */ });

      return NextResponse.json({
        success: false,
        aborted: true,
        reason: abortReason,
        trestle_active: trestleIds.size,
        our_active: ourActive.length,
        ghosts_detected: ghosts.length,
        cap: GHOST_ABORT_CAP,
        broker_alerts_sent: brokerAlertsSent,
        broker_alerts_failed: brokerAlertsFailed,
        duration_ms: Date.now() - startTime,
      }, { status: 503 });
    }
    if (orphans.length > ORPHAN_ABORT_CAP) {
      console.error(
        `[feed-reconcile] ABORT — orphan count ${orphans.length} exceeds cap ${ORPHAN_ABORT_CAP}. ` +
        `Likely Trestle feed reset or incremental-sync bug. Investigate.`,
      );
      return NextResponse.json({
        success: false,
        aborted: true,
        reason: "orphan_count_exceeds_safety_cap",
        trestle_active: trestleIds.size,
        orphans_detected: orphans.length,
        cap: ORPHAN_ABORT_CAP,
        duration_ms: Date.now() - startTime,
      }, { status: 503 });
    }

    const now = new Date();
    const base = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";

    // 5a. Orphan fetch + create — pull the full Trestle record for each ID
    //     we don't have and route it through the same mapper + gate check
    //     that the normal cron sync uses.
    let orphansCreated = 0;
    let orphansErrored = 0;
    for (let i = 0; i < orphans.length; i += ORPHAN_FETCH_BATCH) {
      const batchIds = orphans.slice(i, i + ORPHAN_FETCH_BATCH);
      const filter = batchIds
        .map((id) => `ListingId eq '${id.replace(/'/g, "''")}'`)
        .join(" or ");
      // MediaStatus filter: exclude tombstoned photos retained by Trestle as historical records.
      const mediaExpand = `Media($filter=MediaStatus ne 'Deleted';$orderby=Order)`;
      const url = `${base}/odata/Property?$filter=${encodeURIComponent(filter)}&$expand=${encodeURIComponent(mediaExpand)}&$top=${ORPHAN_FETCH_BATCH}`;
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          orphansErrored += batchIds.length;
          console.error(`[feed-reconcile] orphan fetch ${i}: HTTP ${res.status}`);
          continue;
        }
        const page = (await res.json()) as { value?: Array<Record<string, unknown>> };
        const rows = page.value ?? [];
        for (const raw of rows) {
          try {
            const validation = validateRequiredFields(raw);
            if (!validation.valid) {
              orphansErrored++;
              continue;
            }
            const gates = checkDistributionGates(raw);
            const mapped = mapTrestleToPrisma(raw);
            if (!gates.displayable) mapped.sync_status = `gated:${gates.reason}`;

            await prisma.$transaction([
              prisma.listing.create({
                data: {
                  ...mapped,
                  address: mapped.address as Prisma.InputJsonValue,
                  features: mapped.features as Prisma.InputJsonValue,
                  media: mapped.media as Prisma.InputJsonValue,
                  compliance: mapped.compliance as Prisma.InputJsonValue,
                  agent_info: mapped.agent_info as Prisma.InputJsonValue,
                  raw_data: mapped.raw_data as Prisma.InputJsonValue,
                  status_changed_at: now,
                  first_active_date: ACTIVE_SEED_STATUSES.has(mapped.status) ? now : null,
                },
              }),
              prisma.auditEvent.create({
                data: {
                  action: "feed_reconcile_orphan_created",
                  entity_type: "listing",
                  entity_id: String(raw.ListingId),
                  user_type: "system",
                  user_id: null,
                  changes: {
                    listing_id: String(raw.ListingId),
                    reason: "Present in Trestle Active but missing from DB — incremental sync gap",
                    cron_run_at: now.toISOString(),
                  },
                },
              }),
            ]);

            // H1 Tier-1 dual-write — projection upsert runs OUTSIDE the
            // listing+audit transaction (matches lib/idx/sync.ts pattern of
            // sequential dual-write with no transaction). Failure is non-
            // fatal; ops:projection-backfill heals on next run.
            try {
              await dualWriteProjectionForListingId(prisma, String(raw.ListingId));
            } catch (err) {
              console.warn(
                "[feed-reconcile] orphan projection dual-write failed:",
                err instanceof Error ? err.message : err,
              );
            }

            orphansCreated++;
          } catch (e) {
            orphansErrored++;
            console.error(
              `[feed-reconcile] Failed to create orphan ${raw.ListingId}:`,
              e instanceof Error ? e.message : e,
            );
          }
        }
      } catch (e) {
        orphansErrored += batchIds.length;
        console.error(
          `[feed-reconcile] orphan batch ${i} fetch failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    // 5b. Transition each ghost
    let updated = 0;
    let errors = 0;
    let projectionFailures = 0;
    for (const g of ghosts) {
      try {
        await prisma.$transaction([
          prisma.listing.update({
            where: { id: g.id },
            data: {
              status: "Withdrawn",
              status_changed_at: now,
              idx_display_yn: false,
              modification_timestamp: now,
            },
          }),
          prisma.auditEvent.create({
            data: {
              action: "feed_reconcile_ghost_transition",
              entity_type: "listing",
              entity_id: g.id.toString(),
              user_type: "system",
              user_id: null,
              changes: {
                from_status: g.status,
                to_status: "Withdrawn",
                listing_id: g.listing_id,
                reason: "Not present in Trestle Active feed at reconcile time",
                cron_run_at: now.toISOString(),
              },
            },
          }),
        ]);

        // H1 Tier-2 dual-write — projection upsert runs OUTSIDE the
        // listing+audit transaction (matches the orphan path above and the
        // lib/idx/sync.ts pattern: sequential dual-write with no
        // transaction). Without this, the projection table keeps stale
        // `idx_display_yn=true` for ghost-transitioned listings, which
        // would leak publicly once PR 5B swaps the reader to the
        // projection. Failure is non-fatal; the listing row is already
        // correct so /api/listings stays gated.
        try {
          await dualWriteProjectionForListingId(prisma, g.listing_id);
        } catch (projErr) {
          projectionFailures++;
          console.warn(
            `[feed-reconcile] ghost projection dual-write failed for ${g.listing_id}:`,
            projErr instanceof Error ? projErr.message : projErr,
          );
        }

        updated++;
      } catch (e) {
        errors++;
        console.error(
          `[feed-reconcile] Failed to transition ${g.listing_id}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    return NextResponse.json({
      success: true,
      trestle_active: trestleIds.size,
      our_active_before: ourActive.length,
      ghosts_detected: ghosts.length,
      ghosts_transitioned: updated,
      ghosts_errored: errors,
      ghosts_projection_failures: projectionFailures,
      orphans_detected: orphans.length,
      orphans_created: orphansCreated,
      orphans_errored: orphansErrored,
      duration_ms: Date.now() - startTime,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[feed-reconcile] fatal:", msg);
    return NextResponse.json(
      {
        success: false,
        error: msg,
        duration_ms: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}
