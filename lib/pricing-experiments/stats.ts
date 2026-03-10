/**
 * Dynamic Pricing Experiments — Statistical Analysis Engine
 *
 * Computes arm metrics, lift, and p-values for A/B experiments.
 * Uses two-proportion z-test for rate metrics and Welch's t-test approximation
 * for continuous metrics.
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { EVENT_WEIGHTS } from './config';
import type { ArmMetrics, ExperimentResult } from './types';

/**
 * Compute aggregate metrics for an experiment arm.
 */
export async function computeArmMetrics(armId: bigint): Promise<ArmMetrics> {
  const listings = await prisma.experimentListing.findMany({
    where: { arm_id: armId, withdrawn_at: null },
    select: { id: true },
  });

  const listingIds = listings.map(l => l.id);
  if (listingIds.length === 0) {
    return emptyMetrics();
  }

  const events = await prisma.engagementEvent.groupBy({
    by: ['event_type'],
    where: { experiment_listing_id: { in: listingIds } },
    _count: true,
    _sum: { value: true },
  });

  const counts: Record<string, number> = {};
  const sums: Record<string, number> = {};
  let total = 0;

  for (const e of events) {
    counts[e.event_type] = e._count;
    sums[e.event_type] = Number(e._sum.value ?? 0);
    total += e._count;
  }

  const pageViews = counts['page_view'] ?? 0;
  const inquiries = counts['inquiry'] ?? 0;
  const showingRequests = counts['showing_request'] ?? 0;
  const saves = counts['save_favorite'] ?? 0;
  const ctaClicks = counts['cta_click'] ?? 0;

  // Average time on page
  const timeCount = counts['time_on_page'] ?? 0;
  const timeSum = sums['time_on_page'] ?? 0;
  const avgTime = timeCount > 0 ? timeSum / timeCount : 0;

  return {
    listing_count: listingIds.length,
    page_views: pageViews,
    inquiries,
    showing_requests: showingRequests,
    saves,
    cta_clicks: ctaClicks,
    avg_time_on_page: Math.round(avgTime * 10) / 10,
    total_events: total,
    inquiry_rate: pageViews > 0 ? inquiries / pageViews : 0,
    showing_rate: pageViews > 0 ? showingRequests / pageViews : 0,
    save_rate: pageViews > 0 ? saves / pageViews : 0,
  };
}

/**
 * Compute lift percentages (treatment vs control).
 */
function computeLift(control: ArmMetrics, treatment: ArmMetrics) {
  const liftPct = (c: number, t: number) =>
    c > 0 ? ((t - c) / c) * 100 : (t > 0 ? 100 : 0);

  const rateLift = {
    inquiry_rate: liftPct(control.inquiry_rate, treatment.inquiry_rate),
    showing_rate: liftPct(control.showing_rate, treatment.showing_rate),
    save_rate: liftPct(control.save_rate, treatment.save_rate),
    avg_time_on_page: liftPct(control.avg_time_on_page, treatment.avg_time_on_page),
  };

  // Weighted composite lift
  const composite =
    rateLift.inquiry_rate * 0.35 +
    rateLift.showing_rate * 0.30 +
    rateLift.save_rate * 0.20 +
    rateLift.avg_time_on_page * 0.15;

  return { ...rateLift, composite: Math.round(composite * 100) / 100 };
}

/**
 * Two-proportion z-test.
 * Returns p-value for the difference between two proportions.
 */
function twoPropZTest(
  successes1: number, n1: number,
  successes2: number, n2: number
): number {
  if (n1 === 0 || n2 === 0) return 1;

  const p1 = successes1 / n1;
  const p2 = successes2 / n2;
  const pPool = (successes1 + successes2) / (n1 + n2);

  if (pPool === 0 || pPool === 1) return 1;

  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;

  const z = Math.abs(p1 - p2) / se;

  // Approximate two-tailed p-value using normal CDF
  return 2 * (1 - normalCDF(z));
}

/**
 * Approximate normal CDF using Abramowitz and Stegun formula.
 */
function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * z);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Evaluate a full experiment — compute metrics for both arms, lift, significance.
 */
export async function evaluateExperiment(experimentId: bigint): Promise<ExperimentResult> {
  const experiment = await prisma.pricingExperiment.findUniqueOrThrow({
    where: { id: experimentId },
    include: { arms: true },
  });

  const controlArm = experiment.arms.find(a => a.is_control);
  const treatmentArm = experiment.arms.find(a => !a.is_control);

  if (!controlArm || !treatmentArm) {
    throw new Error('Experiment must have exactly one control and one treatment arm');
  }

  const [controlMetrics, treatmentMetrics] = await Promise.all([
    computeArmMetrics(controlArm.id),
    computeArmMetrics(treatmentArm.id),
  ]);

  const lift = computeLift(controlMetrics, treatmentMetrics);

  // Primary metric: inquiry rate p-value
  const pValue = twoPropZTest(
    controlMetrics.inquiries, controlMetrics.page_views,
    treatmentMetrics.inquiries, treatmentMetrics.page_views
  );

  const threshold = Number(experiment.significance_threshold);
  const isSignificant = pValue < (1 - threshold);
  const sampleSize = controlMetrics.total_events + treatmentMetrics.total_events;

  return {
    control_metrics: controlMetrics,
    treatment_metrics: treatmentMetrics,
    lift,
    p_value: Math.round(pValue * 10000) / 10000,
    is_significant: isSignificant,
    sample_size: sampleSize,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Check if experiment has reached its target sample size.
 */
export async function shouldConclude(experimentId: bigint): Promise<boolean> {
  const experiment = await prisma.pricingExperiment.findUniqueOrThrow({
    where: { id: experimentId },
    include: { arms: { include: { _count: { select: { listings: true } } } } },
  });

  if (!experiment.target_sample_size) return false;

  const totalEvents = await prisma.engagementEvent.count({
    where: {
      experiment_listing: {
        arm: { experiment_id: experimentId },
        withdrawn_at: null,
      },
    },
  });

  return totalEvents >= experiment.target_sample_size;
}

/**
 * Aggregate and persist metrics on each arm's summary_metrics field.
 */
export async function aggregateExperimentMetrics(experimentId: bigint): Promise<void> {
  const arms = await prisma.experimentArm.findMany({
    where: { experiment_id: experimentId },
  });

  for (const arm of arms) {
    const metrics = await computeArmMetrics(arm.id);
    await prisma.experimentArm.update({
      where: { id: arm.id },
      data: { summary_metrics: metrics as unknown as Prisma.InputJsonValue },
    });
  }
}

function emptyMetrics(): ArmMetrics {
  return {
    listing_count: 0,
    page_views: 0,
    inquiries: 0,
    showing_requests: 0,
    saves: 0,
    cta_clicks: 0,
    avg_time_on_page: 0,
    total_events: 0,
    inquiry_rate: 0,
    showing_rate: 0,
    save_rate: 0,
  };
}
