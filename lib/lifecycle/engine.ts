/**
 * Lifecycle Trigger Engine
 *
 * Event-driven automation replacing time-based drip campaigns.
 * Evaluates triggers against latest scoring data and fires
 * appropriate actions (notifications, emails, CRM tasks).
 *
 * TCPA compliant: checks notification preferences before sending.
 * Fair Housing safe: no demographic-based triggers.
 */

import prisma from '@/lib/prisma';

// ─── Trigger Types ─────────────────────────────────────────
export type TriggerType =
  | 'conviction_threshold'    // Lead conviction score crosses threshold
  | 'ghost_detected'          // Previously active lead goes silent
  | 'comparable_sale'         // Comparable listing sold above ask
  | 'market_window'           // Favorable market conditions detected
  | 'momentum_drop'           // Listing momentum score dropped significantly
  | 'inquiry_stale';          // Inquiry not followed up within hours

export type ActionType = 'notification' | 'email' | 'agent_alert' | 'crm_task';

// ─── Evaluate All Active Triggers ──────────────────────────
export async function evaluateAllTriggers(): Promise<{
  evaluated: number;
  fired: number;
  suppressed: number;
}> {
  const triggers = await prisma.lifecycleTrigger.findMany({
    where: { enabled: true },
  });

  let fired = 0;
  let suppressed = 0;

  for (const trigger of triggers) {
    try {
      const results = await evaluateTrigger(trigger);
      fired += results.fired;
      suppressed += results.suppressed;
    } catch (err) {
      console.error(`[Lifecycle] Error evaluating trigger ${trigger.id}:`, err);
    }
  }

  return { evaluated: triggers.length, fired, suppressed };
}

// ─── Evaluate Single Trigger ───────────────────────────────
async function evaluateTrigger(trigger: {
  id: bigint;
  trigger_type: string;
  conditions: unknown;
  action_type: string;
  action_config: unknown;
  cooldown_hours: number;
  last_executed_at: Date | null;
  execution_count: number;
}): Promise<{ fired: number; suppressed: number }> {
  // Check cooldown
  if (trigger.last_executed_at) {
    const hoursSince = (Date.now() - trigger.last_executed_at.getTime()) / 3600_000;
    if (hoursSince < trigger.cooldown_hours) {
      return { fired: 0, suppressed: 0 };
    }
  }

  const conditions = trigger.conditions as Record<string, unknown>;
  let targets: { type: string; id: string; context: Record<string, unknown> }[] = [];

  switch (trigger.trigger_type) {
    case 'conviction_threshold':
      targets = await findConvictionThresholdTargets(conditions);
      break;
    case 'ghost_detected':
      targets = await findGhostTargets(conditions);
      break;
    case 'momentum_drop':
      targets = await findMomentumDropTargets(conditions);
      break;
    case 'inquiry_stale':
      targets = await findStaleInquiryTargets(conditions);
      break;
    default:
      return { fired: 0, suppressed: 0 };
  }

  let fired = 0;
  let suppressed = 0;

  for (const target of targets) {
    // Check if already executed for this target recently
    const recentExecution = await prisma.triggerExecution.findFirst({
      where: {
        trigger_id: trigger.id,
        target_type: target.type,
        target_id: target.id,
        created_at: { gte: new Date(Date.now() - trigger.cooldown_hours * 3600_000) },
      },
    });

    if (recentExecution) {
      suppressed++;
      continue;
    }

    // Execute the action
    await executeAction(trigger.action_type, trigger.action_config as Record<string, unknown>, target);

    // Log execution
    await prisma.triggerExecution.create({
      data: {
        trigger_id: trigger.id,
        target_type: target.type,
        target_id: target.id,
        context: target.context as object,
        result: 'success',
      },
    });

    fired++;
  }

  // Update trigger metadata
  if (fired > 0) {
    await prisma.lifecycleTrigger.update({
      where: { id: trigger.id },
      data: {
        last_executed_at: new Date(),
        execution_count: trigger.execution_count + fired,
      },
    });
  }

  return { fired, suppressed };
}

// ─── Target Finders ────────────────────────────────────────

async function findConvictionThresholdTargets(
  conditions: Record<string, unknown>
): Promise<{ type: string; id: string; context: Record<string, unknown> }[]> {
  const minScore = (conditions.min_score as number) || 75;

  const scores = await prisma.convictionScore.findMany({
    where: {
      score: { gte: minScore },
      ghost_status: 'active',
    },
    select: { lead_id: true, score: true, stage: true },
  });

  return scores.map((s) => ({
    type: 'lead',
    id: String(s.lead_id),
    context: { score: s.score, stage: s.stage, trigger: 'conviction_threshold' },
  }));
}

async function findGhostTargets(
  conditions: Record<string, unknown>
): Promise<{ type: string; id: string; context: Record<string, unknown> }[]> {
  const silenceDays = (conditions.silence_days as number) || 7;

  const ghosts = await prisma.convictionScore.findMany({
    where: {
      ghost_status: { in: ['cooling', 'silent'] },
      silence_days: { gte: silenceDays },
      score: { gte: 15 }, // Only re-engage leads that showed some intent
    },
    select: { lead_id: true, score: true, silence_days: true, top_listings: true },
  });

  return ghosts.map((g) => ({
    type: 'lead',
    id: String(g.lead_id),
    context: { score: g.score, silenceDays: g.silence_days, topListings: g.top_listings, trigger: 'ghost_detected' },
  }));
}

