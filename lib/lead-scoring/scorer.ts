/**
 * Lead Scoring — compute lead quality score from multiple signals
 */

import prisma from '@/lib/prisma';

const SOURCE_SCORES: Record<string, number> = {
  referral: 90,
  website: 60,
  manual: 50,
  import: 30,
};

const STATUS_RECENCY_BONUS: Record<string, number> = {
  active: 20,
  contacted: 15,
  new: 10,
  closed: 0,
};

export interface LeadScoreResult {
  lead_id: bigint;
  score: number;
  grade: string;
  source_score: number;
  engagement_score: number;
  recency_score: number;
  fit_score: number;
}

/**
 * Compute lead score for a single lead.
 */
export async function scoreLeadById(leadId: bigint): Promise<LeadScoreResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      _count: {
        select: {
          showings: true,
          actions: true,
          intent_events: true,
          saved_searches: true,
        },
      },
      intent_profile: {
        select: { intent_strength: true },
      },
    },
  });

  if (!lead) throw new Error('Lead not found');

  // Source score (0-100)
  const sourceScore = SOURCE_SCORES[lead.source] ?? 40;

  // Engagement score (0-100) — from activity counts
  const showings = lead._count.showings;
  const actions = lead._count.actions;
  const events = lead._count.intent_events;
  const searches = lead._count.saved_searches;
  const engagementRaw = showings * 15 + actions * 5 + events * 3 + searches * 10;
  const engagementScore = Math.min(100, engagementRaw);

  // Recency score (0-100) — how recent is the lead
  const daysSinceUpdate = (Date.now() - lead.updated_at.getTime()) / (24 * 60 * 60 * 1000);
  const recencyScore = Math.max(0, Math.round(100 - daysSinceUpdate * 2)) + (STATUS_RECENCY_BONUS[lead.status] ?? 0);

  // Fit score (0-100) — from intent profile if exists
  const fitScore = lead.intent_profile?.intent_strength ?? 50;

  // Weighted composite
  const score = Math.min(100, Math.round(
    sourceScore * 0.15 +
    engagementScore * 0.35 +
    Math.min(100, recencyScore) * 0.25 +
    fitScore * 0.25
  ));

  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 45 ? 'C' : score >= 25 ? 'D' : 'F';

  // Persist
  await prisma.leadScore.upsert({
    where: { lead_id: leadId },
    create: {
      lead_id: leadId,
      score,
      grade,
      source_score: sourceScore,
      engagement_score: engagementScore,
      recency_score: Math.min(100, recencyScore),
      fit_score: fitScore,
      last_computed: new Date(),
    },
    update: {
      score,
      grade,
      source_score: sourceScore,
      engagement_score: engagementScore,
      recency_score: Math.min(100, recencyScore),
      fit_score: fitScore,
      last_computed: new Date(),
    },
  });

  return { lead_id: leadId, score, grade, source_score: sourceScore, engagement_score: engagementScore, recency_score: Math.min(100, recencyScore), fit_score: fitScore };
}

/**
 * Auto-assign a lead to the best available agent.
 */
export async function autoAssignLead(leadId: bigint): Promise<bigint | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { agent_id: true, source: true },
  });

  if (!lead || lead.agent_id) return lead?.agent_id ?? null; // Already assigned

  // Find eligible agents by assignment rules
  const rules = await prisma.leadAssignmentRule.findMany({
    where: { active: true },
    include: {
      agent: {
        select: { id: true, status: true },
      },
    },
    orderBy: { priority: 'desc' },
  });

  for (const rule of rules) {
    if (rule.agent.status !== 'active') continue;
    if (rule.current_month_count >= rule.max_leads_per_month) continue;

    // Assign to this agent
    await prisma.lead.update({
      where: { id: leadId },
      data: { agent_id: rule.agent.id },
    });

    // Increment counter
    await prisma.leadAssignmentRule.update({
      where: { id: rule.id },
      data: { current_month_count: { increment: 1 } },
    });

    return rule.agent.id;
  }

  return null;
}

/**
 * Batch score all leads.
 */
export async function batchScoreLeads(batchSize = 100): Promise<number> {
  const stale = new Date();
  stale.setHours(stale.getHours() - 24);

  const leads = await prisma.lead.findMany({
    where: {
      OR: [
        { lead_score: null },
        { lead_score: { last_computed: { lt: stale } } },
      ],
    },
    select: { id: true },
    take: batchSize,
  });

  let scored = 0;
  for (const { id } of leads) {
    try {
      await scoreLeadById(id);
      scored++;
    } catch (err) {
      console.warn(`[lead-scoring] Failed to score lead ${id}:`, err);
    }
  }

  return scored;
}
