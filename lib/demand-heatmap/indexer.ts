/**
 * Demand Indexer — computes demand score per neighborhood from signals
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { SIGNAL_WEIGHTS, COLLECTION_WINDOW_DAYS } from './config';
import type { DemandIndexResult, DemandSignalType, TrendDirection, SignalComponent } from './types';

/**
 * Compute demand index for a neighborhood using recent signals.
 */
export async function computeDemandIndex(neighborhood: string): Promise<DemandIndexResult> {
  const since = new Date();
  since.setDate(since.getDate() - COLLECTION_WINDOW_DAYS);

  const signals = await prisma.demandSignal.findMany({
    where: { neighborhood, collected_at: { gte: since } },
    orderBy: { collected_at: 'desc' },
  });

  // Group by signal_type, take most recent per type
  const bestByType = new Map<string, { normalized: number; value: number }>();
  for (const s of signals) {
    if (!bestByType.has(s.signal_type)) {
      bestByType.set(s.signal_type, { normalized: s.normalized, value: s.value });
    }
  }

  // Weighted sum
  const components: SignalComponent[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [type, weight] of Object.entries(SIGNAL_WEIGHTS)) {
    const data = bestByType.get(type);
    const normalized = data?.normalized ?? 0;
    const contribution = normalized * weight;
    weightedSum += contribution;
    totalWeight += weight;

    components.push({
      signal_type: type as DemandSignalType,
      value: data?.value ?? 0,
      normalized,
      weight,
      contribution,
    });
  }

  const score = totalWeight > 0
    ? Math.round((weightedSum / totalWeight) * 100)
    : 0;

  // Get previous score for trend
  const existing = await prisma.demandIndex.findUnique({ where: { neighborhood } });
  const prevScore = existing?.score ?? score;
  const delta = prevScore > 0 ? ((score - prevScore) / prevScore) * 100 : 0;
  const trend: TrendDirection = delta > 5 ? 'up' : delta < -5 ? 'down' : 'stable';
  const borough = signals[0]?.borough ?? existing?.borough ?? null;

  // Upsert the index
  await prisma.demandIndex.upsert({
    where: { neighborhood },
    create: {
      neighborhood,
      borough,
      score,
      trend,
      trend_delta: Math.round(delta * 100) / 100,
      components: components as unknown as Prisma.InputJsonValue,
      signal_count: signals.length,
      last_computed: new Date(),
    },
    update: {
      score,
      trend,
      trend_delta: Math.round(delta * 100) / 100,
      components: components as unknown as Prisma.InputJsonValue,
      signal_count: signals.length,
      last_computed: new Date(),
      borough: borough ?? undefined,
    },
  });

  return { neighborhood, borough, score, trend, trend_delta: delta, components, signal_count: signals.length };
}

/**
 * Batch reindex all neighborhoods that have demand signals.
 */
export async function batchReindex(): Promise<number> {
  const neighborhoods = await prisma.demandSignal.findMany({
    select: { neighborhood: true },
    distinct: ['neighborhood'],
  });

  let indexed = 0;
  for (const { neighborhood } of neighborhoods) {
    try {
      await computeDemandIndex(neighborhood);
      indexed++;
    } catch (err) {
      console.warn(`[demand-heatmap] Failed to index ${neighborhood}:`, err);
    }
  }

  return indexed;
}
