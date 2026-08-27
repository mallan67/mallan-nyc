// GET /api/cron/data-retention
// Daily cron job: enforce data retention policies per NY SHIELD Act + REBNY.
// - Purge expired sessions (24h TTL)
// - Purge audit logs older than 2 years
// - T+24h: Flag terminal listings for IDX removal (REBNY RLS §2.05) — ALWAYS runs
//            (OPS-009 carve-out: display compliance, not archiving)
// - T+30d: Null media array on terminals (R2 holds images, JSON pointer safe to drop)
//            — gated under ARCHIVE_ENABLED (OPS-009: archive-family destructive write)
// - T+180d: Archive terminal listings — copy summary to listings_archive,
//            strip heavy JSON, mark sync_status='archived'. Keeps row for FK integrity.
//            — gated under ARCHIVE_ENABLED (OPS-009 fail-closed: OFF unless "true")
// Protected by CRON_SECRET header.
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";
import { buildingAndManifestInvalidationTags, listingCacheTag, newRevalidationCounters, safeRevalidateTags, SEARCH_CACHE_TAG } from "@/lib/cache/public-cache";
import { ARCHIVE_SELECT, archiveOneListing } from "@/lib/retention/archive-terminals";
import { archiveControlState, archiveWritesEnabled } from "@/lib/retention/archive-controls";
import { purgeExpiredDiagnostics } from "@/lib/retention/system-diagnostic-cleanup";

export const maxDuration = 60;

// Batch caps to keep a single cron run under the 60s budget
const T30_BATCH_CAP = 1000;
const T180_BATCH_CAP = 500;

// Mirrors ARCHIVE_TERMINAL_STATUSES in lib/retention/archive-terminals.ts.
// Both spellings of canceled are present on purpose: `Canceled` (one L) is
// the live Cotality value written raw by the Trestle sync, `Cancelled` (two
// Ls) is the invented value the CRM write path stored. This list is used as
// `status: { in: [...] }` at both call sites below, so a missing spelling is
// a silently skipped row, not an error.
const TERMINAL_STATUSES = ["Closed", "Sold", "Leased", "Rented", "Withdrawn", "Expired", "Canceled", "Cancelled"] as const;

