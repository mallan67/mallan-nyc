/**
 * Lifecycle Trigger Engine
 *
 * Event-driven automation replacing time-based drip campaigns.
 * Evaluates triggers against latest scoring data and fires
 * appropriate actions (notifications, emails, CRM tasks).
 *
 * TCPA compliant: checks notification preferences before sending.
 * Fair Housing safe: no demographic-based triggers.
 *
 * Lifecycle/Crons Tier A P0 (2026-05-06):
 *   - action_type='email' previously created only an in-app agent
 *     notification — silent no-op vs. its declared name. Now wired
 *     to send a real email to the LEAD via the company channel,
 *     honoring the Email Tier A `last_unsubscribe_at` boundary
 *     check at lib/email/sendgrid.ts. Each fire emits an audit event:
 *       - lifecycle_email_sent                        (delivered)
 *       - lifecycle_email_suppressed_unsubscribed     (Tier A boundary)
 *       - lifecycle_email_send_failed                 (transient SMTP)
 *       - lifecycle_email_skipped_no_address          (lead has no email)
 *       - lifecycle_email_skipped_non_lead_target     (target.type !== 'lead')
 *
 * Lease workflow correction (2026-10-27):
 *   - The three lease_expiring_* triggers read the canonical tenancy (ActiveLease, status
 *     active, term ending inside the milestone window), not Lead.lease_end_date, and yield one
 *     target per party (landlord, and tenant when the tenancy links a client record).
 *   - They never email a client. Whatever action_type a stored trigger row carries, a lease
 *     target is executed as `crm_task`: an Agent-review checkpoint = Notification to the agent
 *     + FollowUpTask (renewal_check / buyer_conversion). The agent previews and confirms any
 *     outreach from the Lease Tracker. A client who unsubscribed or declined buying / selling
 *     outreach (Lead.nurture_paused) is flagged in the checkpoint, never solicited.
 */

import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email/sendgrid';
import { lifecycleTriggerEmail } from '@/lib/email/templates';
import { daysToExpiry } from '@/lib/crm/leases';

/** Trigger types whose targets are tenancies: agent checkpoints only, never a client email. */
export const LEASE_TRIGGER_TYPES: ReadonlySet<string> = new Set(['lease_expiring_180d', 'lease_expiring_90d', 'lease_expiring_30d']);

// ─── Trigger Types ─────────────────────────────────────────
export type TriggerType =
  | 'conviction_threshold'    // Lead conviction score crosses threshold
  | 'ghost_detected'          // Previously active lead goes silent
  | 'comparable_sale'         // Comparable listing sold above ask
  | 'market_window'           // Favorable market conditions detected
  | 'momentum_drop'           // Listing momentum score dropped significantly
  | 'inquiry_stale'           // Inquiry not followed up within hours
  | 'lease_expiring_180d'     // Tenant lease expires in ~6 months — send rent vs buy + sale listings
  | 'lease_expiring_90d'      // Tenant lease expires in ~3 months — agent checkpoint: suggest sale + rental listings; nothing is sent
  | 'lease_expiring_30d'      // Tenant lease expires in ~1 month — urgency reminder
  | 'quarterly_nurture'       // Quarterly report for nurture/future clients with matching listings
  | 'interest_drift'          // Client engagement shifted from stated preferences
  | 'new_match_client';       // New listing matches a client's saved preferences

export type ActionType = 'notification' | 'email' | 'agent_alert' | 'crm_task';

type ActionExecutionStatus = 'success' | 'suppressed' | 'skipped' | 'failed';

