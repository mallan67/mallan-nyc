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
 */

import { isLeadExplicitlyInactive } from '@/lib/auth/lead-access';
import prisma from '@/lib/prisma';
import {
  resolveNurtureAnchorsBatch,
  verdictFromAnchor,
  CANONICAL_NURTURE_STAGES,
} from '@/lib/crm/nurture-due';
import { createNotification } from '@/lib/notifications/engine';
import { sendEmail } from '@/lib/email/sendgrid';
import { lifecycleTriggerEmail } from '@/lib/email/templates';

// ─── Trigger Types ─────────────────────────────────────────
export type TriggerType =
  | 'conviction_threshold'    // Lead conviction score crosses threshold
  | 'ghost_detected'          // Previously active lead goes silent
  | 'comparable_sale'         // Comparable listing sold above ask
  | 'market_window'           // Favorable market conditions detected
  | 'momentum_drop'           // Listing momentum score dropped significantly
  | 'inquiry_stale'           // Inquiry not followed up within hours
  | 'lease_expiring_180d'     // Tenant lease expires in ~6 months — send rent vs buy + sale listings
  | 'lease_expiring_90d'      // Tenant lease expires in ~3 months — send sale + rental (incl no-fee)
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
  // ── COOLDOWN, AND WHY NURTURE IS EXEMPT FROM THE GLOBAL ONE.
  //
  //    `last_executed_at` is a single column on the TRIGGER, not on the target, so this gate is
  //    per-trigger-global: it returns before any target is examined. For an event trigger that is
  //    a sensible rate limit. For a per-client relationship cadence it is a defect — with
  //    cooldown_hours at 2016 (~84 days), ONE client's report suppressed the nurture review of
  //    EVERY other client for twelve weeks. The per-target gate below (TriggerExecution) is the
  //    one that was always meant to carry per-client spacing, and it still does.
  //
  //    Nurture spacing itself is no longer a cooldown question at all: lib/crm/nurture-due.ts
  //    derives it from the report ledger, so TriggerExecution here only prevents one firing from
  //    alerting twice. It does not decide when a relationship report is due.
  if (trigger.trigger_type !== 'quarterly_nurture' && trigger.last_executed_at) {
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
    const actionResult = await executeAction(trigger.action_type, trigger.action_config as Record<string, unknown>, target);
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

  // Lifecycle/Crons Tier A P0 — uniform consent gate.
  // The 3 lease-expiring DEFAULT_TRIGGERS use action_type='email'. After
  // wiring the email executor, target leads must have given affirmative
  // consent (TCPA/CAN-SPAM column populated by the lead-capture forms)
  // before they receive a lifecycle nurture email. Matches the existing
  // `findQuarterlyNurtureTargets` pattern at line 309. Manually-added
  // leads or family-invite leads without `consent_captured_at` are
  // excluded — opt-out boundary at sendEmail() is a defense in depth,
  // not the primary gate.
  const candidates = await prisma.lead.findMany({
    where: {
      lease_end_date: { gte: windowStart, lte: windowEnd },
      pipeline_stage: { in: ['new', 'contacted', 'nurturing', 'active', 'showing'] },
      roles: { hasSome: ['renter', 'tenant'] },
      consent_captured_at: { not: null },
    },
    select: { id: true, lease_end_date: true, annual_income: true, credit_score_range: true, pre_approved: true },
  });

  return candidates.filter(c => c.lease_end_date).map((c) => {
    const daysToExpiry = Math.ceil((c.lease_end_date!.getTime() - Date.now()) / 86400000);
    const income = c.annual_income ? Number(c.annual_income) : null;
    const isBuyerCandidate = (income != null && income >= 80000) && (c.credit_score_range === 'excellent' || c.credit_score_range === 'good');
    return {
      type: 'lead',
      id: String(c.id),
      context: {
        trigger: `lease_expiring_${daysFromNow}d`,
        days_to_expiry: daysToExpiry,
        lease_end_date: c.lease_end_date!.toISOString(),
        is_buyer_candidate: isBuyerCandidate,
        milestone_days: daysFromNow,
      },
    };
  });
}

// ─── Quarterly Nurture Targets ────────────────────────────

async function findQuarterlyNurtureTargets(): Promise<
  { type: string; id: string; context: Record<string, unknown> }[]
