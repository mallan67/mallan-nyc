/**
 * Predictive Seller Readiness — Scoring Engine
 *
 * Weighted logistic scoring model using non-MLS public data signals.
 * Computes a 0-100 readiness score and A-F grade for each address.
 *
 * COMPLIANCE: Uses ONLY public data (ACRIS, DOB, DOF) and first-party behavior.
 * No MLS/IDX data is ever used in scoring.
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { SIGNAL_WEIGHTS } from './config';
import { gradeFromScore } from './types';
import type { SignalInput, ScoredResult, SignalType } from './types';
import { collectAcrisSignals } from './signals/acris';
import { collectDobSignals } from './signals/dob';
import { collectDofSignals } from './signals/dof-tax';
import { collectFirstPartySignals } from './signals/first-party';

/**
 * Score a seller lead by collecting all signals and computing weighted score.
 * Updates the SellerLead record and persists new signals.
 */
export async function scoreSellerLead(sellerLeadId: bigint): Promise<ScoredResult> {
  const lead = await prisma.sellerLead.findUniqueOrThrow({
    where: { id: sellerLeadId },
  });

  // 1. Collect signals from all sources
  const allSignals: SignalInput[] = [];

  // ACRIS signals (ownership, mortgage, equity)
  if (lead.bbl) {
    const acrisSignals = await collectAcrisSignals(lead.bbl);
    allSignals.push(...acrisSignals);
  }

  // DOB signals (permits, violations)
  if (lead.bbl || lead.bin) {
    const dobSignals = await collectDobSignals(lead.bbl || '', lead.bin);
    allSignals.push(...dobSignals);
  }

  // DOF signals (property tax burden — condos, townhouses, mixed-use)
  if (lead.bbl) {
    const dofSignals = await collectDofSignals(lead.bbl);
    allSignals.push(...dofSignals);
  }

  // First-party behavioral signals
  const firstPartySignals = await collectFirstPartySignals(sellerLeadId);
  allSignals.push(...firstPartySignals);

  // 2. Compute weighted score
  const result = computeScore(allSignals);

  // 3. Persist signals (replace old ones)
  await prisma.$transaction([
    // Delete old signals for this lead
    prisma.readinessSignal.deleteMany({
      where: {
        seller_lead_id: sellerLeadId,
        source: { in: ['acris', 'dob'] },
      },
    }),
    // Insert new signals
    ...allSignals
      .filter(s => s.source !== 'first_party') // first-party signals already persisted individually
      .map(s =>
        prisma.readinessSignal.create({
          data: {
            seller_lead_id: sellerLeadId,
            signal_type: s.signal_type,
            raw_value: s.raw_value,
            normalized: s.normalized,
            source: s.source,
            metadata: (s.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        })
      ),
    // Update lead score
    prisma.sellerLead.update({
      where: { id: sellerLeadId },
      data: {
        readiness_score: result.readiness_score,
        score_grade: result.score_grade,
        last_scored_at: new Date(),
      },
    }),
  ]);

  return result;
}

/**
 * Compute a weighted readiness score from collected signals.
 * Pure function — no DB access.
 */
export function computeScore(signals: SignalInput[]): ScoredResult {
  // Build a map of best signal per type
  const bestByType = new Map<SignalType, number>();
  for (const signal of signals) {
    const existing = bestByType.get(signal.signal_type) ?? 0;
    if (signal.normalized > existing) {
      bestByType.set(signal.signal_type, signal.normalized);
    }
  }

  // Weighted sum: each signal contributes its normalized value × weight
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [type, weight] of Object.entries(SIGNAL_WEIGHTS)) {
    const signalType = type as SignalType;
    const value = bestByType.get(signalType);
    if (value !== undefined) {
      weightedSum += value * weight;
      totalWeight += weight;
    }
  }

  // Scale to 0-100, accounting for missing signals
  // If we only have data for some signals, scale up proportionally
  // but cap the boost to prevent small data from inflating scores
  const coverage = totalWeight;
  const rawScore = coverage > 0 ? (weightedSum / coverage) * 100 : 0;

  // Apply coverage penalty: if we have < 50% of signals, reduce score
  const coverageFactor = Math.min(1.0, coverage / 0.5);
  const readiness_score = Math.round(rawScore * coverageFactor);

  return {
    readiness_score: Math.max(0, Math.min(100, readiness_score)),
    score_grade: gradeFromScore(readiness_score),
    signals,
  };
}

/**
 * Batch re-score stale leads.
 * Called by cron job. Returns count of leads re-scored.
 */
export async function batchRescore(batchSize: number = 50): Promise<number> {
  const staleThreshold = new Date();
  staleThreshold.setHours(staleThreshold.getHours() - 72);

  const staleLeads = await prisma.sellerLead.findMany({
    where: {
      status: { notIn: ['signed', 'declined'] },
      OR: [
        { last_scored_at: null },
        { last_scored_at: { lt: staleThreshold } },
      ],
    },
    orderBy: { last_scored_at: 'asc' },
    take: batchSize,
    select: { id: true },
  });

  let scored = 0;
  for (const lead of staleLeads) {
    try {
      await scoreSellerLead(lead.id);
      scored++;
    } catch (err) {
      console.warn(`[seller-readiness] Failed to score lead ${lead.id}:`, err);
    }
  }

  return scored;
}