interface ActionExecutionResult {
  status: ActionExecutionStatus;
  result: string;
}

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
    case 'lease_expiring_180d':
      targets = await findLeaseExpiringTargets(180);
      break;
    case 'lease_expiring_90d':
      targets = await findLeaseExpiringTargets(90);
      break;
    case 'lease_expiring_30d':
      targets = await findLeaseExpiringTargets(30);
      break;
    case 'quarterly_nurture':
      targets = await findQuarterlyNurtureTargets();
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

    // Execute the action. Only a real success records triggerExecution and
    // advances cooldown; skipped/suppressed/failed paths audit separately.
    // A lease target is always an agent checkpoint (crm_task), whatever the stored action_type says.
    const effectiveAction = LEASE_TRIGGER_TYPES.has(trigger.trigger_type) ? 'crm_task' : trigger.action_type;
    const actionResult = await executeAction(effectiveAction, trigger.action_config as Record<string, unknown>, target);
    if (actionResult.status !== 'success') {
      suppressed++;
      continue;
    }

    // Log execution
    await prisma.triggerExecution.create({
      data: {
        trigger_id: trigger.id,
        target_type: target.type,
        target_id: target.id,
        context: target.context as object,
        result: actionResult.result,
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

/** The clients whose inquiry nobody has followed up: new OR active (a listing inquiry creates an active, assigned lead), no contact recorded, within the window. Exported for the end-to-end proof. */
export async function findStaleInquiryTargets(
  conditions: Record<string, unknown>
): Promise<{ type: string; id: string; context: Record<string, unknown> }[]> {
  const maxHours = (conditions.max_hours as number) || 48;
  const cutoff = new Date(Date.now() - maxHours * 3600_000);

  // Find leads with inquiries but no agent follow-up: a website lead ('new') or a listing inquiry ('active', assigned on arrival) that no agent
  // has contacted yet (last_contacted_at is stamped by the CRM when the agent records the contact).
  const staleLeads = await prisma.lead.findMany({
    where: {
      status: { in: ['new', 'active'] },
      last_contacted_at: null,
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

// ─── Lease Expiration Targets ──────────────────────────────

async function findLeaseExpiringTargets(
  daysFromNow: number
): Promise<{ type: string; id: string; context: Record<string, unknown> }[]> {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysFromNow);
  const windowStart = new Date(targetDate);
  windowStart.setDate(windowStart.getDate() - 7);
  const windowEnd = new Date(targetDate);
  windowEnd.setDate(windowEnd.getDate() + 7);

  // The canonical lease relationship is the tenancy (ActiveLease), not a date on the Lead row.
  // A tenancy whose term already ended is never a milestone target; an ended-but-open row is
  // surfaced by the Lease Tracker (ended_but_open) for the agent to record its outcome.
  const now = new Date();
  const from = windowStart.getTime() < now.getTime() ? now : windowStart;

  const partySelect = {
    id: true, first_name: true, last_name: true, agent_id: true, nurture_paused: true, last_unsubscribe_at: true,
  } as const;
  const leases = await prisma.activeLease.findMany({
    where: { status: 'active', lease_end_date: { gte: from, lte: windowEnd } },
    select: {
      id: true, address: true, unit: true, lease_end_date: true, monthly_rent: true,
      landlord_lead_id: true, tenant_lead_id: true, tenant_name: true, tenant_email: true, agent_id: true,
      landlord: { select: partySelect },
      tenant: { select: partySelect },
    },
    orderBy: { lease_end_date: 'asc' },
    take: 500,
  });

  const trigger = `lease_expiring_${daysFromNow}d`;
  const targets: { type: string; id: string; context: Record<string, unknown> }[] = [];
  for (const lease of leases) {
    const base = {
      trigger,
      lease_id: String(lease.id),
      address: lease.address,
      unit: lease.unit ?? null,
      monthly_rent: lease.monthly_rent == null ? null : Number(lease.monthly_rent),
      lease_end_date: lease.lease_end_date.toISOString(),
      days_to_expiry: daysToExpiry(lease.lease_end_date, now),
      milestone_days: daysFromNow,
      agent_id: lease.agent_id != null ? String(lease.agent_id) : null,
      landlord_lead_id: String(lease.landlord_lead_id),
      landlord_name: `${lease.landlord.first_name} ${lease.landlord.last_name}`.trim(),
      tenant_lead_id: lease.tenant_lead_id != null ? String(lease.tenant_lead_id) : null,
      tenant_name: lease.tenant ? `${lease.tenant.first_name} ${lease.tenant.last_name}`.trim() : (lease.tenant_name ?? null),
    };
    targets.push({
      type: 'lease_party',
      id: `${lease.id}:landlord`,
      context: {
        ...base,
        role: 'landlord',
        party_lead_id: String(lease.landlord_lead_id),
        declined_outreach: lease.landlord.nurture_paused === true,
        unsubscribed: lease.landlord.last_unsubscribe_at != null,
      },
    });
    targets.push({
      type: 'lease_party',
      id: `${lease.id}:tenant`,
      context: {
        ...base,
        role: 'tenant',
        party_lead_id: lease.tenant_lead_id != null ? String(lease.tenant_lead_id) : null,
        declined_outreach: lease.tenant?.nurture_paused === true,
        unsubscribed: lease.tenant?.last_unsubscribe_at != null,
      },
    });
  }
  return targets;
}

// ─── Lease checkpoint (Agent review, never a client email) ──

function checkpointPlan(context: Record<string, unknown>): { task_type: string; priority: string; due: Date; title: string; description: string } {
  const role = String(context.role);
  const milestone = Number(context.milestone_days) || 0;
  const days = Number(context.days_to_expiry);
  const unit = context.unit ? ` ${String(context.unit)}` : '';
  const where = `${String(context.address)}${unit}`;
  const declined = context.declined_outreach === true;
  const unsubscribed = context.unsubscribed === true;
  const priority = milestone <= 30 ? 'high' : milestone <= 90 ? 'medium' : 'low';
  const due = new Date(Date.now() + (milestone <= 30 ? 2 : milestone <= 90 ? 7 : 14) * 86400_000);
  const title = `Lease at ${where} ends in ${days} days — ${role} review`;
  const flags = [
    unsubscribed ? 'This client has unsubscribed from email: no email outreach.' : null,
    declined ? 'This client declined further buying / selling outreach: renewal and lease check-ins only.' : null,
  ].filter(Boolean).join(' ');
  if (role === 'landlord') {
    const tenant = context.tenant_name ? ` Tenant: ${String(context.tenant_name)}.` : '';
    const comps = declined ? '' : ' If appropriate, preview and send the 6-month property-value comps (sell inquiry) from the Lease Tracker.';
    return {
      task_type: 'renewal_check', priority, due, title,
      description: `${String(context.landlord_name)}'s tenancy at ${where} ends on ${String(context.lease_end_date).slice(0, 10)} (${milestone}-day checkpoint).${tenant} Confirm renewal, re-list or sale intent, then record the outcome (renewal = new term).${comps} Nothing has been sent to the client. ${flags}`.trim(),
    };
  }
  const buyer = !declined && !unsubscribed;
  return {
    task_type: buyer ? 'buyer_conversion' : 'renewal_check', priority, due, title,
    description: `${String(context.tenant_name ?? 'The tenant')}'s lease at ${where} ends on ${String(context.lease_end_date).slice(0, 10)} (${milestone}-day checkpoint). Confirm renewal or move plans.${buyer ? ' If appropriate, preview and send the rent-vs-buy outreach (buy inquiry) from the Lease Tracker.' : ''} Nothing has been sent to the client. ${flags}`.trim(),
  };
}

async function executeLeaseCheckpoint(
  target: { type: string; id: string; context: Record<string, unknown> }
): Promise<ActionExecutionResult> {
  const ctx = target.context;
  const partyLeadId = ctx.party_lead_id ? BigInt(String(ctx.party_lead_id)) : null;
  if (!partyLeadId) {
    // A tenant recorded only as name / email on the tenancy has no client record to attach a
    // task to; the landlord checkpoint for the same lease names the tenant.
    await prisma.auditEvent.create({
      data: {
        action: 'lifecycle_checkpoint_skipped_no_client_record',
        entity_type: 'active_lease', entity_id: String(ctx.lease_id), user_type: 'system', user_id: null,
        changes: { trigger: ctx.trigger as string ?? null, role: ctx.role as string ?? null },
      },
    }).catch(() => {});
    return { status: 'skipped', result: 'skipped_no_client_record' };
  }
  const lead = await prisma.lead.findUnique({ where: { id: partyLeadId }, select: { agent_id: true, first_name: true, last_name: true } });
  if (!lead) return { status: 'skipped', result: 'skipped_lead_not_found' };
  const agentId = ctx.agent_id ? BigInt(String(ctx.agent_id)) : lead.agent_id;
  if (!agentId) return { status: 'skipped', result: 'skipped_no_agent' };

  const plan = checkpointPlan(ctx);
  // Idempotent: one open checkpoint per party, milestone and tenancy
  const existing = await prisma.followUpTask.findFirst({
    where: { lead_id: partyLeadId, task_type: plan.task_type, status: 'pending', title: plan.title },
    select: { id: true },
  });
  let taskId = existing?.id ?? null;
  if (!existing) {
    const task = await prisma.followUpTask.create({
      data: {
        lead_id: partyLeadId, agent_id: agentId, title: plan.title, description: plan.description,
        due_date: plan.due, priority: plan.priority, status: 'pending', task_type: plan.task_type,
      },
      select: { id: true },
    });
    taskId = task.id;
    await prisma.notification.create({
      data: {
        recipient_type: 'agent', recipient_id: agentId, type: String(ctx.trigger ?? 'system'),
        title: plan.title, body: plan.description,
        data: { lease_id: String(ctx.lease_id), role: String(ctx.role), task_id: String(task.id), milestone_days: ctx.milestone_days ?? null },
      },
    });
  }
  await prisma.auditEvent.create({
    data: {
      action: existing ? 'lifecycle_checkpoint_exists' : 'lifecycle_checkpoint_created',
      entity_type: 'active_lease', entity_id: String(ctx.lease_id), user_type: 'system', user_id: null,
      changes: {
        trigger: ctx.trigger as string ?? null, role: ctx.role as string ?? null, party_lead_id: String(partyLeadId),
        task_id: taskId != null ? String(taskId) : null, task_type: plan.task_type,
        declined_outreach: ctx.declined_outreach === true, unsubscribed: ctx.unsubscribed === true, email_sent: false,
      },
    },
  }).catch(() => {});
  return { status: 'success', result: existing ? 'checkpoint_exists' : 'checkpoint_created' };
}

// ─── Quarterly Nurture Targets ────────────────────────────

async function findQuarterlyNurtureTargets(): Promise<
  { type: string; id: string; context: Record<string, unknown> }[]
> {
  // Find clients in nurture/past/new stages who haven't been contacted in 80+ days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 80);

  const nurtureCandidates = await prisma.lead.findMany({
    where: {
      pipeline_stage: { in: ['nurturing', 'past', 'new', 'contacted'] },
      consent_captured_at: { not: null },
      OR: [
        { last_contacted_at: { lte: cutoff } },
        { last_contacted_at: null },
      ],
    },
    select: {
      id: true,
      pipeline_stage: true,
      roles: true,
      last_contacted_at: true,
      agent_id: true,
      preferences: { select: { neighborhoods: true } },
    },
    take: 50,
  });

  return nurtureCandidates
    .filter((c) => c.preferences && c.preferences.neighborhoods.length > 0)
    .map((c) => ({
      type: 'lead',
      id: String(c.id),
      context: {
        trigger: 'quarterly_nurture',
        pipeline_stage: c.pipeline_stage,
        roles: c.roles,
        agent_id: c.agent_id ? String(c.agent_id) : null,
        neighborhoods: c.preferences!.neighborhoods,
        last_contacted: c.last_contacted_at?.toISOString() || null,
      },
    }));
}

// ─── Action Executor ───────────────────────────────────────
async function executeAction(
  actionType: string,
  actionConfig: Record<string, unknown>,
  target: { type: string; id: string; context: Record<string, unknown> }
): Promise<ActionExecutionResult> {
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
          return { status: 'success', result: 'success' };
        }
      }
      return { status: 'skipped', result: 'skipped_no_notification_target' };
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
          return { status: 'success', result: 'success' };
        }
      }
      return { status: 'skipped', result: 'skipped_no_notification_target' };
    }
    case 'email': {
      // ── Lifecycle/Crons Tier A P0 — real email send to the lead ──
      //
      // Recipient resolution: only `lead` targets get email. Other
      // target types (e.g. 'listing' from momentum_drop) skip with an
      // audit signal — the notification path handles those cases.
      //
      // Email send goes through lib/email/sendgrid.ts which honors:
      //   - Lead.last_unsubscribe_at (Email Tier A boundary check —
      //     non-transactional sends suppressed for unsubscribed leads)
      //   - SMTP fail-loud (returns _devMode=true if SMTP not configured)
      //
      // CAN-SPAM 15 USC 7704: lifecycle nurture emails are commercial.
      // Per-trigger consent enforcement is the target-finder's job
      // (e.g., findQuarterlyNurtureTargets already filters by
      // consent_captured_at: { not: null }). The send-side boundary
      // check is the safety net.
      if (target.type !== 'lead') {
        await prisma.auditEvent.create({
          data: {
            action: 'lifecycle_email_skipped_non_lead_target',
            entity_type: target.type,
            entity_id: target.id,
            user_type: 'system',
            user_id: null,
            changes: {
              trigger: target.context.trigger as string ?? null,
              target_type: target.type,
            },
          },
        }).catch(() => { /* audit failure must not block engine */ });
        return { status: 'skipped', result: 'skipped_non_lead_target' };
      }

      const lead = await prisma.lead.findUnique({
        where: { id: BigInt(target.id) },
        select: { email: true, first_name: true, last_name: true, agent_id: true },
      });
      if (!lead) {
        // Race: target found a moment ago but lead row is gone now.
        await prisma.auditEvent.create({
          data: {
            action: 'lifecycle_email_skipped_lead_not_found',
            entity_type: 'lead',
            entity_id: target.id,
            user_type: 'system',
            user_id: null,
            changes: { trigger: target.context.trigger as string ?? null },
          },
        }).catch(() => {});
        return { status: 'skipped', result: 'skipped_lead_not_found' };
      }

      const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'there';

      if (!lead.email) {
        // Skip safely + audit so the operator can see the count.
        await prisma.auditEvent.create({
          data: {
            action: 'lifecycle_email_skipped_no_address',
            entity_type: 'lead',
            entity_id: target.id,
            user_type: 'system',
            user_id: null,
            changes: {
              trigger: target.context.trigger as string ?? null,
              lead_name: leadName,
            },
          },
        }).catch(() => {});
        return { status: 'skipped', result: 'skipped_no_address' };
      }

      const subject = generateEmailSubject(target.context, actionConfig);
      const html = lifecycleTriggerEmail({
        leadName,
        trigger: target.context.trigger as string ?? 'system',
        urgency: actionConfig?.urgency === true,
        context: target.context,
      });

      const result = await sendEmail(
        lead.email,
        subject,
        html,
        undefined,
        { channel: 'company' }, // commercial; respects last_unsubscribe_at boundary
      );

      const action =
        result.success
          ? 'lifecycle_email_sent'
          : (result as { _suppressed?: boolean })._suppressed === true
            ? 'lifecycle_email_suppressed_unsubscribed'
            : 'lifecycle_email_send_failed';

      await prisma.auditEvent.create({
        data: {
          action,
          entity_type: 'lead',
          entity_id: target.id,
          user_type: 'system',
          user_id: null,
          changes: {
            trigger: target.context.trigger as string ?? null,
            success: result.success,
            message_id: result.messageId ?? null,
            recipient_email_domain: lead.email.split('@')[1] ?? null,
            error_class: result.success
              ? null
              : (result as { _suppressed?: boolean })._suppressed === true
                ? 'suppressed_unsubscribed'
                : (result as { _devMode?: boolean })._devMode === true
                  ? 'smtp_not_configured'
                  : 'send_failed',
          },
        },
      }).catch(() => {});
      if (result.success) {
        return { status: 'success', result: 'success' };
      }
      if ((result as { _suppressed?: boolean })._suppressed === true) {
        return { status: 'suppressed', result: 'suppressed_unsubscribed' };
      }
      return { status: 'failed', result: (result as { _devMode?: boolean })._devMode === true ? 'smtp_not_configured' : 'send_failed' };
    }
    case 'crm_task': {
      // Agent-review checkpoint: a FollowUpTask for the lead's agent plus an in-app notification.
      if (target.type === 'lease_party') return executeLeaseCheckpoint(target);
      if (target.type !== 'lead') return { status: 'skipped', result: 'skipped_non_lead_target' };
      const lead = await prisma.lead.findUnique({
        where: { id: BigInt(target.id) },
        select: { agent_id: true, first_name: true, last_name: true },
      });
      if (!lead?.agent_id) return { status: 'skipped', result: 'skipped_no_notification_target' };
      const title = generateNotificationTitle(target.context);
      const body = generateNotificationBody(target.context, `${lead.first_name} ${lead.last_name}`);
      const existing = await prisma.followUpTask.findFirst({
        where: { lead_id: BigInt(target.id), status: 'pending', title },
        select: { id: true },
      });
      if (!existing) {
        await prisma.followUpTask.create({
          data: {
            lead_id: BigInt(target.id), agent_id: lead.agent_id, title, description: body,
            due_date: new Date(Date.now() + 7 * 86400_000), priority: 'medium', status: 'pending', task_type: 'review',
          },
        });
        await prisma.notification.create({
          data: { recipient_type: 'agent', recipient_id: lead.agent_id, type: target.context.trigger as string || 'system', title, body },
        });
      }
      return { status: 'success', result: existing ? 'checkpoint_exists' : 'checkpoint_created' };
    }
    default:
      console.log(`[Lifecycle] Action type '${actionType}' not supported for target ${target.id}`);
      return { status: 'skipped', result: 'skipped_unsupported_action' };
  }
}