> {
  // ── THE NURTURE CLOCK IS THE REPORT LEDGER, NOT THE CONTACT STAMP.
  //
  //    This finder used to select clients whose last contact was over 80 days old. That answered a
  //    different question than the one nurture asks. Any contact at all satisfied it — completing a
  //    follow-up task writes that stamp (app/api/crm/tasks/[id]/route.ts) — so an agent could push
  //    a client's nurture review out by 80 days without ever sending them anything. Meanwhile the
  //    record of reports actually sent, written by the canonical send route since Lane 3 Packet 1,
  //    had no reader at all.
  //
  //    Now: membership comes from the stage cohort, and DUE comes from lib/crm/nurture-due.ts.
  //
  //    THE COHORT IS THE CANONICAL NURTURE STATE, AND NOTHING ELSE.
  //
  //    This engine historically admitted four pipeline stages. Two revisions of this packet got the
  //    boundary wrong before landing here, and both are worth recording because they failed in
  //    opposite directions. The first held the canonical set EMPTY while still querying all four
  //    tokens and emitting unanchored baselines for every one — using the legacy predicate as the
  //    membership rule while claiming none had been chosen. The second kept the three legacy tokens
  //    in this query under the label "compatibility", so a legacy-stage client with a qualifying
  //    report still produced a due obligation; that was a second business rule wearing a
  //    compatibility label, and it let a client who had left Nurture — or had never been in it —
  //    carry a nurture cadence.
  //
  //    Current pipeline_stage answers whether the clock APPLIES; history answers when it STARTED.
  //    Those are different facts and only the first belongs in this predicate. How the legacy rows
  //    should be migrated is a question for the authorized production census.
  const cohort = await prisma.lead.findMany({
    where: {
      pipeline_stage: { in: [...CANONICAL_NURTURE_STAGES] },
      consent_captured_at: { not: null },
      nurture_paused: false,
    },
    select: {
      id: true,
      pipeline_stage: true,
      roles: true,
      agent_id: true,
      nurture_paused: true,
      preferences: { select: { neighborhoods: true } },
    },
  });

  // The neighbourhood requirement is a precondition of the report itself — it has nothing to send
  // without one — so it filters before the ledger read rather than after.
  const eligible = cohort.filter((c) => c.preferences && c.preferences.neighborhoods.length > 0);

  // ONE query for the whole cohort's anchors, and the cap lands on the ANSWER. The previous
  // `take: 50` sat on the candidate query, so fifty arbitrary rows were fetched and then filtered;
  // a client who was genuinely due could be crowded out by fifty who were not, every firing,
  // indefinitely. Capping the due list instead means the fifty processed are fifty real ones.
  const anchors = await resolveNurtureAnchorsBatch(eligible.map((c) => c.id));
  const now = new Date();

  const due: { type: string; id: string; context: Record<string, unknown> }[] = [];
  for (const c of eligible) {
    const anchor = anchors.get(String(c.id)) ?? { kind: 'unanchored' as const };
    const verdict = verdictFromAnchor(
      { id: c.id, nurture_paused: c.nurture_paused, pipeline_stage: c.pipeline_stage },
      anchor,
      now,
    );
    // 'not_applicable', 'scheduled' and 'paused' all produce nothing. 'unanchored' DOES produce an
    // agent action — the client is in Nurture and Mallan cannot prove when the cycle began, which
    // is a real thing to resolve and not a reason for silence. The membership check that used to
    // sit here now lives in verdictFromAnchor, so the single and batch paths cannot disagree.
    if (verdict.state !== 'due' && verdict.state !== 'unanchored') continue;
    due.push({
      type: 'lead',
      id: String(c.id),
      context: {
        trigger: 'quarterly_nurture',
        pipeline_stage: c.pipeline_stage,
        roles: c.roles,
        agent_id: c.agent_id ? String(c.agent_id) : null,
        neighborhoods: c.preferences!.neighborhoods,
        nurture_state: verdict.state,
        nurture_anchor_kind: anchor.kind,
        nurture_due_at: verdict.state === 'due' ? verdict.due_at.toISOString() : null,
      },
    });
    if (due.length >= 50) break;
  }
  return due;
}

