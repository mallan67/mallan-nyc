/**
 * Showing Scheduler — Feedback collection + intent bridge
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export interface FeedbackInput {
  showing_id: bigint;
  lead_id?: bigint;
  rating: number;
  interest_level: string;
  liked?: string[];
  disliked?: string[];
  objections?: string[];
  notes?: string;
  submitted_by?: string;
}

const VALID_INTEREST_LEVELS = [
  'not_interested', 'neutral', 'interested', 'very_interested', 'ready_to_offer',
];

export async function submitFeedback(input: FeedbackInput) {
  if (input.rating < 1 || input.rating > 5) {
    throw new Error('Rating must be 1-5');
  }
  if (!VALID_INTEREST_LEVELS.includes(input.interest_level)) {
    throw new Error(`interest_level must be one of: ${VALID_INTEREST_LEVELS.join(', ')}`);
  }

  const feedback = await prisma.showingFeedback.upsert({
    where: { showing_id: input.showing_id },
    create: {
      showing_id: input.showing_id,
      lead_id: input.lead_id ?? null,
      rating: input.rating,
      interest_level: input.interest_level,
      liked: input.liked ?? [],
      disliked: input.disliked ?? [],
      objections: input.objections ?? [],
      notes: input.notes ?? null,
      submitted_by: input.submitted_by ?? 'agent',
    },
    update: {
      rating: input.rating,
      interest_level: input.interest_level,
      liked: input.liked ?? [],
      disliked: input.disliked ?? [],
      objections: input.objections ?? [],
      notes: input.notes ?? null,
    },
  });

  // Bridge to buyer intent: record a showing_request event if lead exists
  if (input.lead_id) {
    try {
      await prisma.intentEvent.create({
        data: {
          lead_id: input.lead_id,
          event_type: 'showing_request',
          payload: {
            showing_id: input.showing_id.toString(),
            rating: input.rating,
            interest_level: input.interest_level,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Intent event is best-effort
    }
  }

  // Update showing status to completed if feedback submitted
  await prisma.showing.update({
    where: { id: input.showing_id },
    data: { status: 'completed' },
  });

  return feedback;
}

/**
 * Get feedback stats for an agent's showings.
 */
export async function getFeedbackStats(agentId: bigint) {
  const feedbacks = await prisma.showingFeedback.findMany({
    where: {
      showing: { agent_id: agentId },
    },
    select: {
      rating: true,
      interest_level: true,
    },
  });

  const total = feedbacks.length;
  if (total === 0) return { total: 0, avg_rating: 0, interest_breakdown: {} };

  const avgRating = Math.round(
    (feedbacks.reduce((s, f) => s + f.rating, 0) / total) * 10
  ) / 10;

  const interestBreakdown: Record<string, number> = {};
  for (const f of feedbacks) {
    interestBreakdown[f.interest_level] = (interestBreakdown[f.interest_level] || 0) + 1;
  }

  return { total, avg_rating: avgRating, interest_breakdown: interestBreakdown };
}
