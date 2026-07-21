/**
 * Demand Index — Signal Collector + Indexer
 *
 * Collects hyperlocal demand signals from:
 * 1. First-party search/behavioral data (BehavioralEvent, IntentEvent)
 * 2. NYC Open Data via SODA API (building permits, DOB filings)
 *
 * Computes composite DemandIndex per neighborhood.
 * Checks DemandAlert thresholds and fires notifications.
 *
 * No MLS data involved — all public or first-party.
 */
import prisma from "@/lib/prisma";
import { soda, getSocrataToken } from "@/lib/soda";
import {
  materialValuesEqual,
  newWritePathCounters,
  type WritePathCounters,
} from "@/lib/idx/write-suppression";

const SIGNAL_WEIGHTS = {
  search_volume: 0.35,
  intent_events: 0.25,
  building_permits: 0.20,
  price_momentum: 0.20,
};

// Normalize a value to 0-100 given a benchmark max
function norm(value: number, max: number): number {
  return Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
}

/**
 * Collect first-party demand signals for all neighborhoods.
 */
async function collectFirstPartySignals(): Promise<Map<string, { searches: number; intents: number }>> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
  const map = new Map<string, { searches: number; intents: number }>();

  // Search volume by neighborhood from BehavioralEvent
  const searchEvents = await prisma.behavioralEvent.groupBy({
    by: ["listing_id"],
    where: {
      event_type: { in: ["search_narrow", "building_deep_dive", "return_visit"] },
      recorded_at: { gte: thirtyDaysAgo },
    },
    _count: true,
  });

  // Map listing_ids to neighborhoods
  const listingIds = searchEvents
    .map((e) => e.listing_id)
    .filter((id): id is string => id !== null);

  if (listingIds.length > 0) {
    const listings = await prisma.listing.findMany({
      where: { listing_id: { in: listingIds } },
      select: { listing_id: true, neighborhood: true },
    });
    const nhMap = new Map(listings.map((l) => [l.listing_id, l.neighborhood]));

    for (const e of searchEvents) {
      const nh = e.listing_id ? nhMap.get(e.listing_id) : null;
      if (!nh) continue;
      const entry = map.get(nh) || { searches: 0, intents: 0 };
      entry.searches += e._count;
      map.set(nh, entry);
    }
  }

  // Intent events by neighborhood
  const intentEvents = await prisma.buyerIntentProfile.findMany({
    where: { last_event_at: { gte: thirtyDaysAgo } },
    select: { preferred_neighborhoods: true },
  });

  for (const profile of intentEvents) {
    const neighborhoods = profile.preferred_neighborhoods || [];
    for (const nh of neighborhoods) {
      const entry = map.get(nh) || { searches: 0, intents: 0 };
      entry.intents++;
      map.set(nh, entry);
    }
  }

  return map;
}

/**
 * Collect NYC building permit signals from SODA (if token available).
 */
async function collectPermitSignals(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const token = getSocrataToken();
  if (!token) return map;

  const permitDataset = process.env.SODA_DATASET_DOB_PERMITS || "ipu4-2vj7";
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split("T")[0];

  try {
    const rows = await soda<{ community_board: string; _count?: string }>({
      resource: permitDataset,
      select: "community_board, count(*) as _count",
      where: `issuance_date > '${thirtyDaysAgo}' AND job_type = 'NB'`,
      order: "_count DESC",
      limit: 100,
    });

    for (const row of rows) {
      const cb = row.community_board || "Unknown";
      map.set(cb, Number(row._count || 0));
    }
  } catch (err) {
    console.warn("[demand-index] SODA permit fetch failed:", err instanceof Error ? err.message : err);
  }

  return map;
}

/**
 * Deterministic logical identity window for a composite demand signal
 * (Phase 3, surface F — seller/demand-signal reconciliation).
 *
 * Identity = (signal_type, neighborhood, source, UTC-day of period_end).
 * Re-runs inside the same UTC day RECONCILE the existing row (update when
 * values/metadata materially changed, no-op otherwise) instead of inserting
 * a duplicate logical signal. A new UTC day starts a new row — the table
 * remains a daily time series.
 *
 * `period_start` / `period_end` describe the rolling observation window AS
 * OF THE LAST MATERIAL CHANGE; an unchanged re-run intentionally does not
 * slide them (that alone would be pure churn).
 */
export function demandSignalIdentityWindow(now: Date): { gte: Date; lt: Date } {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) };
}

/**
 * Advisory-lock namespace for demand-signal reconciliation (int4 classid of
 * pg_advisory_xact_lock(int4,int4)). Arbitrary but stable — the pair
 * (classid, objid) must simply never collide with another lock user.
 */
const DEMAND_SIGNAL_LOCK_CLASS = 20260721;