// (T+180 archive summary/strip helpers moved to lib/retention/archive-terminals.ts — Gate 6,
// shared with the controlled operator drain so the two paths cannot drift.)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader || authHeader.length !== ("Bearer " + cronSecret).length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results: Record<string, number | string> = {};

  // OPS-009 two-flag archive controls (fail-closed; Maya decision 2026-07-02).
  // ARCHIVE_ENABLED gates every archive-family write in this cron (T+30d media-null +
  // T+180 archive loop). Absent/empty/anything-but-"true" = OFF → those steps are skipped.
  // It does NOT gate the T+24h off-market display removal (step 3) — see the carve-out
  // comment there. The pre-existing ARCHIVE_T180_BACKLOG_ENABLED flag keeps its
  // clock-selection semantics unchanged (see step 3c).
  const archiveWrites = archiveWritesEnabled();
  results.archive_control_state = archiveControlState();

  // 1. Purge expired sessions (24h TTL)
  const sessionCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const expiredSessions = await prisma.session.deleteMany({
    where: { expires_at: { lt: sessionCutoff } },
  });
  results.expired_sessions_purged = expiredSessions.count;

  // 1b. Purge expired MFA sessions (5-min TTL, but clean up anything >1h old)
  const mfaCutoff = new Date(now.getTime() - 60 * 60 * 1000);
  const expiredMfaSessions = await prisma.mfaSession.deleteMany({
    where: { expires_at: { lt: mfaCutoff } },
  });
  results.expired_mfa_sessions_purged = expiredMfaSessions.count;

  // 2. Purge audit logs older than 2 years (REBNY RLS retention floor = 2 years)
  // Prior behavior only COUNTED — fixed to actually delete per the 2-year compliance boundary.
  // Trestle/IDX access logs (`trestle_access`, `trestle_data_access`) have a 12-month floor
  // but are safe to retain for 2 years under the broader audit policy.
  //
  // EXEMPTION — `email_unsubscribed` is NEVER purged: it is the DURABLE commercial-email
  // suppression ledger (lib/email/suppression.ts), especially for NON-Lead recipients who
  // have no Lead.last_unsubscribe_at. Purging it after 2 years would silently make an
  // opted-out recipient emailable again — a CAN-SPAM violation. Opt-outs must outlive the
  // 2-year audit floor.
  const auditCutoff = new Date();
  auditCutoff.setFullYear(auditCutoff.getFullYear() - 2);
  const purgedAudit = await prisma.auditEvent.deleteMany({
    where: {
      created_at: { lt: auditCutoff },
      action: { not: "email_unsubscribed" },
    },
  });
  results.audit_events_purged_over_2yr = purgedAudit.count;

  // 2b. Purge high-volume SYSTEM DIAGNOSTICS at 30 days.
  //
  // WHY THIS IS NOT A COMPLIANCE CHANGE. Step 2's 2-year cutoff is the REBNY
  // RLS audit-evidence floor. The actions purged here are not audit evidence:
  // they are opt-in high-volume operational diagnostics, already deduped and
  // capped per run where they are produced. They are WRITE-ONLY — verified
  // 2026-07-29, the only writer is lib/idx/sync.ts and no production code reads
  // them back.
  //
  // Scope comes from `lib/retention/system-diagnostic-actions.ts`, which
  // re-exports the producer's allowlist — see that file for why the indirection
  // exists and for the parity test that stops the two drifting. Because it is
  // an explicit allowlist and not a `LIKE 'idx_sync%'` pattern, per-run records
  // (`idx_sync_cron`, `media_sync_cron`) and every business or compliance
  // action keep the 2-year floor untouched.
  //
  // Measured 2026-07-29: 46,103 eligible rows / ~30 MB, all already >30 days.
  //
  // BOUNDED, NOT ONE BIG DELETE. That backlog is deleted in independently
  // committed batches of at most DIAGNOSTIC_BATCH_SIZE, capped at
  // DIAGNOSTIC_MAX_PER_INVOCATION per cron run, ordered by (created_at, id) and
  // claimed with FOR UPDATE SKIP LOCKED so overlapping invocations take
  // disjoint rows. An interrupted run resumes on the next invocation from the
  // oldest remaining row. See lib/retention/system-diagnostic-cleanup.ts.
  //
  // DIAGNOSTIC_DRY_RUN=true counts without deleting, using the identical
  // predicate — for the first production verification.
  // NO explicit maxRows. The cleanup module is the SOLE authority on the
  // invocation cap, so the shared canary contract actually governs the
  // scheduled path: unset RETENTION_DIAGNOSTIC_MAX_ROWS => 100 rows, a set
  // value widens it, and it is clamped to the reviewed ceiling.
  //
  // A previous revision computed the cap here and passed it explicitly. That
  // silently BYPASSED the canary — with the env unset it resolved to the full
  // 10,000, so the first production deletion would have been unconstrained
  // while unit tests (which call the module directly) still showed 100.
  // Caller-level regression coverage: tests/runtime/retention-canary.test.ts.
  const diagnosticPurge = await purgeExpiredDiagnostics(prisma, now, {
    dryRun: process.env.DIAGNOSTIC_DRY_RUN === "true",
  });
  results.audit_events_diagnostics_purged = diagnosticPurge.rows;
  results.audit_events_diagnostics_bytes = diagnosticPurge.bytes;
  results.audit_events_diagnostics_batches = diagnosticPurge.batches;
  results.audit_events_diagnostics_stopped = diagnosticPurge.stopped;
  if (diagnosticPurge.error) {
    results.audit_events_diagnostics_error = diagnosticPurge.error;
  }

  // 3. Flag closed/terminal listings not yet marked (REBNY RLS Sec. 2.05: remove within 24h)
  // Note: filterDisplayableDbListings() already excludes non-active statuses in real-time,
  // so this is a belt-and-suspenders DB cleanup for any edge cases (direct DB queries, etc.)
  //
  // ⚠️ MANDATORY CARVE-OUT (OPS-009): this T+24h step runs UNCONDITIONALLY — it is REBNY
  // UCBA Art. I §6 / RLS §2.05 display compliance (off-market removal), NOT archiving.
  // ARCHIVE_ENABLED must NEVER gate this step. Do not move it behind `archiveWrites`.
  const closedCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const staleClosedListings = await prisma.listing.findMany({
    where: {
      status: { in: ["Closed", "Sold", "Leased", "Rented", "Withdrawn", "Expired", "Cancelled"] },
      status_changed_at: { lt: closedCutoff },
      idx_display_yn: true, // still marked for IDX display
    },
    select: { id: true, listing_id: true, status: true, status_changed_at: true, address: true },
  });

  let closedProjectionFailures = 0;
  if (staleClosedListings.length > 0) {
    await prisma.listing.updateMany({
      where: { id: { in: staleClosedListings.map((l) => l.id) } },
      data: { idx_display_yn: false },
    });

    await prisma.auditEvent.createMany({
      data: staleClosedListings.map((l) => ({
        action: "idx_display_yn_disabled",
        entity_type: "listing",
        entity_id: l.id.toString(),
        user_type: "system",
        user_id: null,
        changes: {
          reason: "Terminal/closed listing >24h — REBNY RLS Sec. 2.05 compliance",
          status: l.status,
          status_changed_at: l.status_changed_at?.toISOString(),
        },
      })),
    });

    // One Cycle W1 — a §2.05 removal must refresh the cached public pages in
    // the SAME cycle (comfortably inside the 24h REBNY window). Failures are
    // logged + counted, never thrown.
    {
      const revalidation = newRevalidationCounters();
      safeRevalidateTags(
        [
          ...staleClosedListings.map((l) => listingCacheTag(l.listing_id)),
          // display removal must also drop each listing from its BUILDING's
          // cached payload in the same cycle (§2.05)
          ...buildingAndManifestInvalidationTags(...staleClosedListings.map((l) => l.address)),
          SEARCH_CACHE_TAG,
        ],
        revalidation,
      );
      console.log(
        `[data-retention] cache revalidation: ${revalidation.pages_revalidated} tags, ${revalidation.revalidation_failures} failures`,
      );
    }

    // H1 Tier-2 dual-write — keep ListingSearchProjection.idx_display_yn in
    // lockstep with the Listing flip above. Without this, the projection
    // retains `idx_display_yn=true` for terminal listings, which would
    // leak publicly once PR 5B swaps the reader from Listing to the
    // projection. Sequential (post-batch) sync matches the lib/idx/sync.ts
    // pattern. Per-row try/catch so a single bad row doesn't abort the
    // batch; failures are surfaced in the response for ops monitoring.
    for (const l of staleClosedListings) {
      try {
        await dualWriteProjectionForListingId(prisma, l.listing_id);
      } catch (projErr) {
        closedProjectionFailures++;
        console.warn(
          `[data-retention] projection dual-write failed for ${l.listing_id}:`,
          projErr instanceof Error ? projErr.message : projErr,
        );
      }
    }
  }
  results.closed_listings_removed_from_idx = staleClosedListings.length;
  results.closed_listings_projection_failures = closedProjectionFailures;

  // 3b. T+30d: Null media array on terminal listings past 30 days.
  // R2 holds the actual image bytes; the listings.media JSON is just a pointer array.
  // Public search already excludes terminal statuses, so nulling media has no user impact.
  // Skips listings already archived (sync_status='archived') — Step 3c handles those.
  //
  // OPS-009 PLACEMENT DECISION: this step IS gated under ARCHIVE_ENABLED. It is an
  // archive-family DESTRUCTIVE write (drops the media JSON pointer array ahead of the
  // T+180 strip), not a display-compliance step — the T+24h removal above (step 3,
  // unconditional) already guarantees UCBA/RLS off-market display compliance, so gating
  // this step has zero compliance impact. Fail-closed OFF unless ARCHIVE_ENABLED="true".
  if (archiveWrites) {
    const thirtyDayCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const terminalOver30d = await prisma.listing.findMany({
      where: {
        status: { in: [...TERMINAL_STATUSES] },
        status_changed_at: { lt: thirtyDayCutoff },
        sync_status: { not: "archived" },
        // Only touch listings that still have media — cheap filter
        NOT: { media: { equals: [] } },
      },
      select: { id: true },
      take: T30_BATCH_CAP,
    });

    if (terminalOver30d.length > 0) {
      await prisma.listing.updateMany({
        where: { id: { in: terminalOver30d.map((l) => l.id) } },
        data: { media: [] as unknown as Prisma.InputJsonValue },
      });
    }
    results.t30d_media_nulled = terminalOver30d.length;
  } else {
    results.t30d_media_nulled = 0;
  }

  // 3c. T+180d: Archive terminal listings.
  // Copy summary fields into listings_archive, then strip heavy JSON from the
  // source listing and mark sync_status='archived'. We do NOT delete the row —
  // several FKs (PriceHistory, MarketingActivity, Showing, etc.) reference it
  // and preserving referential integrity matters more than the row overhead.
  // The archive table satisfies NY DOS 6-year recordkeeping requirements.
  //
  // OPS-009 (Maya decision 2026-07-02): the whole loop is gated under ARCHIVE_ENABLED
  // (fail-closed OFF). OFF → skip entirely, report archive_skipped_reason, and still
  // write the data_retention_run audit event below. MAINTENANCE/DRAIN → run as before
  // (500-cap unchanged). ARCHIVE_T180_BACKLOG_ENABLED below is NOT a write gate — it
  // only selects the eligibility clock, exactly as before.
  if (archiveWrites) {
    const oneEightyDayCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    // Archive eligibility — default-OFF backlog flag (Archive Clock PR-2, #415).
    // Flag OFF (default): UNCHANGED legacy predicate `status_changed_at < cutoff`, so merging PR-2
    // drains ZERO new rows — the nightly cron keeps its current behavior until Maya flips the flag
    // (the explicit gate). NULL status_changed_at stays excluded (NULL < ts is NULL).
    // Flag ON: age off the STABLE `terminal_since` clock (Archive Clock PR-1, #446) instead of
    // status_changed_at / modification_timestamp. Both of those are re-stamped by idx-sync on every
    // re-emit (price/photo/modification tick), so a terminal row looks perpetually "recent" and never
    // ages. `terminal_since` is set ONCE on the non-terminal→terminal transition from a stable
    // sale/off-market date and is never re-stamped — the correct archive clock.
    //   - Rows with `terminal_since IS NULL` (no derivable stable date, or the gated backfill not yet
    //     run) fail `{ lt }` (NULL < ts is NULL) and are NEVER auto-archived. Intended fail-safe — we
    //     do not invent terminal dates (decision Q2, 2026-06-25 PR-2 plan). Until the gated backfill
    //     (Gate 3) populates terminal_since, the flag-ON predicate matches NOTHING.
    //   - The 500/run cap (T180_BATCH_CAP) and the archive UPDATE-strip are unchanged: this only
    //     changes WHICH rows qualify when enabled.
    const archiveBacklogEnabled = process.env.ARCHIVE_T180_BACKLOG_ENABLED === "true";
    const eligibilityWhere: Prisma.ListingWhereInput = archiveBacklogEnabled
      ? { terminal_since: { lt: oneEightyDayCutoff } }
      : { status_changed_at: { lt: oneEightyDayCutoff } };

    const archiveWhere: Prisma.ListingWhereInput = {
      status: { in: [...TERMINAL_STATUSES] },
      sync_status: { not: "archived" },
      ...eligibilityWhere,
    };
    const toArchive = await prisma.listing.findMany({
      where: archiveWhere,
      select: ARCHIVE_SELECT,
      take: T180_BATCH_CAP,
    });

    // Per-row archive via the shared core (lib/retention/archive-terminals.ts) — the SAME logic the
    // Gate 6 operator drain (scripts/drain-archive-backlog.ts) uses, so the nightly cron and the
    // controlled drain can never drift. archiveOneListing re-asserts `archiveWhere` atomically inside
    // the write transaction (a row that reactivated between SELECT and write is skipped, not stripped).
    let archivedCount = 0;
    for (const l of toArchive) {
      const r = await archiveOneListing(prisma, l, archiveWhere);
      if (r.ok) archivedCount++;
    }
    results.t180d_listings_archived = archivedCount;
  } else {
    // OFF state — nothing archives until Maya sets ARCHIVE_ENABLED=true (OPS-009).
    results.t180d_listings_archived = 0;
    results.archive_skipped_reason = "ARCHIVE_ENABLED off";
    console.log(
      "[data-retention] archive family skipped (T+30d media-null + T+180 archive loop) — " +
        "ARCHIVE_ENABLED is not 'true' (OPS-009 fail-closed OFF state). " +
        "T+24h display removal ran unconditionally (UCBA carve-out).",
    );
  }

  // 4. Clean up expired portal invite tokens (72h TTL)
  const tokenCutoff = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const expiredTokens = await prisma.lead.updateMany({
    where: {
      portal_token: { not: null },
      portal_token_expires_at: { lt: tokenCutoff },
    },
    data: {
      portal_token: null,
      portal_token_expires_at: null,
    },
  });
  results.expired_portal_tokens_cleared = expiredTokens.count;

  // 5. Clean up read notifications older than 90 days
  const notifCutoff = new Date();
  notifCutoff.setDate(notifCutoff.getDate() - 90);
  const oldNotifications = await prisma.notification.deleteMany({
    where: {
      read_at: { not: null },
      created_at: { lt: notifCutoff },
    },
  });
  results.read_notifications_purged = oldNotifications.count;

  // 6. Clean up stale geocode cache entries older than 1 year
  const geoCutoff = new Date();
  geoCutoff.setFullYear(geoCutoff.getFullYear() - 1);
  const oldGeoEntries = await prisma.geocodeCache.deleteMany({
    where: { created_at: { lt: geoCutoff } },
  });
  results.stale_geocode_cache_purged = oldGeoEntries.count;

  // Log the retention run
  await prisma.auditEvent.create({
    data: {
      action: "data_retention_run",
      entity_type: "system",
      entity_id: "cron",
      user_type: "system",
      user_id: null,
      changes: results,
    },
  });

  return NextResponse.json({ ...results });
}
