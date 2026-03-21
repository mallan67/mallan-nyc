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
 * Batch compute demand index for all neighborhoods.
 */
export async function batchComputeDemandIndex(): Promise<{
  neighborhoods: number;
  signals: number;
  alertsFired: number;
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

  // Benchmarks for normalization (estimated from typical NYC activity)
  const maxSearches = Math.max(...Array.from(firstParty.values()).map((v) => v.searches), 10);
  const maxIntents = Math.max(...Array.from(firstParty.values()).map((v) => v.intents), 5);

  for (const nh of nhList) {
    const fp = firstParty.get(nh) || { searches: 0, intents: 0 };
    const permitCount = permits.get(nh) || 0;

    // Store raw signals
    await prisma.demandSignal.create({
      data: {
        signal_type: "composite",
        neighborhood: nh,
        value: fp.searches + fp.intents,
        normalized: norm(fp.searches, maxSearches),
        source: "first_party",
        metadata: { searches: fp.searches, intents: fp.intents, permits: permitCount },
        period_start: periodStart,
        period_end: periodEnd,
      },
    });
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

    await prisma.demandIndex.upsert({
      where: { neighborhood: nh },
      create: {
        neighborhood: nh,
        score: compositeScore,
        trend,
        trend_delta: delta,
        components: { searchScore, intentScore, permitScore, priceScore },
        signal_count: signalCount,
        last_computed: now,
      },
      update: {
        score: compositeScore,
        trend,
        trend_delta: delta,
        components: { searchScore, intentScore, permitScore, priceScore },
        signal_count: signalCount,
        last_computed: now,
      },
    });

    // Check alerts for this neighborhood
    const index = await prisma.demandIndex.findUnique({ where: { neighborhood: nh } });
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

  return { neighborhoods: nhList.length, signals: signalCount, alertsFired };
}