/**
 * Deterministic 31-bit FNV-1a hash of the logical signal identity, used as
 * the objid of the advisory xact lock so overlapping collector runs for the
 * SAME identity serialize their findMany→create window. Collisions between
 * different identities only cost extra serialization, never correctness.
 */
export function demandSignalLockKey(identity: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < identity.length; i++) {
    h ^= identity.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h & 0x7fffffff;
}

/**
 * Batch compute demand index for all neighborhoods.
 *
 * Phase 3 write-suppression (surfaces E + F):
 *   - `demand_signals`: reconciled by logical identity (see
 *     demandSignalIdentityWindow) — never blind-inserted per run.
 *   - `demand_indices`: written only when the composite result (score,
 *     trend, trend_delta, components) materially changed. `signal_count` is
 *     run-order telemetry and `last_computed` means "last MATERIAL result
 *     change" — neither justifies a write on its own.
 */
export async function batchComputeDemandIndex(): Promise<{
  neighborhoods: number;
  signals: number;
  alertsFired: number;
  /**
   * Pre-existing duplicate rows found inside identity windows this run.
   * They are NEVER deleted here (no silent cleanup) — only counted so the
   * condition is visible. The canonical (earliest) row is the one
   * reconciled; extras stop growing because every run deterministically
   * targets the canonical row. Durable prevention needs a DB unique
   * constraint (migration — requires Maya approval; NOT applied here).
   */
  duplicate_signal_rows_detected: number;
  write_paths: {
    demand_signals: WritePathCounters;
    demand_indices: WritePathCounters;
  };
}> {
  const now = new Date();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
  const periodStart = thirtyDaysAgo;
  const periodEnd = now;

  // Collect signals
  const [firstParty, permits] = await Promise.all([
    collectFirstPartySignals(),
    collectPermitSignals(),
  ]);

  // Get all distinct neighborhoods from DB
  const neighborhoods = await prisma.listing.findMany({
    where: { status: { in: ["Active", "ComingSoon", "ActiveUnderContract"] } },
    select: { neighborhood: true },
    distinct: ["neighborhood"],
  });

  const nhList = neighborhoods
    .map((n) => n.neighborhood)
    .filter((n): n is string => n !== null && n.length > 0);

  let signalCount = 0;
  let alertsFired = 0;
  let duplicateSignalRowsDetected = 0;
  const signalCounters = newWritePathCounters();
  const indexCounters = newWritePathCounters();

  // Benchmarks for normalization (estimated from typical NYC activity)
  const maxSearches = Math.max(...Array.from(firstParty.values()).map((v) => v.searches), 10);
  const maxIntents = Math.max(...Array.from(firstParty.values()).map((v) => v.intents), 5);

  for (const nh of nhList) {
    const fp = firstParty.get(nh) || { searches: 0, intents: 0 };
    const permitCount = permits.get(nh) || 0;

    // Store raw signals — RECONCILED by logical identity (surface F), never
    // blind-inserted. Provenance fields (signal_type / neighborhood / source)
    // are identity and are never rewritten on reconcile.
    //
    // Correction 5 — collision-safety: the findMany→create/update window runs
    // inside an interactive transaction holding a pg advisory xact lock keyed
    // on the logical identity, so two OVERLAPPING collector runs serialize
    // and cannot both insert. Pre-existing duplicates inside the window are
    // NEVER deleted — the EARLIEST row (collected_at ASC) is the
    // deterministic canonical target, extras are counted + reported only.
    // NOTE (reported, not applied): the durable cross-connection guarantee is
    // a DB unique constraint on the logical identity (expression index on
    // (signal_type, neighborhood, source, day-bucket of period_end)) — that
    // is a migration and requires Maya approval.
    const signalValue = fp.searches + fp.intents;
    const signalNormalized = norm(fp.searches, maxSearches);
    const signalMetadata = { searches: fp.searches, intents: fp.intents, permits: permitCount };
    signalCounters.rows_checked++;
    const identityWindow = demandSignalIdentityWindow(now);
    const lockKey = demandSignalLockKey(
      `composite|${nh}|first_party|${identityWindow.gte.toISOString()}`,
    );
    const signalOutcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DEMAND_SIGNAL_LOCK_CLASS}::int4, ${lockKey}::int4)`;
      const windowRows = await tx.demandSignal.findMany({
        where: {
          signal_type: "composite",
          neighborhood: nh,
          source: "first_party",
          period_end: identityWindow,
        },
        orderBy: { collected_at: "asc" },
      });
      const duplicates = Math.max(0, windowRows.length - 1);
      const canonical = windowRows[0] ?? null;
      if (!canonical) {
        await tx.demandSignal.create({
          data: {
            signal_type: "composite",
            neighborhood: nh,
            value: signalValue,
            normalized: signalNormalized,
            source: "first_party",
            metadata: signalMetadata,
            period_start: periodStart,
            period_end: periodEnd,
          },
        });
        return { outcome: "inserted" as const, duplicates };
      }
      if (
        materialValuesEqual(canonical.value, signalValue) &&
        materialValuesEqual(canonical.normalized, signalNormalized) &&
        materialValuesEqual(canonical.metadata, signalMetadata)
      ) {
        // Same logical signal, same values → duplicate re-run; no write.
        return { outcome: "suppressed" as const, duplicates };
      }
      await tx.demandSignal.update({
        where: { id: canonical.id },
        data: {
          value: signalValue,
          normalized: signalNormalized,
          metadata: signalMetadata,
          period_start: periodStart,
          period_end: periodEnd,
        },
      });
      return { outcome: "updated" as const, duplicates };
    });
    duplicateSignalRowsDetected += signalOutcome.duplicates;
    if (signalOutcome.outcome === "inserted") {
      signalCounters.rows_inserted++;
    } else if (signalOutcome.outcome === "suppressed") {
      signalCounters.rows_suppressed_unchanged++;
    } else {
      signalCounters.rows_materially_changed++;
      signalCounters.rows_updated++;
    }
    signalCount++;

    // Compute composite score
    const searchScore = norm(fp.searches, maxSearches);
    const intentScore = norm(fp.intents, maxIntents);
    const permitScore = norm(permitCount, 20); // 20 new building permits/month = 100
    const priceScore = 50; // Placeholder — would need price trend data

    const compositeScore = Math.round(
      searchScore * SIGNAL_WEIGHTS.search_volume +
      intentScore * SIGNAL_WEIGHTS.intent_events +
      permitScore * SIGNAL_WEIGHTS.building_permits +
      priceScore * SIGNAL_WEIGHTS.price_momentum
    );

    // Get previous score for trend
    const prev = await prisma.demandIndex.findUnique({ where: { neighborhood: nh } });
    const prevScore = prev?.score ?? compositeScore;
    const delta = compositeScore - prevScore;
    const trend = delta > 5 ? "rising" : delta < -5 ? "falling" : "stable";
    const nextComponents = { searchScore, intentScore, permitScore, priceScore };

    // Phase 3 (surface E): write only when the composite RESULT changed.
    // `signal_count` (loop-position telemetry) and `last_computed` ("last
    // MATERIAL result change") never justify a write on their own.
    indexCounters.rows_checked++;
    const indexUnchanged =
      !!prev &&
      materialValuesEqual(prev.score, compositeScore) &&
      materialValuesEqual(prev.trend, trend) &&
      materialValuesEqual(prev.trend_delta, delta) &&
      materialValuesEqual(prev.components, nextComponents);

    let indexRow: { id: bigint } | null = prev;
    if (indexUnchanged) {
      indexCounters.rows_suppressed_unchanged++;
    } else {
      indexRow = await prisma.demandIndex.upsert({
        where: { neighborhood: nh },
        create: {
          neighborhood: nh,
          score: compositeScore,
          trend,
          trend_delta: delta,
          components: nextComponents,
          signal_count: signalCount,
          last_computed: now,
        },
        update: {
          score: compositeScore,
          trend,
          trend_delta: delta,
          components: nextComponents,
          signal_count: signalCount,
          last_computed: now,
        },
      });
      if (prev) {
        indexCounters.rows_materially_changed++;
        indexCounters.rows_updated++;
      } else {
        indexCounters.rows_inserted++;
      }
    }

    // Check alerts for this neighborhood (reuses the row already in hand —
    // the post-upsert re-read was itself avoidable load).
    const index = indexRow;
    if (index) {
      const alerts = await prisma.demandAlert.findMany({
        where: {
          demand_index_id: index.id,
          enabled: true,
        },
      });

      for (const alert of alerts) {
        if (compositeScore >= alert.threshold) {
          // Fire notification
          await prisma.notification.create({
            data: {
              recipient_type: "agent",
              recipient_id: alert.agent_id,
              channel: "in_app",
              type: "demand_alert",
              title: `Demand Alert: ${nh}`,
              body: `Demand score for ${nh} reached ${compositeScore} (threshold: ${alert.threshold}).`,
              data: { neighborhood: nh, score: compositeScore, alert_id: alert.id.toString() },
              status: "pending",
            },
          });
          await prisma.demandAlert.update({
            where: { id: alert.id },
            data: { last_triggered: now, last_value: compositeScore },
          });
          alertsFired++;
        }
      }
    }
  }

  return {
    neighborhoods: nhList.length,
    signals: signalCount,
    alertsFired,
    duplicate_signal_rows_detected: duplicateSignalRowsDetected,
    write_paths: { demand_signals: signalCounters, demand_indices: indexCounters },
  };
}
