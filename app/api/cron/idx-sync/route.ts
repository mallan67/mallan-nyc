// GET /api/cron/idx-sync
// Automated IDX sync cron — runs every 4 hours.
// Fetches incremental updates from Trestle and upserts to local DB.
// Protected by CRON_SECRET header (Vercel Cron).
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { syncListings, getLastSyncTimestamp } from "@/lib/idx/sync";
import { hasCredentials } from "@/lib/idx/auth";
import {
  createCotalityCollector,
  runWithCotalityTelemetry,
  snapshotCollector,
} from "@/lib/idx/cotality-telemetry";
import { isOneCycleActive } from "@/lib/idx/one-cycle-active";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader || authHeader.length !== ("Bearer " + cronSecret).length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.IDX_ENABLED !== "true" || !hasCredentials()) {
    return NextResponse.json({
      skipped: true,
      reason: "IDX disabled or credentials missing",
    });
  }

  const forceFull = req.nextUrl.searchParams.get('full') === 'true';

  // Concurrency guard — prevent overlapping sync runs. Skipped for a manual
  // full sync, and for the One Cycle orchestrated path: the orchestrator is
  // the single 10-minute concurrency unit (sequential members, one cycle every
  // 10 min), so this 10-minute AuditEvent lookback — which would FALSE-TRIGGER
  // at a 10-minute cadence — must not gate the orchestrated call. It remains
  // the overlap guard for manual / standalone invocation.
  //
  // The bypass proof is the CRON_SECRET carried in `x-one-cycle-member`
  // (timing-safe compared) — NOT the header's mere presence. Auth above already
  // rejected anyone without the secret (401), and a bare `x-one-cycle-member: 1`
  // does not match the secret, so the header alone can never bypass the guard.
  const memberToken = req.headers.get("x-one-cycle-member");
  const orchestrated =
    !!cronSecret &&
    !!memberToken &&
    memberToken.length === cronSecret.length &&
    timingSafeEqual(Buffer.from(memberToken), Buffer.from(cronSecret));

  // Machine-overlap guard: a standalone / manual invocation (INCLUDING
  // ?full=true) must NOT run while One Cycle is mid-cycle (a one_cycle_started
  // with no matching one_cycle_run). The orchestrated call itself is exempt —
  // it IS the machine. This runs before, and independent of, the ?full bypass.
  if (!orchestrated && (await isOneCycleActive(prisma))) {
    return NextResponse.json({
      skipped: true,
      reason: "blocked: One Cycle is active — standalone idx-sync must not overlap the machine",
    });
  }

  if (!forceFull && !orchestrated) {
    const recentSync = await prisma.auditEvent.findFirst({
      where: {
        action: "idx_sync_cron",
        created_at: { gte: new Date(Date.now() - 10 * 60 * 1000) }, // Within last 10 min
      },
      orderBy: { created_at: "desc" },
    });
    if (recentSync) {
      return NextResponse.json({ skipped: true, reason: "Sync already ran within last 10 minutes" });
    }
  }

  // Correlate durable Cotality telemetry with the One Cycle run (when orchestrated).
  const oneCycleRunId = req.headers.get("x-one-cycle-run-id");
  // Run-scoped, isolated collector — concurrent public/manual Cotality calls in
  // other async contexts cannot alter these counters.
  const cotalityCollector = createCotalityCollector("idx-sync", oneCycleRunId);

  try {
    const since = forceFull ? null : await getLastSyncTimestamp();

    // 2026-05-15 (PR-S.5): hard-cap scheduled cron batch at 500 records.
    //
    // Why: this route's `maxDuration` is 120 s (set both in `vercel.json`
    // and on `export const maxDuration` above). `syncListings` does:
    //   1. Paginated Trestle fetch (filter = ModificationTimestamp gt since),
    //   2. Per-record sequential DB findUnique + DOM compute + upsert
    //      (~80 ms per record on a warm Neon pooled connection),
    //   3. Post-loop batch media fetch (15 listings per batch, ~700 ms each)
    //      + per-listing updateMany to write media JSON back to DB.
    // The previous cap of 12,000 records is mathematically incompatible
    // with the 120 s window: even just the per-record loop alone is
    // 12,000 × 80 ms = 16 min, before accounting for Trestle pagination
    // or media batch follow-up. Production cron has been timing out
    // (504) for several hours — `ops:health` showed the sync watermark
    // 2.6 h stale at the time of this patch.
    //
    // 500 records / run at ~80 ms each = 40 s in the loop + ~25 s media
    // batches = ~65 s, comfortably under 120 s. The cron fires every 10
    // minutes, so a backlog of any realistic size drains in a handful
    // of runs (e.g. 2.6 h backlog ≈ 800 records ≈ 2 runs).
    //
    // Manual `?full=true` triggers also use this cap. To drain a very
    // large backlog manually, invoke the cron repeatedly; do NOT raise
    // the cap inline — escalate via a follow-up PR if needed (the
    // proposal in PR-S.5's design is Option 3: bulk findMany + chunked
    // $transaction upserts, which closes the per-record DB roundtrip
    // cost so a higher cap becomes safe).
    const SCHEDULED_MAX_RECORDS = 500;

    // All Cotality fetches inside syncListings run within the isolated
    // telemetry context so their counters attribute to THIS member run.
    const result = await runWithCotalityTelemetry(cotalityCollector, () =>
      syncListings({
        since: since || undefined,
        maxRecords: SCHEDULED_MAX_RECORDS,
        fullSync: forceFull || !since, // Full sync if forced or no previous sync
      }),
    );

    // Log audit
    await prisma.auditEvent.create({
      data: {
        action: "idx_sync_cron",
        entity_type: "listing",
        entity_id: "bulk",
        user_type: "system",
        user_id: null,
        // Cast: SyncResult now carries the Phase 3 write_paths counters
        // (plain typed interfaces, JSON-safe by construction).
        changes: {
          ...result,
          incremental: !!since,
          since: since?.toISOString() ?? null,
          outcome: "success",
          one_cycle_run_id: oneCycleRunId,
          cotality: snapshotCollector(cotalityCollector),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      success: true,
      ...result,
      cotality: snapshotCollector(cotalityCollector),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[IDX Sync Cron] Error:", msg);

    await prisma.auditEvent.create({
      data: {
        action: "idx_sync_cron_error",
        entity_type: "listing",
        entity_id: "bulk",
        user_type: "system",
        user_id: null,
        // Telemetry persists on FAILURE too — a 429 / retry / token refresh /
        // timeout / thrown request stays visible in the durable error audit.
        changes: {
          error: msg,
          outcome: "error",
          one_cycle_run_id: oneCycleRunId,
          cotality: snapshotCollector(cotalityCollector),
        } as unknown as Prisma.InputJsonValue,
      },
    }).catch(() => {}); // Don't let audit failure mask the real error

    return NextResponse.json(
      { error: `Sync failed: ${msg}` },
      { status: 500 }
    );
  }
}
