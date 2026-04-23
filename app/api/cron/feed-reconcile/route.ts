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

// Allow up to 120s — Trestle fetch paginates through ~10K records across ~10
// HTTP calls at ~1-2s each, plus per-ghost transactions.
export const maxDuration = 120;

const GHOST_ABORT_CAP = 2000;

const TERMINAL_STATUSES = new Set([
  "Closed", "Sold", "Leased", "Rented",
  "Withdrawn", "Expired", "Cancelled",
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

    // 2. Our DB Active set (RLS-sourced only)
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

    // 3. Diff
    const ghosts = ourActive.filter(
      (r) => !TERMINAL_STATUSES.has(r.status) && !trestleIds.has(r.listing_id),
    );

    // 4. Safety cap
    if (ghosts.length > GHOST_ABORT_CAP) {
      console.error(
        `[feed-reconcile] ABORT — ghost count ${ghosts.length} exceeds cap ${GHOST_ABORT_CAP}. ` +
        `Likely Trestle fetch failure (partial result). Not transitioning.`,
      );
      return NextResponse.json({
        success: false,
        aborted: true,
        reason: "ghost_count_exceeds_safety_cap",
        trestle_active: trestleIds.size,
        our_active: ourActive.length,
        ghosts_detected: ghosts.length,
        cap: GHOST_ABORT_CAP,
        duration_ms: Date.now() - startTime,
      }, { status: 503 });
    }

    // 5. Transition each ghost
    const now = new Date();
    let updated = 0;
    let errors = 0;
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
      ghosts_transitioned: updated,
      ghosts_errored: errors,
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