// executeMarketIntelEmail removed during Phase 1 cleanup.
// Full branded email send will be rebuilt inside the client workspace (Phase 5).
// For now, lease/nurture triggers create agent notifications instead of sending emails.

// ─── Notification Content ──────────────────────────────────
// (moved up — the old executeMarketIntelEmail block between here and generateNotificationTitle was deleted)

function generateNotificationTitle(context: Record<string, unknown>): string {
  const trigger = context.trigger as string || '';
  switch (trigger) {
    case 'conviction_threshold':
      return `High-conviction buyer (score: ${context.score})`;
    case 'ghost_detected':
      return `Buyer went silent (${context.silenceDays} days)`;
    case 'momentum_drop':
      return `Listing momentum dropped to ${context.score}`;
    case 'inquiry_stale':
      return 'Inquiry needs follow-up';
    case 'lease_expiring_180d':
      return `Lease expires in ~6 months — review (nothing sent)`;
    case 'lease_expiring_90d':
      return `Lease expires in ~90 days — review (nothing sent)`;
    case 'lease_expiring_30d':
      return `Lease expires in ~30 days — review (nothing sent)`;
    case 'quarterly_nurture':
      return `Quarterly market update sent`;
    case 'interest_drift':
      return `Client interest shifted — review engagement`;
    default:
      return 'Action required';
  }
}

