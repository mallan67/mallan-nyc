/**
 * Agent Performance Indexer — computes composite index + tier + rank
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import {
  materialValuesEqual,
  newWritePathCounters,
  type WritePathCounters,
} from '@/lib/idx/write-suppression';
import { COMPONENT_WEIGHTS, TIER_THRESHOLDS, ROLLING_MONTHS } from './config';
import { computeMonthlyMetrics, normalizeMetric } from './calculator';
import type { PerformanceComponents, PerformanceIndexResult, Tier, MonthlyMetrics } from './types';

/**
 * Compute performance index for a single agent using rolling N-month window.
 */
/**
 * Phase 3 write-suppression (item-6 inventory fix): both persistence paths
 * are write-on-change — an unchanged monthly metrics JSON and an unchanged
 * composite index perform ZERO writes. `last_computed` on the index row
 * means "last MATERIAL result change".
 */
export async function computePerformanceIndex(
  agentId: bigint,
  options?: { counters?: { agent_metrics: WritePathCounters; performance_index: WritePathCounters } },
): Promise<PerformanceIndexResult> {
  const now = new Date();
  const months: Date[] = [];
  for (let i = 0; i < ROLLING_MONTHS; i++) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }

  // Month keys exactly as the upsert builds them (local Y-M → UTC parse).
  const monthDates = months.map((month) => {
    const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    return new Date(monthStr + '-01');
  });

  // Prefetch stored monthly metrics in ONE query for write-on-change.
  const storedMonthRows = await prisma.agentMetrics.findMany({
    where: { agent_id: agentId, month: { in: monthDates } },
    select: { month: true, metrics: true },
  });
  const storedByMonth = new Map(
    storedMonthRows.map((r) => [new Date(r.month).toISOString(), r.metrics as unknown]),
  );

  // Compute or fetch metrics for each month
  const allMetrics: MonthlyMetrics[] = [];
  for (let i = 0; i < months.length; i++) {
    const metrics = await computeMonthlyMetrics(agentId, months[i]);

    const monthDate = monthDates[i];
    const stored = storedByMonth.get(monthDate.toISOString());
    const monthCounters = options?.counters?.agent_metrics;
    if (monthCounters) monthCounters.rows_checked++;
    if (stored !== undefined && materialValuesEqual(metrics as unknown, stored)) {
      // Historical months rarely change — skip the no-op rewrite.
      if (monthCounters) monthCounters.rows_suppressed_unchanged++;
    } else {
      await prisma.agentMetrics.upsert({
        where: { agent_id_month: { agent_id: agentId, month: monthDate } },
        create: {
          agent_id: agentId,
          month: monthDate,
          metrics: metrics as unknown as Prisma.InputJsonValue,
        },
        update: {
          metrics: metrics as unknown as Prisma.InputJsonValue,
        },
      });
      if (monthCounters) {
        if (stored !== undefined) {
          monthCounters.rows_materially_changed++;
          monthCounters.rows_updated++;
        } else {
          monthCounters.rows_inserted++;
        }
      }
    }

    allMetrics.push(metrics);
  }

  // Aggregate across months
  const components = aggregateComponents(allMetrics);

  // Weighted composite score
  const indexScore = Math.round(
    components.time_to_contact * COMPONENT_WEIGHTS.time_to_contact +
    components.conversion * COMPONENT_WEIGHTS.conversion +
    components.closing_speed * COMPONENT_WEIGHTS.closing_speed +
    components.compliance * COMPONENT_WEIGHTS.compliance +
    components.responsiveness * COMPONENT_WEIGHTS.responsiveness +
    components.volume * COMPONENT_WEIGHTS.volume
  );

  const tier = computeTier(indexScore);

  // Upsert performance index — write-on-change only. `rank` is owned by the
  // batchReindex rank pass and is deliberately NOT part of this comparison
  // or payload.
  const indexCounters = options?.counters?.performance_index;
  if (indexCounters) indexCounters.rows_checked++;
  const storedIndex = (await prisma.agentPerformanceIndex.findUnique({
    where: { agent_id: agentId },
    select: { index_score: true, tier: true, components: true, months_included: true },
  })) as Record<string, unknown> | null;
  const materialIndex: Record<string, unknown> = {
    index_score: indexScore,
    tier,
    components,
    months_included: allMetrics.length,
  };
  const indexUnchanged =
    !!storedIndex &&
    Object.keys(materialIndex).every((key) => materialValuesEqual(materialIndex[key], storedIndex[key]));
  if (indexUnchanged) {
    if (indexCounters) indexCounters.rows_suppressed_unchanged++;
  } else {
    await prisma.agentPerformanceIndex.upsert({
      where: { agent_id: agentId },
      create: {
        agent_id: agentId,
        index_score: indexScore,
        tier,
        components: components as unknown as Prisma.InputJsonValue,
        months_included: allMetrics.length,
        last_computed: new Date(),
      },
      update: {
        index_score: indexScore,
        tier,
        components: components as unknown as Prisma.InputJsonValue,
        months_included: allMetrics.length,
        last_computed: new Date(),
      },
    });
    if (indexCounters) {
      if (storedIndex) {
        indexCounters.rows_materially_changed++;
        indexCounters.rows_updated++;
      } else {
        indexCounters.rows_inserted++;
      }
    }
  }

  return {
    agent_id: agentId,
    index_score: indexScore,
    rank: null, // computed in batch after all agents indexed
    tier,
    components,
    months_included: allMetrics.length,
  };
}

