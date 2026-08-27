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
import { buildingAndManifestInvalidationTags, listingCacheTag, safeRevalidateTags, SEARCH_CACHE_TAG } from "@/lib/cache/public-cache";
import { computeTerminalSincePatch } from "@/lib/listings/terminal-since";
import {
  upsertListingMedia,
  updateListingMediaSummary,
  type UpsertListingMediaInput,
} from "@/lib/idx/media-sync";
import {
  selectOrphanChunk,
  ORPHAN_CHUNK_SIZE,
  ORPHAN_TOTAL_SANITY_CAP,
} from "@/lib/idx/orphan-chunk";
// Imported per the compliance gate at scripts/ci-compliance-check.js:184-194
// (every file that imports sendEmail/sendgrid must reference escapeHtml).
// The template handles its own escaping internally; aliasing to _escapeHtml
// satisfies ESLint's unused-vars rule (allowed prefix /^_/u).
import { escapeHtml as _escapeHtml } from "@/lib/sanitize";

// P1C6b: 300s (was 120). Chunked orphan catch-up math at chunk=300:
// ~15 $expand batches (~25s) + ~300 creates with avg 13.1 media rows (probe
// 2026-06-12) ≈ ~105s DB work + two id-set fetches (~30s) ≈ ~160s estimate —
// exceeds 120, fits 300 with ~2x margin. A hard in-run time budget
// (ORPHAN_TIME_BUDGET_MS) additionally stops the import loop early and
// reports the remainder, so the estimate can be wrong without consequence.
export const maxDuration = 300;

const GHOST_ABORT_CAP = 2000;
// Floor guard (status-truth hardening 2026-07-06): abort if the ghost set is more than this
// FRACTION of our active book. A non-200 fetch already throws (fail-closed), but an HTTP-200
// EMPTY or PARTIAL feed makes most of the book look "departed" — a feed failure, not reality.
// The ratio scales with book size where the absolute cap does not (a boutique active book
// smaller than GHOST_ABORT_CAP would never trip the cap on an empty feed).
const GHOST_ABORT_RATIO = 0.5;

// Orphan = Trestle has a ListingId we don't (eligible set: Active/Pending/
// AUC). P1C6b: abort-all on the orphan side is REPLACED by deterministic
// chunked import (lib/idx/orphan-chunk.ts — ORPHAN_CHUNK_SIZE per run,
// ListingId-ASC order, archive-excluded) because the probe-sized backlog
// (1,361 incident-era Pending residue) would otherwise block the catch-up
// forever. A SANITY abort remains at ORPHAN_TOTAL_SANITY_CAP (feed-reset
// signal). The DESTRUCTIVE ghost direction keeps abort-all semantics above.

// Hard wall-clock budget for the orphan import loop — stops early and
// reports the remainder; keeps the run far inside maxDuration.
const ORPHAN_TIME_BUDGET_MS = 240_000;

// Batch size for the orphan OData OR-filter. Keeps URLs under 8KB.
const ORPHAN_FETCH_BATCH = 20;