function generateNotificationBody(context: Record<string, unknown>, leadName?: string): string {
  const trigger = context.trigger as string || '';
  switch (trigger) {
    case 'conviction_threshold':
      return `${leadName || 'A buyer'} has conviction score ${context.score}/100 (stage: ${context.stage}). They may be ready to make an offer — consider reaching out now.`;
    case 'ghost_detected':
      return `${leadName || 'A buyer'} was actively engaged but hasn't been active for ${context.silenceDays} days. Consider a soft re-engagement.`;
    case 'momentum_drop':
      return `Listing performance has dropped to ${context.score}/100 (${context.percentile}th percentile). Consider a price adjustment or marketing refresh.`;
    case 'inquiry_stale':
      return `${leadName || 'A lead'} submitted an inquiry but hasn't received follow-up. Respond within 24 hours for best conversion.`;
    case 'lease_expiring_180d':
      return `${leadName || 'A client'}'s lease ends in ~6 months (${String(context.lease_end_date ?? '').slice(0, 10)}). Review the tenancy; if appropriate, preview and send the rent-vs-buy or property-value outreach from the Lease Tracker. Nothing has been sent.`;
    case 'lease_expiring_90d':
      return `${leadName || 'A client'}'s lease ends in ~90 days. Confirm renewal, move or sale plans; preview and send any outreach from the Lease Tracker. Nothing has been sent.`;
    case 'lease_expiring_30d':
      return `${leadName || 'A client'}'s lease ends in ~30 days. Record the outcome (renewal = new term) and call to schedule next steps. Nothing has been sent.`;
    case 'quarterly_nurture':
      return `Sent quarterly market update to ${leadName || 'a client'} with matching listings in their preferred areas. Watch for engagement — if they click, consider moving them to Active.`;
    case 'interest_drift':
      return `${leadName || 'A client'}'s engagement pattern has shifted from their stated preferences. Review their recent activity and update their search criteria.`;
    default:
      return 'Please review and take appropriate action.';
  }
}