function aggregateComponents(metrics: MonthlyMetrics[]): PerformanceComponents {
  const validContact = metrics.filter(m => m.time_to_contact_avg !== null);
  const avgContact = validContact.length > 0
    ? validContact.reduce((s, m) => s + m.time_to_contact_avg!, 0) / validContact.length
    : null;

  const validConversion = metrics.filter(m => m.showings_to_offer_ratio !== null);
  const avgConversion = validConversion.length > 0
    ? validConversion.reduce((s, m) => s + m.showings_to_offer_ratio!, 0) / validConversion.length
    : null;

  const validCadence = metrics.filter(m => m.closing_cadence_days !== null);
  const avgCadence = validCadence.length > 0
    ? validCadence.reduce((s, m) => s + m.closing_cadence_days!, 0) / validCadence.length
    : null;

  const avgCompliance = metrics.reduce((s, m) => s + m.compliance_score, 0) / metrics.length;
  const avgResponse = metrics.reduce((s, m) => s + m.response_rate, 0) / metrics.length;
  const totalVolume = metrics.reduce((s, m) => s + m.deal_volume, 0);
  const avgVolume = totalVolume / metrics.length;

  return {
    time_to_contact: normalizeMetric('time_to_contact', avgContact),
    conversion: normalizeMetric('conversion', avgConversion),
    closing_speed: normalizeMetric('closing_speed', avgCadence),
    compliance: Math.round(avgCompliance),
    responsiveness: Math.round(avgResponse),
    volume: normalizeMetric('volume', avgVolume),
  };
}

function computeTier(score: number): Tier {
  if (score >= TIER_THRESHOLDS.platinum) return 'platinum';
  if (score >= TIER_THRESHOLDS.gold) return 'gold';
  if (score >= TIER_THRESHOLDS.silver) return 'silver';
  return 'bronze';
}

/**
 * Batch recompute all active agents, then assign ranks.
 */
export async function batchReindex(): Promise<{
  computed: number;
  write_paths: {
    agent_metrics: WritePathCounters;
    performance_index: WritePathCounters;
    rank: WritePathCounters;
  };
}> {
  const counters = {
    agent_metrics: newWritePathCounters(),
    performance_index: newWritePathCounters(),
    rank: newWritePathCounters(),
  };
  const agents = await prisma.agent.findMany({
    where: { status: 'active' },
    select: { id: true },
  });

  let computed = 0;
  for (const { id } of agents) {
    try {
      await computePerformanceIndex(id, { counters });
      computed++;
    } catch (err) {
      counters.performance_index.rows_failed++;
      console.warn(`[agent-performance] Failed to index agent ${id}:`, err);
    }
  }

  // Assign ranks based on index_score desc — write-on-change only.
  const ranked = await prisma.agentPerformanceIndex.findMany({
    orderBy: { index_score: 'desc' },
    select: { id: true, rank: true },
  });
  for (let i = 0; i < ranked.length; i++) {
    const nextRank = i + 1;
    counters.rank.rows_checked++;
    if (ranked[i].rank === nextRank) {
      counters.rank.rows_suppressed_unchanged++;
      continue;
    }
    try {
      await prisma.agentPerformanceIndex.update({
        where: { id: ranked[i].id },
        data: { rank: nextRank },
      });
      counters.rank.rows_materially_changed++;
      counters.rank.rows_updated++;
    } catch (err) {
      counters.rank.rows_failed++;
      console.warn(`[agent-performance] Rank write failed for index ${ranked[i].id}:`, err);
    }
  }

  return { computed, write_paths: counters };
}