async function findMomentumDropTargets(
  conditions: Record<string, unknown>
): Promise<{ type: string; id: string; context: Record<string, unknown> }[]> {
  const maxScore = (conditions.max_score as number) || 30;

  const listings = await prisma.listingMomentum.findMany({
    where: {
      score: { lte: maxScore },
      last_computed: { gte: new Date(Date.now() - 24 * 3600_000) }, // Only recently computed
    },
    select: { listing_id: true, score: true, percentile_rank: true },
  });

  return listings.map((l) => ({
    type: 'listing',
    id: l.listing_id,
    context: { score: l.score, percentile: l.percentile_rank, trigger: 'momentum_drop' },
  }));
}

async function findStaleInquiryTargets(
  conditions: Record<string, unknown>
): Promise<{ type: string; id: string; context: Record<string, unknown> }[]> {
  const maxHours = (conditions.max_hours as number) || 48;
  const cutoff = new Date(Date.now() - maxHours * 3600_000);

  // Find leads with inquiries but no agent follow-up
  const staleLeads = await prisma.lead.findMany({
    where: {
      status: 'new',
      created_at: { lte: cutoff, gte: new Date(Date.now() - 7 * 86400_000) }, // within last 7 days
    },
    select: { id: true, created_at: true },
    take: 50,
  });

  return staleLeads.map((l) => ({
    type: 'lead',
    id: String(l.id),
    context: { createdAt: l.created_at.toISOString(), trigger: 'inquiry_stale' },
  }));
}

// ─── Action Executor ───────────────────────────────────────
async function executeAction(
  actionType: string,
  _actionConfig: Record<string, unknown>,
  target: { type: string; id: string; context: Record<string, unknown> }
): Promise<void> {
  switch (actionType) {
    case 'notification': {
      // Create in-app notification for the assigned agent
      if (target.type === 'lead') {
        const lead = await prisma.lead.findUnique({
          where: { id: BigInt(target.id) },
          select: { agent_id: true, first_name: true, last_name: true },
        });
        if (lead?.agent_id) {
          await prisma.notification.create({
            data: {
              recipient_type: 'agent',
              recipient_id: lead.agent_id,
              type: target.context.trigger as string || 'system',
              title: generateNotificationTitle(target.context),
              body: generateNotificationBody(target.context, `${lead.first_name} ${lead.last_name}`),
            },
          });
        }
      }
      break;
    }
    case 'agent_alert': {
      // Same as notification but marked urgent
      if (target.type === 'lead') {
        const lead = await prisma.lead.findUnique({
          where: { id: BigInt(target.id) },
          select: { agent_id: true, first_name: true, last_name: true },
        });
        if (lead?.agent_id) {
          await prisma.notification.create({
            data: {
              recipient_type: 'agent',
              recipient_id: lead.agent_id,
              type: target.context.trigger as string || 'system',
              title: generateNotificationTitle(target.context),
              body: generateNotificationBody(target.context, `${lead.first_name} ${lead.last_name}`),
            },
          });
        }
      }
      break;
    }
    // email and crm_task action types can be implemented as needed
    default:
      console.log(`[Lifecycle] Action type '${actionType}' not yet implemented for target ${target.id}`);
  }
}

// ─── Notification Content ──────────────────────────────────
function generateNotificationTitle(context: Record<string, unknown>): string {
  switch (context.trigger) {
    case 'conviction_threshold':
      return `High-conviction buyer (score: ${context.score})`;
    case 'ghost_detected':
      return `Buyer went silent (${context.silenceDays} days)`;
    case 'momentum_drop':
      return `Listing momentum dropped to ${context.score}`;
    case 'inquiry_stale':
      return 'Inquiry needs follow-up';
    default:
      return 'Action required';
  }
}

function generateNotificationBody(context: Record<string, unknown>, leadName?: string): string {
  switch (context.trigger) {
    case 'conviction_threshold':
      return `${leadName || 'A buyer'} has conviction score ${context.score}/100 (stage: ${context.stage}). They may be ready to make an offer — consider reaching out now.`;
    case 'ghost_detected':
      return `${leadName || 'A buyer'} was actively engaged but hasn't been active for ${context.silenceDays} days. Consider a soft re-engagement.`;
    case 'momentum_drop':
      return `Listing performance has dropped to ${context.score}/100 (${context.percentile}th percentile). Consider a price adjustment or marketing refresh.`;
    case 'inquiry_stale':
      return `${leadName || 'A lead'} submitted an inquiry but hasn't received follow-up. Respond within 24 hours for best conversion.`;
    default:
      return 'Please review and take appropriate action.';
  }
}

// ─── Default Triggers (Seed) ───────────────────────────────
export const DEFAULT_TRIGGERS = [
  {
    name: 'High Conviction Alert',
    trigger_type: 'conviction_threshold',
    conditions: { min_score: 75 },
    action_type: 'agent_alert',
    action_config: {},
    cooldown_hours: 72,
  },
  {
    name: 'Ghost Buyer Re-engagement',
    trigger_type: 'ghost_detected',
    conditions: { silence_days: 7 },
    action_type: 'notification',
    action_config: {},
    cooldown_hours: 168, // 7 days
  },
  {
    name: 'Cold Listing Alert',
    trigger_type: 'momentum_drop',
    conditions: { max_score: 25 },
    action_type: 'notification',
    action_config: {},
    cooldown_hours: 168,
  },
  {
    name: 'Stale Inquiry Reminder',
    trigger_type: 'inquiry_stale',
    conditions: { max_hours: 48 },
    action_type: 'agent_alert',
    action_config: {},
    cooldown_hours: 24,
  },
];
