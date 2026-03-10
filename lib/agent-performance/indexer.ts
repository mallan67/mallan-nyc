/**
 * Agent Performance Indexer — computes composite index + tier + rank
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { COMPONENT_WEIGHTS, TIER_THRESHOLDS, ROLLING_MONTHS } from './config';
import { computeMonthlyMetrics, normalizeMetric } from './calculator';
import type { PerformanceComponents, PerformanceIndexResult, Tier, MonthlyMetrics } from './types';

/**
 * Compute performance index for a single agent using rolling N-month window.
 */
export async function computePerformanceIndex(agentId: bigint): Promise<PerformanceIndexResult> {
  const now = new Date();
  const months: Date[] = [];
  for (let i = 0; i < ROLLING_MONTHS; i++) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }

  // Compute or fetch metrics for each month
  const allMetrics: MonthlyMetrics[] = [];
  for (const month of months) {
    const metrics = await computeMonthlyMetrics(agentId, month);

    // Persist monthly metrics
    const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    const monthDate = new Date(monthStr + '-01');
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

  // Upsert performance index
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
export async function batchReindex(): Promise<number> {
  const agents = await prisma.agent.findMany({
    where: { status: 'active' },
    select: { id: true },
  });

  let computed = 0;
  for (const { id } of agents) {
    try {
      await computePerformanceIndex(id);
      computed++;
    } catch (err) {
      console.warn(`[agent-performance] Failed to index agent ${id}:`, err);
    }
  }

  // Assign ranks based on index_score desc
  const ranked = await prisma.agentPerformanceIndex.findMany({
    orderBy: { index_score: 'desc' },
    select: { id: true },
  });
  for (let i = 0; i < ranked.length; i++) {
    await prisma.agentPerformanceIndex.update({
      where: { id: ranked[i].id },
      data: { rank: i + 1 },
    });
  }

  return computed;
}