// Both spellings of canceled — `Canceled` is the live Cotality value written
// raw by the Trestle sync, `Cancelled` the invented one the CRM path stored.
const TERMINAL_STATUSES = new Set([
  "Closed", "Sold", "Leased", "Rented",
  "Withdrawn", "Expired", "Canceled", "Cancelled",
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

/**
 * P1C6: Pending / ActiveUnderContract ListingIds — extends ORPHAN detection
 * ONLY. Live probe 2026-06-11 proved the 3 media-sync ghosts are
 * StandardStatus=Pending, invisible to the Active-only diff BY DESIGN (not an
 * $expand failure — the route's expand form returned HTTP 200 with media).
 * SEPARATE query so `fetchTrestleActiveIds` stays byte-identical: the
 * ghost-transition semantics and that query's paging headroom under the 25K
 * skip cap are untouched.
 */
async function fetchTrestleEligibleNonActiveIds(token: string): Promise<Set<string>> {
  const base = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
  // Non-active ON-MARKET set = Pending ∪ ActiveUnderContract ∪ ComingSoon. Used to extend
  // orphan detection AND (status-truth fix 2026-07-05) to SPARE ghosts: a local-Active
  // listing that transitioned to any of these is still live and must NOT be withdrawn.
  const filter =
    "StandardStatus eq 'Pending' or StandardStatus eq 'ActiveUnderContract' or StandardStatus eq 'ComingSoon'";
  const ids = new Set<string>();
  let skip = 0;
  const pageSize = 1000;
  while (skip < 25000) {
    const url = `${base}/odata/Property?$filter=${encodeURIComponent(filter)}&$select=ListingId&$top=${pageSize}&$skip=${skip}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Trestle eligible-non-active fetch failed at skip=${skip}: ${res.status}`);
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
    // Non-active on-market set (Pending ∪ AUC ∪ ComingSoon). Extends orphan detection AND
    // (status-truth fix 2026-07-05) is unioned with the Active set to spare ghosts below.
    const trestleNonActiveEligible = await fetchTrestleEligibleNonActiveIds(token);
    // Full live on-market universe — the authority for "is this listing still live".
    const liveOnMarketIds = new Set<string>([...trestleIds, ...trestleNonActiveEligible]);

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
        address: true, // Building-Neon-wake: ghost withdrawal derives the exact building tag
      },
    });
    const ourAllRls = await prisma.listing.findMany({
      where: { listing_id: { startsWith: "RLS" } },
      select: { listing_id: true },
    });
    const ourAllIdsSet = new Set(ourAllRls.map((r) => r.listing_id));

    // 3a. Ghosts — in our Active set but NOT live on-market in ANY status.
    // STATUS-TRUTH FIX (2026-07-05, verified by the full DB↔Cotality census in
    // scripts/audit/reconcile-db-vs-live-cotality.mjs): the prior filter diffed ONLY the
    // Active fetch, so a listing that transitioned Active→Pending/AUC/ComingSoon vanished
    // from that set and was falsely marked Withdrawn — the census found 103 live rows
    // (6 Active, 97 Pending) suppressed this exact way. Spare every id that is live
    // on-market in ANY status; only genuinely-departed ids remain ghosts.
    const ghosts = ourActive.filter(
      (r) => !TERMINAL_STATUSES.has(r.status) && !liveOnMarketIds.has(r.listing_id),
    );
    // 3b. Orphans — in the Trestle ELIGIBLE set (Active/Pending/AUC, P1C6),
    // missing from our DB entirely. P1C6b: archive-excluded (an archived id
    // must NEVER be re-imported — Maya rule, even though the probe showed 0
    // today) and selected as a bounded deterministic chunk per run.
    const orphanIds = [...new Set([...trestleIds, ...trestleNonActiveEligible])].filter(
      (id) => !ourAllIdsSet.has(id),
    );

    // 4. Safety caps + FLOOR GUARDS — either direction aborting halts the whole run.
    // Floor (status-truth hardening 2026-07-06): a non-200 fetch already throws (fail-closed),
    // but an HTTP-200 EMPTY or PARTIAL feed would make the whole/most of the active book look
    // "departed" and mass-withdraw live listings. Abort fail-closed when the live on-market set
    // is empty, OR the ghost set exceeds GHOST_ABORT_RATIO of our active book, OR the absolute
    // GHOST_ABORT_CAP is exceeded.
    const liveFeedEmpty = liveOnMarketIds.size === 0;
    const ghostRatioCollapse =
      ourActive.length > 0 && ghosts.length / ourActive.length > GHOST_ABORT_RATIO;
    const ghostOverCap = ghosts.length > GHOST_ABORT_CAP;
    if (liveFeedEmpty || ghostRatioCollapse || ghostOverCap) {
      const abortReason = liveFeedEmpty
        ? "live_feed_empty"
        : ghostOverCap
          ? "ghost_count_exceeds_safety_cap"
          : "ghost_ratio_collapse";
      console.error(
        `[feed-reconcile] ABORT (${abortReason}) — ghosts=${ghosts.length} ` +
        `live_on_market=${liveOnMarketIds.size} our_active=${ourActive.length} cap=${GHOST_ABORT_CAP}. ` +
        `Empty/partial Trestle feed or fetch failure. Not transitioning.`,
      );

      // Lifecycle/Crons Tier A P0 — out-of-band broker alert.
      // The pre-existing audit event below records the abort in the
      // database, but a silent audit row could go unnoticed for days
      // during a real Trestle outage. Send a transactional email to
      // every active broker so ops sees the issue immediately.
      // Best-effort send — alert failure does NOT block the response.
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
            `[ALERT] Feed reconcile aborted (${abortReason}) — ghosts=${ghosts.length}, live_on_market=${liveOnMarketIds.size}`,
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
    // P1C6b: archive exclusion + deterministic chunk selection — AFTER the
    // ghost-cap check above so an aborting run does no extra DB work (and the
    // ghost-abort path stays byte-equivalent for its guard tests).
    const archivedIds = new Set(
      (
        await prisma.listingsArchive.findMany({
          where: { listing_id: { startsWith: "RLS" } },
          select: { listing_id: true },
        })
      )
        .map((r) => r.listing_id)
        .filter((id): id is string => typeof id === "string"),
    );
    const chunkResult = selectOrphanChunk(
      orphanIds.map((id) => ({ ListingId: id })),
      archivedIds,
    );
    const orphans = chunkResult.chunk.map((r) => r.ListingId);

    if (chunkResult.totalEligible > ORPHAN_TOTAL_SANITY_CAP) {
      console.error(
        `[feed-reconcile] ABORT — eligible orphan total ${chunkResult.totalEligible} exceeds sanity cap ${ORPHAN_TOTAL_SANITY_CAP}. ` +
        `Likely Trestle feed reset or broken local-id read (probe truth 2026-06-12: 1,361). Investigate.`,
      );
      return NextResponse.json({
        success: false,
        aborted: true,
        reason: "orphan_total_exceeds_sanity_cap",
        trestle_active: trestleIds.size,
        total_eligible: chunkResult.totalEligible,
        cap: ORPHAN_TOTAL_SANITY_CAP,
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
    let orphansWithMedia = 0;
    let orphansNoMedia = 0;
    let orphansMediaGated = 0;
    let orphanMediaErrors = 0;
    let orphanBudgetStopped = false;
    let orphansAttempted = 0;
    for (let i = 0; i < orphans.length; i += ORPHAN_FETCH_BATCH) {
      // P1C6b: hard wall-clock budget — stop importing, report the remainder.
      if (Date.now() - startTime > ORPHAN_TIME_BUDGET_MS) {
        orphanBudgetStopped = true;
        break;
      }
      const batchIds = orphans.slice(i, i + ORPHAN_FETCH_BATCH);
      orphansAttempted += batchIds.length;
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

            // Phase C: strip the legacy agent_info JSON from the spread; the 8 typed
            // agent columns remain in typedOnlyMapped (mapper emits them).
            const { agent_info: _agentInfoJson, ...typedOnlyMapped } = mapped;
            // Archive eligibility clock (#415): set terminal_since iff the orphan is created terminal.
            const terminalSinceCreate = computeTerminalSincePatch({
              previousStatus: undefined,
              newStatus: mapped.status,
              raw_data: mapped.raw_data as Record<string, unknown>,
              features: mapped.features as Record<string, unknown>,
              // #446: ExpirationDate is stripped from mapped.raw_data (PRIVATE_FIELDS); feed the
              // original un-stripped Trestle record's ExpirationDate as the Expired fallback (not persisted).
              expirationDateFallback: raw.ExpirationDate as string | undefined,
              now,
            });
            await prisma.$transaction([
              prisma.listing.create({
                data: {
                  ...typedOnlyMapped,
                  address: mapped.address as Prisma.InputJsonValue,
                  features: mapped.features as Prisma.InputJsonValue,
                  media: mapped.media as Prisma.InputJsonValue,
                  compliance: mapped.compliance as Prisma.InputJsonValue,
                  raw_data: mapped.raw_data as Prisma.InputJsonValue,
                  status_changed_at: now,
                  first_active_date: ACTIVE_SEED_STATUSES.has(mapped.status) ? now : null,
                  ...terminalSinceCreate,
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
                    reason: "Present in the Trestle eligible set (Active/Pending/AUC) but missing from DB — incremental sync gap",
                    standard_status: String(raw.StandardStatus || ""),
                    cron_run_at: now.toISOString(),
                  },
                },
              }),
            ]);

            // H1 Tier-1 dual-write — projection upsert runs OUTSIDE the
            // listing+audit transaction (matches lib/idx/sync.ts pattern of
            // sequential dual-write with no transaction). Failure is non-
            // fatal; ops:projection-backfill heals on next run.
            // One Cycle W1 — an orphan-recovered listing goes public again in
            // the SAME cycle. Never throws.
            // Orphan recovery makes the listing publicly visible again — its
            // building's cached payload must pick it up in the same cycle
            // (raw is a full Trestle record: StreetNumber/StreetName/PostalCode).
            safeRevalidateTags([
              listingCacheTag(String(raw.ListingId)),
              ...buildingAndManifestInvalidationTags(raw),
              SEARCH_CACHE_TAG,
            ]);
            try {
              await dualWriteProjectionForListingId(prisma, String(raw.ListingId));
            } catch (err) {
              console.warn(
                "[feed-reconcile] orphan projection dual-write failed:",
                err instanceof Error ? err.message : err,
              );
            }

            // P1C6 (Maya hard item): a created orphan must populate
            // listing_media or record a CLEAN no-media outcome — never
            // silently photoless-in-both-layers. The inline $expand payload
            // is NOT pagination-proven complete, so tombstoneVanished stays
            // FALSE (media-sync's complete-set path owns deletion truth);
            // worst case is missing rows that media-sync fills later, never
            // wrongly-deleted ones. mediaCount=0 is recorded, not faked.
            const rawMedia = Array.isArray(raw.Media)
              ? (raw.Media as UpsertListingMediaInput[])
              : [];
            if (!gates.displayable && rawMedia.length > 0) {
              // Tristle P1C6 (blocking): NEVER write media rows for a gated
              // orphan (Owner Opt-Out / Participant-Only / display-blocked /
              // terminal). The Phase-3 R2 mirror has no compliance join, so
              // gated rows would be mirrored to the PUBLIC bucket — trusting
              // the IDX Plus pre-filter here is the 2026-04-30 incident
              // class. Counted separately: this is a compliance skip, not a
              // clean no-media-at-source outcome.
              orphansMediaGated++;
            } else if (rawMedia.length > 0) {
              try {
                await upsertListingMedia(String(raw.ListingId), rawMedia, {
                  photosChangeTsSnapshot:
                    (raw.PhotosChangeTimestamp as string | undefined) ?? null,
                  tombstoneVanished: false,
                });
                await updateListingMediaSummary(String(raw.ListingId));
                orphansWithMedia++;
              } catch (mediaErr) {
                // Listing stays created (JSON media already written by the
                // create); table population failure is non-fatal + counted.
                orphanMediaErrors++;
                console.error(
                  `[feed-reconcile] orphan media population failed for ${raw.ListingId}:`,
                  mediaErr instanceof Error ? mediaErr.message : mediaErr,
                );
              }
            } else {
              orphansNoMedia++;
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
              // TRESTLE CURSOR SAFETY — `modification_timestamp: now` REMOVED
              // (post-correction audit, 2026-08-09).
              //
              // A ghost is by definition a row the Trestle sync wrote earlier
              // (it came from the feed), so `last_synced_from_trestle` is
              // non-null and the row sits INSIDE the cursor query:
              //   MAX(modification_timestamp) WHERE last_synced_from_trestle IS NOT NULL
              // Stamping local `now` made this row the MAX, pushing the
              // incremental filter `ModificationTimestamp gt SINCE` past every
              // genuine Trestle timestamp — so the next sync skipped real
              // upstream changes. That is the same hazard PR-S.6/S.7 closed for
              // the capped-batch and CRM-only-row cases; this daily cron
              // re-opened it every run that found a ghost.
              //
              // Nothing downstream needs the bump: the transition is recorded by
              // `status_changed_at` and `terminal_since` (both set here) plus the
              // audit event below, and data-retention ages rows off those two
              // clocks SPECIFICALLY because modification_timestamp is re-stamped
              // by idx-sync (data-retention/route.ts:270-273). MT keeps its last
              // real Trestle value, which is the honest one.
              // Archive eligibility clock (#415): ghosts are sourced from status='Active'
              // (all non-terminal) → Withdrawn is always a real non-terminal→terminal
              // transition; no stable off-market date for a ghost → wall-clock `now`.
              terminal_since: now,
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
        // One Cycle W1 — a ghost-withdrawn listing's cached page must drop
        // from public surfaces in the SAME cycle (§2.05). Never throws.
        // Ghost withdrawal removes the listing from public display — its
        // building's cached payload must drop it in the same cycle (§2.05).
        safeRevalidateTags([
          listingCacheTag(g.listing_id),
          ...buildingAndManifestInvalidationTags(g.address),
          SEARCH_CACHE_TAG,
        ]);
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
      trestle_eligible_nonactive: trestleNonActiveEligible.size,
      // P1C6b chunked catch-up counters (Maya's required set)
      total_eligible: chunkResult.totalEligible,
      chunk_size: ORPHAN_CHUNK_SIZE,
      imported_this_run: orphansCreated,
      remaining_after_run:
        chunkResult.remainingAfter + (orphans.length - orphansAttempted),
      with_media: orphansWithMedia,
      no_media: orphansNoMedia,
      gated_skipped: orphansMediaGated,
      archive_overlap: chunkResult.archiveOverlap,
      orphan_budget_stopped: orphanBudgetStopped,
      orphans_with_media: orphansWithMedia,
      orphans_no_media: orphansNoMedia,
      orphans_media_gated: orphansMediaGated,
      orphan_media_errors: orphanMediaErrors,
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