// ─── Email subject (lead-facing) ───────────────────────────
//
// Lifecycle/Crons Tier A P0: agent-facing notification titles
// (generateNotificationTitle above) are written for the broker's
// CRM dashboard. The lead-facing email subject must be customer-
// friendly. Keep these short, professional, and Fair-Housing-safe.
//
// `action_config.subject` (when set) takes precedence — brokers
// configuring custom triggers can override per-trigger.
function generateEmailSubject(
  context: Record<string, unknown>,
  actionConfig: Record<string, unknown>,
): string {
  if (typeof actionConfig?.subject === 'string' && actionConfig.subject.trim()) {
    return actionConfig.subject.trim();
  }
  const trigger = context.trigger as string || '';
  switch (trigger) {
    case 'lease_expiring_180d':
      return 'Your lease ends in ~6 months — let’s talk options';
    case 'lease_expiring_90d':
      return 'Your lease ends in ~90 days — explore your options';
    case 'lease_expiring_30d':
      return 'Your lease ends in ~30 days — let’s move quickly';
    case 'quarterly_nurture':
      return 'Quarterly market update from Mallan Real Estate';
    case 'conviction_threshold':
      return 'A note from your Mallan Real Estate agent';
    case 'ghost_detected':
      return 'Checking in — anything we can help with?';
    default:
      return 'An update from your Mallan Real Estate agent';
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
  // ─── Lease Expiration Checkpoints (agent review; the agent previews and confirms any email) ──
  {
    name: 'Lease Expiring — 6 Month Review',
    trigger_type: 'lease_expiring_180d',
    conditions: {},
    action_type: 'crm_task',
    action_config: { suggest_rent_vs_buy: true, suggest_property_value: true },
    cooldown_hours: 720, // 30 days — one checkpoint per milestone
  },
  {
    name: 'Lease Expiring — 90 Day Review',
    trigger_type: 'lease_expiring_90d',
    conditions: {},
    action_type: 'crm_task',
    action_config: { suggest_sale_listings: true, suggest_rental_listings: true },
    cooldown_hours: 720,
  },
  {
    name: 'Lease Expiring — 30 Day Review',
    trigger_type: 'lease_expiring_30d',
    conditions: {},
    action_type: 'crm_task',
    action_config: { urgency: true },
    cooldown_hours: 720,
  },
  // ─── Quarterly Nurture ──────────────────────────────────
  {
    name: 'Quarterly Nurture Report',
    trigger_type: 'quarterly_nurture',
    conditions: {},
    action_type: 'email',
    action_config: { include_matching_listings: true, include_market_stats: true },
    cooldown_hours: 2016, // ~84 days (quarterly)
  },
];