// ─── Action Executor ───────────────────────────────────────
async function executeAction(
  actionType: string,
  actionConfig: Record<string, unknown>,
  target: { type: string; id: string; context: Record<string, unknown> }
): Promise<ActionExecutionResult> {
  // ── NURTURE_IS_AGENT_DIRECTED ────────────────────────────────────────────────────────────────────
  //
  // A nurture touch is the agent's judgement about a relationship, not a scheduled broadcast. Until
  // this guard, the daily cron self-seeded 'Quarterly Nurture Report' (action_type 'email'), selected up
  // to 50 clients, and sent a HARDCODED subject and body - the agent chose nothing, was told nothing,
  // and the seeded include_matching_listings/include_market_stats were never even read.
  //
  // THE COERCION LIVES HERE AND NOT ONLY IN DEFAULT_TRIGGERS because the seed is applied only when
  // lifecycleTrigger.count() === 0. Correcting the seed fixes a fresh database and leaves every existing
  // one sending exactly as before, since its stored row still says 'email'. A guard at the dispatch
  // cannot be out-voted by stored configuration.
  //
  // Target DETECTION is deliberately kept: findQuarterlyNurtureTargets still answers who is due. Only
  // the ACTION changes, from mailing the client to telling the responsible agent that a report is owed.
  // The agent then chooses the substantive report and sends it through
  // POST /api/crm/clients/[id]/report-send, which is what records a qualifying nurture touch.
  if (target.context.trigger === 'quarterly_nurture' && actionType === 'email') {
    actionType = 'agent_alert';
  }

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
      if (target.type === 'lead') {
        const lead = await prisma.lead.findUnique({
          where: { id: BigInt(target.id) },
          select: { agent_id: true, first_name: true, last_name: true },
        });
        if (lead?.agent_id) {
          const leadName = `${lead.first_name} ${lead.last_name}`;

          // -- THE NURTURE ALERT HAS TO BE SEEN TO BE AN ALERT.
          //
          //    Packet 1 stopped the automatic client email by coercing this trigger to
          //    'agent_alert'. The row it produced was durable and unreachable: with no channel set
          //    it took the schema default 'in_app', and the only rendered reader of agent
          //    notifications filters for channel 'alert' (app/api/crm/alerts/route.ts). The other
          //    reader, GET /api/crm/notifications, has no caller anywhere in this repository. So
          //    the obligation went somewhere no agent looks -- an inappropriate email traded for
          //    invisible work.
          //
          //    Three things were needed, not one. The channel, to be returned at all. The status
          //    'new', to be COUNTED -- the bell badge counts only that value, while the list shows
          //    anything unresolved, so a row can be visible and still leave the bell reading zero.
          //    And data, without which the row carries no entityType/entityId and the client
          //    workspace's own per-client alert lookup can never match it.
          //
          //    It goes through the canonical notification engine rather than writing the table
          //    directly, so the recipient's preferences apply. Eleven of twelve call sites in this
          //    repository still bypass that engine; the other ten are registered, not swept in.
          if (target.context.trigger === 'quarterly_nurture') {
            await createNotification({
              recipient_type: 'agent',
              recipient_id: lead.agent_id,
              channel: 'alert',
              status: 'new',
              type: 'nurture_due',
              title: generateNotificationTitle(target.context),
              body: generateNotificationBody(target.context, leadName),
              data: {
                severity: 'info',
                entityType: 'client',
                entityId: target.id,
                // Deliberately null: this repository has no established deep-link convention for a
                // client record, and inventing one risks shipping a dead button. entityType and
                // entityId are what the client workspace actually matches on.
                actionUrl: null,
                nurture_state: target.context.nurture_state ?? null,
                nurture_anchor_kind: target.context.nurture_anchor_kind ?? null,
              },
            });
            return { status: 'success', result: 'success' };
          }

          // Every other trigger keeps its existing shape verbatim. Converging them is a real
          // improvement and explicitly outside this packet's scope.
          await prisma.notification.create({
            data: {
              recipient_type: 'agent',
              recipient_id: lead.agent_id,
              type: target.context.trigger as string || 'system',
              title: generateNotificationTitle(target.context),
              body: generateNotificationBody(target.context, leadName),
            },
          });
          return { status: 'success', result: 'success' };
        }

        // An unassigned lead used to fall silently out of this branch. For nurture that is a client
        // with a live obligation and nobody to tell, which deserves a record rather than a dropped
        // counter.
        await prisma.auditEvent.create({
          data: {
            action: 'lifecycle_alert_undeliverable_no_agent',
            entity_type: 'lead',
            entity_id: target.id,
            user_type: 'system',
            user_id: null,
            changes: { trigger: (target.context.trigger as string) ?? null },
          },
        }).catch(() => {});
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
        select: { email: true, first_name: true, last_name: true, agent_id: true, status: true },
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

      // LIFECYCLE SUPPRESSION — the ONE choke point for client-facing lifecycle mail, rather than a
      // status predicate copied into every target finder. Placed before the body is built and before any
      // send, and it returns a non-success status so evaluateTrigger records NO TriggerExecution and the
      // cooldown does not advance as though a message went out.
      //
      // Only the 'email' action is gated. 'notification' and 'agent_alert' are agent-facing and stay live:
      // a deactivated client may still need follow-up, compliance work or retention review. This controls
      // communication TO the client, not the brokerage's awareness ABOUT them.
      if (isLeadExplicitlyInactive(lead.status)) {
        await prisma.auditEvent.create({
          data: {
            action: 'lifecycle_email_suppressed_inactive',
            entity_type: 'lead',
            entity_id: target.id,
            user_type: 'system',
            user_id: null,
            changes: { trigger: target.context.trigger as string ?? null, reason: 'lead_inactive' },
          },
        }).catch(() => {});
        return { status: 'suppressed', result: 'suppressed_inactive' };
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
    // crm_task action type can be implemented as needed
    default:
      console.log(`[Lifecycle] Action type '${actionType}' not yet implemented for target ${target.id}`);
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
      return `Lease expires in ~6 months — sent rent vs buy analysis`;
    case 'lease_expiring_90d':
      return `Lease expires in ~90 days — sent sale + rental options`;
    case 'lease_expiring_30d':
      return `Lease expires in ~30 days — urgency email sent`;
    case 'quarterly_nurture':
      // Was 'Quarterly market update sent'. After Lane 3 Packet 1 nothing is sent and the
      // agent is the one who must act, so that title described an event that no longer
      // happens. An alert that misreports its own cause is worse than a terse one.
      return context.nurture_state === 'unanchored'
        ? 'Nurture baseline required'
        : 'Client report due';
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
      return `${leadName || 'A tenant'}'s lease expires in ~6 months (${context.lease_end_date}). ${context.is_buyer_candidate ? 'They are a buyer conversion candidate — ' : ''}Auto-sent rent vs buy analysis with matching sale listings.`;
    case 'lease_expiring_90d':
      return `${leadName || 'A tenant'}'s lease expires in ~90 days. Auto-sent both sale and rental options (including no-fee rentals). Monitor their engagement to see which direction they lean.`;
    case 'lease_expiring_30d':
      return `${leadName || 'A tenant'}'s lease expires in ~30 days. Urgency email sent with latest options. Consider calling to schedule showings this week.`;
    case 'quarterly_nurture':
      return context.nurture_state === 'unanchored'
        ? (leadName || 'A client') + ' belongs in nurture, but Mallan has no record of when this nurture cycle began.'
        : (leadName || 'A client') + ' is due a nurture report.';
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
    // 'quarterly_nurture' has no lead-facing subject: it has no lead-facing email. Retired with
    // its body in lib/email/templates.ts. Falling through to the default is safe here because
    // the body builder throws before any subject is used.
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
  // ─── Lease Expiration Triggers ──────────────────────────
  {
    name: 'Lease Expiring — 6 Month Rent vs Buy',
    trigger_type: 'lease_expiring_180d',
    conditions: {},
    action_type: 'email',
    action_config: { include_rent_vs_buy: true, include_sale_listings: true },
    cooldown_hours: 720, // 30 days — don't re-send for this milestone
  },
  {
    name: 'Lease Expiring — 90 Day Sale + Rental Options',
    trigger_type: 'lease_expiring_90d',
    conditions: {},
    action_type: 'email',
    action_config: { include_sale_listings: true, include_rental_listings: true, include_no_fee: true },
    cooldown_hours: 720,
  },
  {
    name: 'Lease Expiring — 30 Day Urgency',
    trigger_type: 'lease_expiring_30d',
    conditions: {},
    action_type: 'email',
    action_config: { include_sale_listings: true, include_rental_listings: true, urgency: true },
    cooldown_hours: 720,
  },
  // ─── Quarterly Nurture ──────────────────────────────────
  {
    name: 'Quarterly Nurture Report',
    trigger_type: 'quarterly_nurture',
    conditions: {},
    action_type: 'agent_alert',  // NURTURE_IS_AGENT_DIRECTED
    action_config: { include_matching_listings: true, include_market_stats: true },
    cooldown_hours: 2016, // ~84 days (quarterly)
  },
];
